package com.doctorvet.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Enterprise-grade Servlet Filter to detect and block all unauthorized access
 * to Git repositories, environment files, backups, database dumps, logs,
 * private keys, and sensitive hidden files.
 *
 * Configured at HIGHEST_PRECEDENCE to intercept every incoming request before
 * any static resource handler, Tomcat dispatcher, or Spring MVC controller.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SensitiveFileSecurityFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(SensitiveFileSecurityFilter.class);

    // 1. Git & Version Control Repositories Pattern (block .git, .svn, .hg, .bzr, and all internals like HEAD, config, index)
    private static final Pattern GIT_AND_VCS_PATTERN = Pattern.compile(
            "(?i)(?:^|/|\\\\)\\.(git|svn|hg|bzr)(?:$|/|\\\\|\\.)"
    );

    // 2. Environment Variables & Secret Configuration Files
    private static final Pattern ENV_AND_SECRETS_PATTERN = Pattern.compile(
            "(?i)(?:^|/|\\\\)\\.env(?:\\.[a-zA-Z0-9_-]+)*$"
    );

    // 3. Sensitive File Extensions (DB dumps, backups, private keys, logs, archives, scripts, source maps)
    private static final Pattern SENSITIVE_EXTENSIONS_PATTERN = Pattern.compile(
            "(?i)\\.(sql|bak|backup|dump|dmp|tar|gz|tgz|bz2|7z|rar|zip|log|key|pem|crt|cer|p12|pfx|jks|keystore|db|sqlite|sqlite3|ini|cfg|conf|sh|bash|bat|cmd|ps1|class|java|py|dockerfile|env)$"
    );

    // 4. Critical Specific Filenames
    private static final Pattern SENSITIVE_FILENAMES_PATTERN = Pattern.compile(
            "(?i)(?:^|/|\\\\)(wp-config\\.php|database\\.yml|database\\.json|web\\.config|id_rsa|id_dsa|id_ed25519|credentials\\.json|secret\\.txt|service-account.*\\.json|master\\.key)$"
    );

    // 5. Path Traversal Pattern (e.g. /../, \..\, /..;)
    private static final Pattern PATH_TRAVERSAL_PATTERN = Pattern.compile(
            "(?:\\.\\./|\\.\\.\\\\|/\\.\\.|\\\\\\.\\.)"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String rawUri = request.getRequestURI();
        if (rawUri == null) {
            rawUri = "/";
        }

        // Decode URL to catch encoded attacks (e.g. %2e%2egit%2fconfig or %2eenv)
        String decodedUri = rawUri;
        try {
            decodedUri = URLDecoder.decode(rawUri, StandardCharsets.UTF_8);
            // Double decode check for nested evasion attempts (%252e)
            if (decodedUri.contains("%")) {
                decodedUri = URLDecoder.decode(decodedUri, StandardCharsets.UTF_8);
            }
        } catch (Exception ignored) {
            // If malformed URL encoding, use original rawUri
        }

        // Normalize separators
        String normalizedUri = decodedUri.replace('\\', '/').replaceAll("/+", "/");
        String lowerUri = normalizedUri.toLowerCase(Locale.ROOT);

        // Security Check 1: Path Traversal
        if (PATH_TRAVERSAL_PATTERN.matcher(normalizedUri).find() || normalizedUri.contains("/../") || normalizedUri.endsWith("/..")) {
            blockAccess(request, response, "Path traversal sequence detected", rawUri);
            return;
        }

        // Security Check 2: Git & VCS Repository Internals
        if (GIT_AND_VCS_PATTERN.matcher(normalizedUri).find()) {
            blockAccess(request, response, "Git/VCS metadata access attempt", rawUri);
            return;
        }

        // Security Check 3: Environment files (.env, .env.local, .env.production, etc.)
        if (ENV_AND_SECRETS_PATTERN.matcher(normalizedUri).find() || lowerUri.contains("/.env")) {
            blockAccess(request, response, "Environment configuration access attempt", rawUri);
            return;
        }

        // Security Check 4: Sensitive Hidden Directories/Files (e.g. /.ssh/, /.aws/, /.config/, /.DS_Store)
        // Allow /.well-known/ for standard SSL/TLS domain verification
        if (lowerUri.contains("/.") && !lowerUri.contains("/.well-known/")) {
            // Check if any path segment starts with '.'
            String[] segments = lowerUri.split("/");
            for (String segment : segments) {
                if (segment.startsWith(".") && !segment.equals(".") && !segment.equals("..") && !segment.equalsIgnoreCase(".well-known")) {
                    blockAccess(request, response, "Hidden file/directory access attempt: " + segment, rawUri);
                    return;
                }
            }
        }

        // Security Check 5: Sensitive Filenames
        if (SENSITIVE_FILENAMES_PATTERN.matcher(normalizedUri).find()) {
            blockAccess(request, response, "Sensitive credential/config file access attempt", rawUri);
            return;
        }

        // Security Check 6: Sensitive File Extensions (DB dumps, backups, logs, certs, keys)
        // Note: Do not block regular API routes; check extension after last '.'
        int lastSlash = normalizedUri.lastIndexOf('/');
        String filename = lastSlash >= 0 ? normalizedUri.substring(lastSlash + 1) : normalizedUri;
        if (filename.contains(".")) {
            if (SENSITIVE_EXTENSIONS_PATTERN.matcher(filename).find()) {
                blockAccess(request, response, "Sensitive file extension access attempt: " + filename, rawUri);
                return;
            }
        }

        // Safe request - proceed to next filter
        filterChain.doFilter(request, response);
    }

    private void blockAccess(HttpServletRequest request,
                             HttpServletResponse response,
                             String reason,
                             String uri) throws IOException {
        String clientIp = resolveClientIp(request);
        String userAgent = request.getHeader("User-Agent");

        log.warn("[SECURITY_ALERT] BLOCKED sensitive file/Git leak attempt: reason='{}', URI='{}', clientIP='{}', userAgent='{}'",
                reason, uri, clientIp, userAgent != null ? userAgent : "Unknown");

        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

        String jsonResponse = "{\"status\":403,\"error\":\"Forbidden\",\"message\":\"Access denied. Access to this resource is prohibited by server security policy.\"}";
        response.getWriter().write(jsonResponse);
        response.getWriter().flush();
    }

    private String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
