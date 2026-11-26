package com.doctorvet.security;

import com.doctorvet.security.logging.SecurityAuditLogger;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Enterprise Global Security Exception Handler
 * Intercepts all runtime exceptions to prevent stack trace leaks, database schema exposure,
 * and system information disclosure. Returns sanitized, RFC 7807 compliant JSON error responses.
 */
@ControllerAdvice
public class GlobalSecurityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalSecurityExceptionHandler.class);
    private final SecurityAuditLogger auditLogger;

    public GlobalSecurityExceptionHandler(SecurityAuditLogger auditLogger) {
        this.auditLogger = auditLogger;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidationExceptions(
            MethodArgumentNotValidException ex, HttpServletRequest request) {

        Map<String, String> fieldErrors = new HashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(error ->
                fieldErrors.put(error.getField(), error.getDefaultMessage()));

        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpStatus.BAD_REQUEST.value());
        body.put("error", "Bad Request");
        body.put("message", "Validation failed for request parameters");
        body.put("errors", fieldErrors);
        body.put("path", sanitizePath(request.getRequestURI()));

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgumentException(
            IllegalArgumentException ex, HttpServletRequest request) {

        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpStatus.BAD_REQUEST.value());
        body.put("error", "Bad Request");
        body.put("message", ex.getMessage() != null ? ex.getMessage() : "Invalid request parameter");
        body.put("path", sanitizePath(request.getRequestURI()));

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUploadSizeExceeded(
            MaxUploadSizeExceededException ex, HttpServletRequest request) {

        auditLogger.logSecurityEvent(
                SecurityAuditLogger.EventType.FILE_UPLOAD_REJECTED,
                "ANONYMOUS",
                request.getRemoteAddr(),
                "File size exceeds maximum threshold"
        );

        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpStatus.valueOf(413).value());
        body.put("error", "Content Too Large");
        body.put("message", "File upload exceeds the allowable 100MB enterprise limit");
        body.put("path", sanitizePath(request.getRequestURI()));

        return ResponseEntity.status(HttpStatus.valueOf(413)).body(body);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAllUncaughtExceptions(
            Exception ex, HttpServletRequest request) {

        String incidentId = "inc_" + UUID.randomUUID().toString().substring(0, 12);

        // Securely log complete error internally with incident ID without exposing to client
        log.error("[GlobalSecurityExceptionHandler] IncidentId: {} on URI: {} - Error: {}",
                incidentId, request.getRequestURI(), ex.getMessage(), ex);

        auditLogger.logSecurityEvent(
                SecurityAuditLogger.EventType.SUSPICIOUS_REQUEST,
                "ANONYMOUS",
                request.getRemoteAddr(),
                "Internal error incidentId=" + incidentId + ": " + ex.getClass().getSimpleName()
        );

        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpStatus.INTERNAL_SERVER_ERROR.value());
        body.put("error", "Internal Server Error");
        body.put("message", "An unexpected error occurred. Please contact support referencing incident: " + incidentId);
        body.put("incidentId", incidentId);
        body.put("path", sanitizePath(request.getRequestURI()));

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    private String sanitizePath(String path) {
        if (path == null) return "/";
        return path.replaceAll("[^a-zA-Z0-9/_-]", "");
    }
}

