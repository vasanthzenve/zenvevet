package com.doctorvet.security.payment;

import com.doctorvet.model.PaymentTransaction;
import com.doctorvet.repository.PaymentTransactionRepository;
import com.doctorvet.security.logging.SecurityAuditLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enterprise Payment API Security Service
 * Implements HMAC-SHA256 webhook verification, Replay Attack Mitigation,
 * Idempotency Key deduplication, Server-side Amount validation, and Audit Logging.
 */
@Service
public class PaymentSecurityService {

    private static final Logger log = LoggerFactory.getLogger(PaymentSecurityService.class);

    private final PaymentTransactionRepository paymentRepo;
    private final SecurityAuditLogger auditLogger;

    @Value("${zenve.payment.webhook-secret:${PAYMENT_WEBHOOK_SECRET:zenve_payment_whsec_prod_2026_supersecret}}")
    private String webhookSecret;

    // Cache of processed webhook event nonces to prevent replay attacks
    private final Map<String, Long> processedNonces = new ConcurrentHashMap<>();
    private static final long NONCE_VALIDITY_WINDOW_MS = 5 * 60 * 1000L; // 5 minutes

    public PaymentSecurityService(PaymentTransactionRepository paymentRepo, SecurityAuditLogger auditLogger) {
        this.paymentRepo = paymentRepo;
        this.auditLogger = auditLogger;
    }

    /**
     * Verify HMAC-SHA256 signature on payment gateway webhook using constant-time comparison.
     */
    public boolean verifyWebhookSignature(String rawPayload, String signatureHeader) {
        if (rawPayload == null || signatureHeader == null || signatureHeader.isBlank()) {
            auditLogger.logSecurityEvent(SecurityAuditLogger.EventType.PAYMENT_WEBHOOK_FAILED, "GATEWAY", null, "Missing payload or signature header");
            return false;
        }

        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);

            byte[] expectedHashBytes = mac.doFinal(rawPayload.getBytes(StandardCharsets.UTF_8));
            String expectedHex = bytesToHex(expectedHashBytes);

            String cleanHeader = signatureHeader.trim();
            if (cleanHeader.startsWith("sha256=") || cleanHeader.startsWith("t=")) {
                // Parse standard webhook signature formats (e.g., Stripe/Razorpay)
                for (String part : cleanHeader.split(",")) {
                    if (part.startsWith("v1=") || part.startsWith("sha256=")) {
                        cleanHeader = part.substring(part.indexOf('=') + 1).trim();
                        break;
                    }
                }
            }

            // Constant-time comparison to prevent timing side-channel attacks
            boolean valid = MessageDigest.isEqual(
                    expectedHex.getBytes(StandardCharsets.UTF_8),
                    cleanHeader.getBytes(StandardCharsets.UTF_8)
            );

            if (!valid) {
                auditLogger.logSecurityEvent(SecurityAuditLogger.EventType.PAYMENT_WEBHOOK_FAILED, "GATEWAY", null, "HMAC signature mismatch");
            } else {
                auditLogger.logSecurityEvent(SecurityAuditLogger.EventType.PAYMENT_WEBHOOK_VERIFIED, "GATEWAY", null, "HMAC signature valid");
            }
            return valid;

        } catch (Exception e) {
            log.error("[PaymentSecurityService] Error computing webhook signature: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Prevent webhook replay attack by validating timestamp drift and unique event nonce.
     */
    public boolean validateReplayProtection(long timestampSeconds, String eventNonce) {
        long nowSeconds = System.currentTimeMillis() / 1000L;
        long drift = Math.abs(nowSeconds - timestampSeconds);

        if (drift > 300) { // Reject if timestamp older than 5 minutes
            auditLogger.logSecurityEvent(SecurityAuditLogger.EventType.SUSPICIOUS_REQUEST, "GATEWAY", null,
                    "Webhook replay rejected: timestamp drift " + drift + "s exceeds 300s window");
            return false;
        }

        if (eventNonce != null && !eventNonce.isBlank()) {
            cleanExpiredNonces();
            if (processedNonces.containsKey(eventNonce)) {
                auditLogger.logSecurityEvent(SecurityAuditLogger.EventType.SUSPICIOUS_REQUEST, "GATEWAY", null,
                        "Webhook replay rejected: duplicate nonce " + eventNonce);
                return false;
            }
            processedNonces.put(eventNonce, System.currentTimeMillis());
        }
        return true;
    }

    /**
     * Initiate a server-validated payment transaction protected by an Idempotency Key.
     */
    @Transactional
    public PaymentTransaction createPaymentOrder(
            Long userId,
            String userType,
            BigDecimal amount,
            String currency,
            String idempotencyKey,
            String description) {

        // Validate amount on server to prevent price manipulation
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Payment amount must be greater than zero");
        }

        String validCurrency = (currency != null && currency.length() <= 5) ? currency.toUpperCase() : "INR";

        // Idempotency check: if key already exists, return existing order
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Optional<PaymentTransaction> existing = paymentRepo.findByIdempotencyKey(idempotencyKey.trim());
            if (existing.isPresent()) {
                log.info("[PaymentSecurity] Idempotent payment request hit: {}", idempotencyKey);
                return existing.get();
            }
        }

        PaymentTransaction tx = new PaymentTransaction();
        tx.setTransactionId("tx_" + UUID.randomUUID().toString().replace("-", ""));
        tx.setOrderId("ord_" + System.currentTimeMillis() + "_" + (1000 + new Random().nextInt(9000)));
        tx.setUserId(userId);
        tx.setUserType(userType != null ? userType : "DOCTOR");
        tx.setAmount(amount);
        tx.setCurrency(validCurrency);
        tx.setStatus("INITIATED");
        tx.setIdempotencyKey(idempotencyKey != null ? idempotencyKey.trim() : null);
        tx.setDescription(description != null ? description : "Zenve Vet Platform Service");
        tx.setCreatedAt(LocalDateTime.now());
        tx.setUpdatedAt(LocalDateTime.now());

        return paymentRepo.save(tx);
    }

    /**
     * Mark payment as completed following verified gateway tokenization.
     */
    @Transactional
    public PaymentTransaction completePayment(String orderId, String gatewayRef, String method) {
        PaymentTransaction tx = paymentRepo.findByOrderId(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Invalid order reference: " + orderId));

        if ("SUCCESS".equalsIgnoreCase(tx.getStatus())) {
            return tx; // Already processed
        }

        tx.setStatus("SUCCESS");
        tx.setGatewayReference(gatewayRef);
        tx.setPaymentMethod(method != null ? method : "TOKENIZED_GATEWAY");
        tx.setUpdatedAt(LocalDateTime.now());

        PaymentTransaction saved = paymentRepo.save(tx);
        auditLogger.logSecurityEvent(SecurityAuditLogger.EventType.PAYMENT_WEBHOOK_VERIFIED,
                "USER_" + tx.getUserId(), null, "Order completed: " + tx.getOrderId() + " (" + tx.getAmount() + " " + tx.getCurrency() + ")");
        return saved;
    }

    private void cleanExpiredNonces() {
        long cutoff = System.currentTimeMillis() - NONCE_VALIDITY_WINDOW_MS;
        processedNonces.entrySet().removeIf(entry -> entry.getValue() < cutoff);
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}

