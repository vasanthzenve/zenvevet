package com.doctorvet.controller;

import com.doctorvet.model.PaymentTransaction;
import com.doctorvet.repository.PaymentTransactionRepository;
import com.doctorvet.security.TokenService;
import com.doctorvet.security.payment.PaymentSecurityService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments")
@CrossOrigin(originPatterns = "*")
public class PaymentController {

    private final PaymentSecurityService paymentSecurityService;
    private final PaymentTransactionRepository paymentRepo;
    private final TokenService tokenService;

    public PaymentController(
            PaymentSecurityService paymentSecurityService,
            PaymentTransactionRepository paymentRepo,
            TokenService tokenService) {
        this.paymentSecurityService = paymentSecurityService;
        this.paymentRepo = paymentRepo;
        this.tokenService = tokenService;
    }

    public record CreateOrderReq(BigDecimal amount, String currency, String description, Long targetId) {}
    public record VerifyPaymentReq(String orderId, String paymentId, String signature) {}
    public record RefundReq(String transactionId, String reason) {}

    @PostMapping("/create-order")
    public ResponseEntity<?> createOrder(
            @RequestBody CreateOrderReq req,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest request) {

        Long authId = tokenService.resolveDoctorId(request);
        if (authId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to initiate payments"));
        }

        try {
            PaymentTransaction tx = paymentSecurityService.createPaymentOrder(
                    authId,
                    "DOCTOR",
                    req.amount(),
                    req.currency(),
                    idempotencyKey,
                    req.description()
            );

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "orderId", tx.getOrderId(),
                    "transactionId", tx.getTransactionId(),
                    "amount", tx.getAmount(),
                    "currency", tx.getCurrency(),
                    "status", tx.getStatus()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Bad Request", "message", e.getMessage()));
        }
    }

    @PostMapping("/webhook")
    public ResponseEntity<?> handleGatewayWebhook(
            @RequestBody String rawPayload,
            @RequestHeader(value = "X-Zenve-Signature", required = false) String signatureHeader,
            @RequestHeader(value = "X-Request-Timestamp", required = false) String timestampHeader,
            @RequestHeader(value = "X-Request-Nonce", required = false) String nonceHeader) {

        if (!paymentSecurityService.verifyWebhookSignature(rawPayload, signatureHeader)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Invalid HMAC signature"));
        }

        if (timestampHeader != null) {
            try {
                long ts = Long.parseLong(timestampHeader);
                if (!paymentSecurityService.validateReplayProtection(ts, nonceHeader)) {
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                            .body(Map.of("error", "Replay Detected", "message", "Webhook event timestamp outside allowable window"));
                }
            } catch (NumberFormatException ignored) {}
        }

        return ResponseEntity.ok(Map.of("received", true, "status", "PROCESSED"));
    }

    @GetMapping("/transactions")
    public ResponseEntity<?> getMyTransactions(HttpServletRequest request) {
        Long authId = tokenService.resolveDoctorId(request);
        if (authId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        List<PaymentTransaction> list = paymentRepo.findByUserIdAndUserTypeOrderByCreatedAtDesc(authId, "DOCTOR");
        return ResponseEntity.ok(list);
    }
}

