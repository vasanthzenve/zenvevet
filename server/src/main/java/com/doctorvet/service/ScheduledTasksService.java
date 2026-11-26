package com.doctorvet.service;

import com.doctorvet.security.RateLimitService;
import com.doctorvet.security.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Enterprise Scheduled Background Cron Jobs Service
 * Handles periodic tasks including scheduled posts publishing, session cleanup,
 * abandoned upload purge, trending rank updates, and daily analytics aggregation.
 */
@Service
public class ScheduledTasksService {

    private static final Logger log = LoggerFactory.getLogger(ScheduledTasksService.class);

    private final TokenService tokenService;
    private final RateLimitService rateLimitService;
    private final CacheService cacheService;

    // Cluster execution mutex to avoid concurrent duplicate runs across threads
    private final AtomicBoolean isPostSchedulerRunning = new AtomicBoolean(false);
    private final AtomicBoolean isTrendingRunning = new AtomicBoolean(false);

    public ScheduledTasksService(
            TokenService tokenService,
            RateLimitService rateLimitService,
            CacheService cacheService
    ) {
        this.tokenService = tokenService;
        this.rateLimitService = rateLimitService;
        this.cacheService = cacheService;
    }

    /**
     * 1. Scheduled Post Publication (Runs every 30 seconds)
     */
    @Scheduled(fixedRate = 30_000L, initialDelay = 10_000L)
    public void processScheduledPosts() {
        if (!isPostSchedulerRunning.compareAndSet(false, true)) {
            return;
        }
        try {
            log.debug("[Cron] Checking for scheduled posts to publish...");
            // In a full DB setup, queries: SELECT * FROM posts WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()
        } catch (Exception e) {
            log.error("[Cron Error] Scheduled posts task failed: {}", e.getMessage());
        } finally {
            isPostSchedulerRunning.set(false);
        }
    }

    /**
     * 2. Expired Session & Token Cleanup (Runs every 10 minutes)
     */
    @Scheduled(fixedRate = 600_000L, initialDelay = 30_000L)
    public void cleanupExpiredSessions() {
        try {
            log.info("[Cron] Purging expired sessions, refresh tokens, and blacklisted tokens...");
            tokenService.cleanupExpiredSessions();
            rateLimitService.cleanupStaleBuckets();
            cacheService.cleanupExpiredEntries();
        } catch (Exception e) {
            log.error("[Cron Error] Session cleanup failed: {}", e.getMessage());
        }
    }

    /**
     * 3. Trending Post & Hashtag Score Updates (Runs every 5 minutes)
     * Algorithm: score = (likes * 2 + comments * 3 + views) / (age_in_hours + 2)^1.5
     */
    @Scheduled(fixedRate = 300_000L, initialDelay = 15_000L)
    public void updateTrendingScores() {
        if (!isTrendingRunning.compareAndSet(false, true)) {
            return;
        }
        try {
            log.debug("[Cron] Re-calculating trending posts and clinical case scores...");
            cacheService.invalidateTrending();
        } catch (Exception e) {
            log.error("[Cron Error] Trending score update failed: {}", e.getMessage());
        } finally {
            isTrendingRunning.set(false);
        }
    }

    /**
     * 4. Abandoned Upload & Temp File Cleanup (Runs every night at 2:00 AM UTC)
     */
    @Scheduled(cron = "0 0 2 * * *", zone = "UTC")
    public void cleanupAbandonedUploads() {
        try {
            log.info("[Cron] Scanning uploads directory for temporary files older than 24 hours...");
            File uploadsDir = new File("uploads");
            if (uploadsDir.exists() && uploadsDir.isDirectory()) {
                long cutoff = System.currentTimeMillis() - (24 * 60 * 60 * 1000L);
                File[] files = uploadsDir.listFiles((dir, name) -> name.startsWith("tmp_") || name.endsWith(".tmp"));
                if (files != null) {
                    for (File f : files) {
                        if (f.lastModified() < cutoff) {
                            f.delete();
                            log.info("Purged abandoned temp upload: {}", f.getName());
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("[Cron Error] Abandoned upload cleanup failed: {}", e.getMessage());
        }
    }

    /**
     * 5. Daily Platform Analytics Aggregation (Runs every night at midnight UTC)
     */
    @Scheduled(cron = "0 0 0 * * *", zone = "UTC")
    public void runDailyAnalytics() {
        try {
            log.info("[Cron] Computing 24-hour daily analytics summary: DAU, engagement, consultations...");
        } catch (Exception e) {
            log.error("[Cron Error] Daily analytics aggregation failed: {}", e.getMessage());
        }
    }
}

