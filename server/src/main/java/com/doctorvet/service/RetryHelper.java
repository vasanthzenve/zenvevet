package com.doctorvet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Predicate;
import java.util.function.Supplier;

/**
 * Enterprise Controlled Retry Service with Exponential Backoff and Full Random Jitter.
 * Prevents retry storms and strictly prevents duplicate writes through idempotency verification.
 */
@Service
public class RetryHelper {

    private static final Logger log = LoggerFactory.getLogger(RetryHelper.class);

    public record RetryConfig(
            int maxAttempts,
            long initialDelayMs,
            long maxDelayMs,
            double backoffMultiplier
    ) {
        public static RetryConfig defaultConfig() {
            return new RetryConfig(3, 200L, 3000L, 2.0);
        }
    }

    // In-memory idempotency registry (Idempotency Key -> Result)
    private final Map<String, Object> idempotencyStore = new ConcurrentHashMap<>();

    /**
     * Execute an idempotent operation with exponential backoff and jitter.
     */
    public <T> T executeWithRetry(
            String operationName,
            Supplier<T> action,
            Predicate<Throwable> isRetryable
    ) {
        return executeWithRetry(operationName, action, isRetryable, RetryConfig.defaultConfig(), null);
    }

    /**
     * Execute an idempotent operation with explicit idempotency key to prevent duplicate writes.
     */
    @SuppressWarnings("unchecked")
    public <T> T executeWithRetry(
            String operationName,
            Supplier<T> action,
            Predicate<Throwable> isRetryable,
            RetryConfig config,
            String idempotencyKey
    ) {
        // 1. Idempotency safeguard: if key was already processed, return cached result immediately
        if (idempotencyKey != null && idempotencyStore.containsKey(idempotencyKey)) {
            log.info("[Idempotency] Returning cached result for key [{}] on operation [{}]", idempotencyKey, operationName);
            return (T) idempotencyStore.get(idempotencyKey);
        }

        int attempt = 0;
        Throwable lastError = null;

        while (attempt < config.maxAttempts()) {
            attempt++;
            try {
                T result = action.get();
                if (idempotencyKey != null && result != null) {
                    idempotencyStore.put(idempotencyKey, result);
                }
                return result;
            } catch (Throwable t) {
                lastError = t;

                // Check if error is retryable (do NOT retry permanent client errors or non-transient failures)
                boolean retryable = (isRetryable != null) ? isRetryable.test(t) : isDefaultRetryable(t);
                if (!retryable || attempt >= config.maxAttempts()) {
                    log.error("[Retry] Operation [{}] failed on attempt {}/{} (non-retryable or budget exhausted): {}",
                            operationName, attempt, config.maxAttempts(), t.getMessage());
                    break;
                }

                // Calculate exponential backoff with full jitter
                long baseDelay = (long) (config.initialDelayMs() * Math.pow(config.backoffMultiplier(), attempt - 1));
                long cappedDelay = Math.min(config.maxDelayMs(), baseDelay);
                // Full random jitter: random between 0 and cappedDelay
                long jitteredDelay = ThreadLocalRandom.current().nextLong(10, cappedDelay + 1);

                log.warn("[Retry] Operation [{}] failed on attempt {}/{}. Backing off for {}ms before retry. Error: {}",
                        operationName, attempt, config.maxAttempts(), jitteredDelay, t.getMessage());

                try {
                    Thread.sleep(jitteredDelay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Retry interrupted for operation: " + operationName, ie);
                }
            }
        }

        throw new RuntimeException("Operation [" + operationName + "] failed after " + attempt + " attempts: " +
                (lastError != null ? lastError.getMessage() : "Unknown error"), lastError);
    }

    /**
     * Default classifier: retries I/O and network errors, but not business logic exceptions.
     */
    public boolean isDefaultRetryable(Throwable t) {
        if (t instanceof java.io.IOException ||
            t instanceof java.net.SocketTimeoutException ||
            t instanceof java.net.ConnectException ||
            t instanceof org.springframework.dao.TransientDataAccessException) {
            return true;
        }
        String msg = t.getMessage() != null ? t.getMessage().toLowerCase() : "";
        return msg.contains("timeout") || msg.contains("connection refused") || msg.contains("broken pipe");
    }

    public void clearIdempotencyKey(String key) {
        if (key != null) {
            idempotencyStore.remove(key);
        }
    }
}

