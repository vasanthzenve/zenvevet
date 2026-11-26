package com.doctorvet.security;

import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enterprise Token & Session Service
 * Supports signed Bearer tokens, Refresh Token Rotation, RBAC, and Token Blacklisting.
 */
@Service
public class TokenService {

    // Secret key for HMAC signing, initialized securely with environment / vault support
    private static final byte[] SECRET_KEY;
    static {
        byte[] keyBytes = null;
        try {
            String configuredSecret = System.getenv("JWT_SECRET");
            if (configuredSecret == null || configuredSecret.isBlank()) {
                configuredSecret = System.getenv("TOKEN_SECRET");
            }
            if (configuredSecret == null || configuredSecret.isBlank()) {
                configuredSecret = System.getProperty("zenve.jwt.secret");
            }
            if (configuredSecret != null && !configuredSecret.isBlank()) {
                MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
                keyBytes = sha256.digest(configuredSecret.getBytes(StandardCharsets.UTF_8));
            } else {
                // Fallback to secure deterministic system seed so tokens remain valid across server restarts
                String seed = System.getProperty("user.name", "zenve") + "_zenve_jwt_secret_vault_hmac_2026";
                MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
                keyBytes = sha256.digest(seed.getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            keyBytes = new byte[32];
            new SecureRandom().nextBytes(keyBytes);
        }
        SECRET_KEY = keyBytes;
    }

    public record DoctorSession(
            Long doctorId,
            String name,
            String email,
            String role,
            long createdAt,
            long expiresAt
    ) {
        public DoctorSession(Long doctorId, String name, String email, long createdAt, long expiresAt) {
            this(doctorId, name, email, "DOCTOR", createdAt, expiresAt);
        }
    }

    public record RefreshSession(
            String refreshToken,
            Long doctorId,
            String role,
            long createdAt,
            long expiresAt,
            boolean revoked
    ) {}

    // In-memory token stores:
    // Access token -> DoctorSession
    private final Map<String, DoctorSession> activeSessions = new ConcurrentHashMap<>();
    // Refresh token -> RefreshSession
    private final Map<String, RefreshSession> refreshSessions = new ConcurrentHashMap<>();
    // Blacklisted tokens -> expiration timestamp
    private final Map<String, Long> blacklistedTokens = new ConcurrentHashMap<>();

    // 24 hours access token validity
    private static final long EXPIRATION_TIME_MS = 24 * 60 * 60 * 1000L;
    // 30 days refresh token validity
    private static final long REFRESH_EXPIRATION_TIME_MS = 30L * 24 * 60 * 60 * 1000L;

    /**
     * Generate a signed Bearer access token with default DOCTOR role.
     */
    public String generateToken(Long doctorId, String name, String email) {
        return generateToken(doctorId, name, email, "DOCTOR");
    }

    /**
     * Generate a signed Bearer access token with explicit Role.
     */
    public String generateToken(Long doctorId, String name, String email, String role) {
        long now = System.currentTimeMillis();
        long expiresAt = now + EXPIRATION_TIME_MS;
        String assignedRole = role != null ? role.toUpperCase() : "DOCTOR";

        String payload = doctorId + ":" + (email != null ? email : "") + ":" + assignedRole + ":" + now + ":" + UUID.randomUUID();
        String signature = hmacSha256(payload);
        String token = "zenve_" + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8))
                + "." + signature;

        activeSessions.put(token, new DoctorSession(doctorId, name, email, assignedRole, now, expiresAt));
        return token;
    }

    /**
     * Generate a new Refresh Token for a user.
     */
    public String generateRefreshToken(Long doctorId, String role) {
        long now = System.currentTimeMillis();
        long expiresAt = now + REFRESH_EXPIRATION_TIME_MS;
        String assignedRole = role != null ? role.toUpperCase() : "DOCTOR";

        String payload = "rt_" + doctorId + "_" + now + "_" + UUID.randomUUID();
        String signature = hmacSha256(payload);
        String refreshToken = "zenve_rt_" + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8))
                + "." + signature;

        refreshSessions.put(refreshToken, new RefreshSession(refreshToken, doctorId, assignedRole, now, expiresAt, false));
        return refreshToken;
    }

    public record RotationResult(
            boolean success,
            String newAccessToken,
            String newRefreshToken,
            Long doctorId,
            String role,
            String errorMessage
    ) {}

    /**
     * Rotate Refresh Token (Zero-trust single-use refresh token rotation).
     * If an already revoked refresh token is presented (reuse attack),
     * revokes ALL sessions for that user immediately as a defensive measure.
     */
    public RotationResult rotateRefreshToken(String oldRefreshToken, String name, String email) {
        if (oldRefreshToken == null || !refreshSessions.containsKey(oldRefreshToken)) {
            return new RotationResult(false, null, null, null, null, "Invalid refresh token");
        }

        RefreshSession session = refreshSessions.get(oldRefreshToken);

        // Security check: Reuse detection!
        if (session.revoked()) {
            // Compromise detected! Revoke all tokens for this user.
            invalidateAllForDoctor(session.doctorId());
            return new RotationResult(false, null, null, session.doctorId(), session.role(),
                    "Security alert: Refresh token reuse detected. All active sessions have been terminated.");
        }

        // Expiration check
        if (System.currentTimeMillis() > session.expiresAt()) {
            refreshSessions.remove(oldRefreshToken);
            return new RotationResult(false, null, null, session.doctorId(), session.role(), "Refresh token has expired");
        }

        // Revoke the old refresh token
        refreshSessions.put(oldRefreshToken, new RefreshSession(
                session.refreshToken(), session.doctorId(), session.role(), session.createdAt(), session.expiresAt(), true
        ));

        // Generate fresh access token and fresh refresh token
        String newAccessToken = generateToken(session.doctorId(), name, email, session.role());
        String newRefreshToken = generateRefreshToken(session.doctorId(), session.role());

        return new RotationResult(true, newAccessToken, newRefreshToken, session.doctorId(), session.role(), null);
    }

    /**
     * Validate access token, checking expiration and blacklisting.
     */
    public boolean validateToken(String token) {
        if (token == null || !token.startsWith("zenve_") || !token.contains(".")) {
            return false;
        }

        if (isBlacklisted(token)) {
            return false;
        }

        DoctorSession session = activeSessions.get(token);
        if (session == null) {
            return false;
        }

        if (System.currentTimeMillis() > session.expiresAt()) {
            activeSessions.remove(token);
            return false;
        }

        return true;
    }

    /**
     * Get the authenticated doctor's ID from token.
     */
    
    public Long resolveDoctorId(jakarta.servlet.http.HttpServletRequest request) {
        if (request == null) return null;
        Object attr = request.getAttribute("authenticatedDoctorId");
        if (attr instanceof Long l) return l;
        if (attr instanceof Number n) return n.longValue();

        String auth = request.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            String token = auth.substring(7).trim();
            if (validateToken(token)) {
                return getDoctorIdFromToken(token);
            }
        }
        return null;
    }

    public Long getDoctorIdFromToken(String token) {
        if (!validateToken(token)) {
            return null;
        }
        DoctorSession session = activeSessions.get(token);
        return session != null ? session.doctorId() : null;
    }

    /**
     * Get session details.
     */
    public DoctorSession getSession(String token) {
        if (!validateToken(token)) {
            return null;
        }
        return activeSessions.get(token);
    }

    /**
     * Invalidate and blacklist token on sign out.
     */
    public void invalidateToken(String token) {
        if (token != null) {
            activeSessions.remove(token);
            blacklistedTokens.put(token, System.currentTimeMillis() + EXPIRATION_TIME_MS);
        }
    }

    public boolean isBlacklisted(String token) {
        if (token == null) return false;
        Long expiry = blacklistedTokens.get(token);
        if (expiry == null) return false;
        if (System.currentTimeMillis() > expiry) {
            blacklistedTokens.remove(token);
            return false;
        }
        return true;
    }

    /**
     * Invalidate all sessions for a specific doctor.
     */
    public void invalidateAllForDoctor(Long doctorId) {
        if (doctorId != null) {
            activeSessions.entrySet().removeIf(entry -> {
                if (entry.getValue().doctorId().equals(doctorId)) {
                    blacklistedTokens.put(entry.getKey(), System.currentTimeMillis() + EXPIRATION_TIME_MS);
                    return true;
                }
                return false;
            });
            refreshSessions.entrySet().removeIf(entry -> entry.getValue().doctorId().equals(doctorId));
        }
    }

    /**
     * Periodic cleanup of expired entries.
     */
    public void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        activeSessions.entrySet().removeIf(e -> e.getValue().expiresAt() < now);
        refreshSessions.entrySet().removeIf(e -> e.getValue().expiresAt() < now);
        blacklistedTokens.entrySet().removeIf(e -> e.getValue() < now);
    }

    private String hmacSha256(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(SECRET_KEY, "HmacSHA256"));
            byte[] rawHmac = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(rawHmac);
        } catch (Exception e) {
            throw new RuntimeException("Failed to calculate HMAC-SHA256", e);
        }
    }
}
