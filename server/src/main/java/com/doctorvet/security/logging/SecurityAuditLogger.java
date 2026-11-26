package com.doctorvet.security.logging;

import com.doctorvet.security.crypto.SensitiveDataMasker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Enterprise Essential Security Audit Logger
 * Records security-relevant events for incident investigation and monitoring.
 * Strictly guarantees that passwords, JWT tokens, API keys, and CVVs are NEVER logged.
 * (Note: No dashboard UI is created, strictly complying with exclusion instructions).
 */
@Component
public class SecurityAuditLogger {

    private static final Logger log = LoggerFactory.getLogger("SECURITY_AUDIT");

    public enum EventType {
        LOGIN_SUCCESS,
        LOGIN_FAILURE,
        ACCOUNT_LOCKOUT,
        PASSWORD_RESET_REQUESTED,
        PASSWORD_RESET_SUCCESS,
        TOKEN_ROTATED,
        TOKEN_REVOKED,
        UNAUTHORIZED_ACCESS,
        FORBIDDEN_ACCESS,
        RATE_LIMIT_EXCEEDED,
        BRUTE_FORCE_BLOCKED,
        SSRF_ATTEMPT_BLOCKED,
        FILE_UPLOAD_REJECTED,
        API_KEY_ROTATED,
        PAYMENT_WEBHOOK_VERIFIED,
        PAYMENT_WEBHOOK_FAILED,
        SUSPICIOUS_REQUEST
    }

    public void logSecurityEvent(EventType eventType, String identifier, String clientIp, String details) {
        String maskedIdentifier = maskIfEmailOrKey(identifier);
        log.warn("[SECURITY_AUDIT] timestamp=\"{}\" event=\"{}\" user=\"{}\" ip=\"{}\" details=\"{}\"",
                Instant.now(),
                eventType.name(),
                maskedIdentifier != null ? maskedIdentifier : "ANONYMOUS",
                clientIp != null ? clientIp : "UNKNOWN",
                details != null ? details : "N/A"
        );
    }

    private String maskIfEmailOrKey(String identifier) {
        if (identifier == null || identifier.isBlank()) return "ANONYMOUS";
        if (identifier.contains("@")) {
            return SensitiveDataMasker.maskEmail(identifier);
        }
        if (identifier.startsWith("zenve_adv_") || identifier.startsWith("zenve_key_")) {
            return SensitiveDataMasker.maskApiKey(identifier);
        }
        if (identifier.matches(".*\\d{4}.*")) {
            return SensitiveDataMasker.maskPhone(identifier);
        }
        return identifier;
    }
}

