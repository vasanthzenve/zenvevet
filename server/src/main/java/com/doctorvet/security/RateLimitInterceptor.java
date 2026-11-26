package com.doctorvet.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Intercepts incoming HTTP requests to enforce distributed sliding-window rate
 * limits.
 * Returns HTTP 429 Too Many Requests with Retry-After header upon violation.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimitService rateLimitService;

    public RateLimitInterceptor(RateLimitService rateLimitService) {
        this.rateLimitService = rateLimitService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        // Universal Enterprise Security Headers
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "SAMEORIGIN");
        response.setHeader("X-XSS-Protection", "1; mode=block");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
        response.setHeader("Content-Security-Policy",
                "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws: wss: https:; frame-ancestors 'self';");
        response.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String path = request.getRequestURI();
        String method = request.getMethod();
        String clientIp = extractClientIp(request);

        // Check if authenticated user ID is attached
        Object authDocId = request.getAttribute("authenticatedDoctorId");
        String userOrIpKey = (authDocId != null) ? "user:" + authDocId : "ip:" + clientIp;

        // Categorize endpoint
        RateLimitService.LimitType limitType = resolveLimitType(path, method);
        String rateLimitKey = limitType.name() + ":" + userOrIpKey;

        RateLimitService.RateLimitResult result = rateLimitService.checkRateLimit(rateLimitKey, limitType);

        // Set standard rate limit headers
        response.setHeader("X-RateLimit-Limit", String.valueOf(result.limit()));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(result.remaining()));
        response.setHeader("X-RateLimit-Reset", String.valueOf(result.resetEpochMs()));

        if (!result.allowed()) {
            response.setStatus(429); // 429 Too Many Requests
            response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");

            String json = String.format(
                    "{\"error\":\"Too Many Requests\",\"message\":\"Rate limit exceeded for %s. Please retry in %d seconds.\",\"status\":429,\"retryAfterSeconds\":%d}",
                    limitType.name(), result.retryAfterSeconds(), result.retryAfterSeconds());
            response.getWriter().write(json);
            response.getWriter().flush();
            return false;
        }

        return true;
    }

    private RateLimitService.LimitType resolveLimitType(String path, String method) {
        if (path.contains("/auth/send-login-otp") || path.contains("/auth/send-otp") || path.contains("/auth/forgot-password")
                || path.contains("/auth/verify-otp") || path.contains("/auth/verify-code")) {
            return RateLimitService.LimitType.AUTH_OTP;
        }
        if (path.contains("/payments")) {
            return RateLimitService.LimitType.PAYMENT_API;
        }
        if (path.contains("/auth/login") || path.contains("/auth/sign-in")) {
            return RateLimitService.LimitType.AUTH_LOGIN;
        }
        if (path.contains("/auth/register") || path.contains("/auth/signup")) {
            return RateLimitService.LimitType.AUTH_REGISTER;
        }
        if (path.contains("/search")) {
            return RateLimitService.LimitType.SEARCH;
        }
        if (path.contains("/chat/messages") && "POST".equalsIgnoreCase(method)) {
            return RateLimitService.LimitType.CHAT_MESSAGE;
        }
        // Voting / Liking / Reactions on posts, cases, reels, or stories must be LIKE_FOLLOW (generous limit), NEVER POST_CREATE!
        if ((path.contains("/vote") || path.contains("/like") || path.contains("/reaction") || path.contains("/connections")) && "POST".equalsIgnoreCase(method)) {
            return RateLimitService.LimitType.LIKE_FOLLOW;
        }
        // Comments
        if (path.contains("/comments") && "POST".equalsIgnoreCase(method)) {
            return RateLimitService.LimitType.COMMENT;
        }
        // Actual post / case / reel creation
        if ((path.contains("/feed") || path.contains("/posts")) && "POST".equalsIgnoreCase(method)) {
            return RateLimitService.LimitType.POST_CREATE;
        }
        if (path.contains("/feed")) {
            return RateLimitService.LimitType.FEED;
        }
        return RateLimitService.LimitType.GENERAL;
    }

    private String extractClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            // First entry in CSV is client IP
            String[] parts = xForwardedFor.split(",");
            return parts[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isBlank()) {
            return xRealIp.trim();
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "127.0.0.1";
    }
}
