package com.doctorvet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Resilient Cache-Aside Service
 * Supports TTL, Cache Stampede Protection (Single-Flight Loader), and Graceful In-Memory Fallback.
 */
@Service
public class CacheService {

    private static final Logger log = LoggerFactory.getLogger(CacheService.class);

    public record CacheEntry(Object value, long expiresAt) {
        public boolean isExpired() {
            return System.currentTimeMillis() > expiresAt;
        }
    }

    // Cache Name -> (Key -> CacheEntry)
    private final Map<String, Map<String, CacheEntry>> caches = new ConcurrentHashMap<>();

    // Mutex locks for Cache Stampede Prevention (Key -> ReentrantLock)
    private final Map<String, ReentrantLock> keyLocks = new ConcurrentHashMap<>();

    // Default TTLs
    public static final long TTL_USER_PROFILE = 10 * 60 * 1000L;    // 10 minutes
    public static final long TTL_PUBLIC_POST = 5 * 60 * 1000L;       // 5 minutes
    public static final long TTL_FEED = 60 * 1000L;                  // 1 minute
    public static final long TTL_TRENDING = 3 * 60 * 1000L;          // 3 minutes
    public static final long TTL_FOLLOWER_COUNTS = 2 * 60 * 1000L;   // 2 minutes
    public static final long TTL_NOTIFICATION_COUNTS = 30 * 1000L;   // 30 seconds

    /**
     * Cache-Aside with Stampede Protection:
     * If key is in cache and not expired, returns cached value.
     * If not, locks on key so only 1 thread executes the loader from DB, then caches and returns.
     */
    @SuppressWarnings("unchecked")
    public <T> T getOrLoad(String cacheName, String key, long ttlMs, Supplier<T> loader) {
        Map<String, CacheEntry> cache = caches.computeIfAbsent(cacheName, k -> new ConcurrentHashMap<>());

        CacheEntry entry = cache.get(key);
        if (entry != null && !entry.isExpired()) {
            return (T) entry.value();
        }

        // Cache miss or expired: Acquire single-flight mutex lock for this specific key
        String lockKey = cacheName + ":" + key;
        ReentrantLock lock = keyLocks.computeIfAbsent(lockKey, k -> new ReentrantLock());

        lock.lock();
        try {
            // Double-check after acquiring lock (another thread might have loaded it)
            entry = cache.get(key);
            if (entry != null && !entry.isExpired()) {
                return (T) entry.value();
            }

            // Load fresh data from database
            T freshValue = loader.get();

            if (freshValue != null) {
                cache.put(key, new CacheEntry(freshValue, System.currentTimeMillis() + ttlMs));
            } else {
                // Negative caching with short 10s TTL to protect DB from repeated queries for non-existent keys
                cache.put(key, new CacheEntry(null, System.currentTimeMillis() + 10_000L));
            }

            return freshValue;
        } catch (Exception e) {
            log.warn("Cache load failed for [{} : {}]: {}", cacheName, key, e.getMessage());
            // Fallback: directly return fresh value if possible, or null
            return loader.get();
        } finally {
            lock.unlock();
            // Clean up lock object if no other threads waiting
            if (!lock.hasQueuedThreads()) {
                keyLocks.remove(lockKey);
            }
        }
    }

    /**
     * Put a value directly into the cache.
     */
    public void put(String cacheName, String key, Object value, long ttlMs) {
        Map<String, CacheEntry> cache = caches.computeIfAbsent(cacheName, k -> new ConcurrentHashMap<>());
        cache.put(key, new CacheEntry(value, System.currentTimeMillis() + ttlMs));
    }

    /**
     * Invalidate a single key from cache.
     */
    public void evict(String cacheName, String key) {
        Map<String, CacheEntry> cache = caches.get(cacheName);
        if (cache != null) {
            cache.remove(key);
        }
    }

    /**
     * Invalidate all keys in a cache category.
     */
    public void evictAll(String cacheName) {
        Map<String, CacheEntry> cache = caches.get(cacheName);
        if (cache != null) {
            cache.clear();
        }
    }

    // Specialized high-level invalidators
    public void invalidateUserProfile(Long doctorId) {
        evict("doctors", String.valueOf(doctorId));
        evict("counts", "followers:" + doctorId);
    }

    public void invalidatePost(Long postId) {
        evict("posts", String.valueOf(postId));
        evictAll("feed");
        evictAll("trending");
    }

    public void invalidateFeed() {
        evictAll("feed");
    }

    public void invalidateTrending() {
        evictAll("trending");
    }

    public void invalidateFollowers(Long doctorId) {
        evict("counts", "followers:" + doctorId);
        evictAll("feed");
    }

    /**
     * Background cleanup of expired cache entries to maintain tight memory bounds.
     */
    public void cleanupExpiredEntries() {
        long now = System.currentTimeMillis();
        for (Map<String, CacheEntry> cache : caches.values()) {
            cache.entrySet().removeIf(e -> e.getValue().expiresAt() < now);
        }
    }

    public int getCacheSize(String cacheName) {
        Map<String, CacheEntry> cache = caches.get(cacheName);
        return cache != null ? cache.size() : 0;
    }
}

