package com.doctorvet.security;

import org.springframework.stereotype.Service;

import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * High-Performance Distributed / In-Memory Sliding-Window Rate Limiter
 * Implements per-IP and per-User rate limits with HTTP 429 Retry-After
 * calculation.
 */
@Service
public class RateLimitService {

    public record RateLimitResult(
            boolean allowed,
            int limit,
            int remaining,
            long retryAfterSeconds,
            long resetEpochMs) {
    }

    // Key -> Deque of request timestamps in milliseconds
    private final Map<String, ConcurrentLinkedDeque<Long>> requestLogs = new ConcurrentHashMap<>();

    // Category limits (requests per window)
    public enum LimitType {
        AUTH_LOGIN(5, 60_000L), // 5 per min
        AUTH_REGISTER(3, 60_000L), // 3 per min
        AUTH_OTP(3, 300_000L), // 3 per 5 min (anti-SMS/OTP bombing)
        PAYMENT_API(10, 60_000L), // 10 per min (payment security)
        SEARCH(30, 60_000L), // 30 per min
        POST_CREATE(10, 60_000L), // 10 per min
        COMMENT(60, 60_000L), // 60 per min
        LIKE_FOLLOW(300, 60_000L), // 300 per min (generous limit for rapid likes, dislikes & reactions)
        CHAT_MESSAGE(100, 60_000L), // 100 per min
        FEED(120, 60_000L), // 120 per min
        GENERAL(150, 60_000L); // 150 per min

        public final int maxRequests;
        public final long windowMs;

        LimitType(int maxRequests, long windowMs) {
            this.maxRequests = maxRequests;
            this.windowMs = windowMs;
        }
    }

    /**
     * Check if a request is allowed under the sliding window rate limit.
     */
    public RateLimitResult checkRateLimit(String clientKey, LimitType type) {
        return checkRateLimit(clientKey, type.maxRequests, type.windowMs);
    }

    /**
     * Sliding Window algorithm:
     * Prunes timestamps older than now - windowMs, then counts remaining
     * timestamps.
     */
    public RateLimitResult checkRateLimit(String clientKey, int maxRequests, long windowMs) {
        long now = System.currentTimeMillis();
        long windowStart = now - windowMs;

        ConcurrentLinkedDeque<Long> timestamps = requestLogs.computeIfAbsent(
                clientKey,
                k -> new ConcurrentLinkedDeque<>());

        synchronized (timestamps) {
            // Evict timestamps outside the sliding window
            while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                timestamps.pollFirst();
            }

            int currentCount = timestamps.size();

            if (currentCount >= maxRequests) {
                // Rate limited!
                Long oldestInWindow = timestamps.peekFirst();
                long oldestTime = oldestInWindow != null ? oldestInWindow : windowStart;
                long retryAfterMs = Math.max(1000L, (oldestTime + windowMs) - now);
                long retryAfterSeconds = (long) Math.ceil(retryAfterMs / 1000.0);
                long resetEpochMs = oldestTime + windowMs;

                return new RateLimitResult(false, maxRequests, 0, retryAfterSeconds, resetEpochMs);
            }

            // Allowed: record current request timestamp
            timestamps.addLast(now);
            int remaining = Math.max(0, maxRequests - (currentCount + 1));
            long resetEpochMs = now + windowMs;

            return new RateLimitResult(true, maxRequests, remaining, 0, resetEpochMs);
        }
    }

    /**
     * Reset rate limit bucket for testing or manual administrator unblock.
     */
    public void reset(String clientKey) {
        requestLogs.remove(clientKey);
    }

    /**
     * Periodic cleanup of inactive buckets to prevent memory accumulation.
     */
    public void cleanupStaleBuckets() {
        long now = System.currentTimeMillis();
        long maxRetention = 120_000L; // 2 minutes

        Iterator<Map.Entry<String, ConcurrentLinkedDeque<Long>>> it = requestLogs.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, ConcurrentLinkedDeque<Long>> entry = it.next();
            ConcurrentLinkedDeque<Long> deque = entry.getValue();
            synchronized (deque) {
                while (!deque.isEmpty() && deque.peekFirst() < (now - maxRetention)) {
                    deque.pollFirst();
                }
                if (deque.isEmpty()) {
                    it.remove();
                }
            }
        }
    }

    public int getActiveBucketCount() {
        return requestLogs.size();
    }
}
