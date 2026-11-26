package com.doctorvet.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Enterprise Asynchronous Event Queue & Message Bus Service
 * Implements producer-consumer pattern, retries, dead-letter queue (DLQ),
 * idempotent consumer execution, and queue monitoring for background tasks.
 */
@Service
public class EventQueueService {

    private static final Logger log = LoggerFactory.getLogger(EventQueueService.class);

    public enum EventType {
        USER_REGISTERED,
        POST_CREATED,
        POST_LIKED,
        POST_COMMENTED,
        USER_FOLLOWED,
        NOTIFICATION_DISPATCH,
        CHAT_EVENT,
        MEDIA_PROCESSING,
        ANALYTICS_EVENT,
        EMAIL_NOTIFICATION
    }

    public record EventMessage(
            String id,
            EventType type,
            Map<String, Object> payload,
            long createdAt,
            int attempts,
            String lastError
    ) {
        public EventMessage withAttempt(int attempt, String error) {
            return new EventMessage(id, type, payload, createdAt, attempt, error);
        }
    }

    private final BlockingQueue<EventMessage> mainQueue = new LinkedBlockingQueue<>(50_000);
    private final List<EventMessage> deadLetterQueue = new CopyOnWriteArrayList<>();
    private final Set<String> processedEventIds = Collections.newSetFromMap(new ConcurrentHashMap<>());

    private final AtomicLong totalPublished = new AtomicLong(0);
    private final AtomicLong totalProcessed = new AtomicLong(0);
    private final AtomicLong totalFailed = new AtomicLong(0);

    private ExecutorService consumerPool;
    private volatile boolean running = true;

    private static final int MAX_ATTEMPTS = 3;

    @PostConstruct
    public void startConsumers() {
        int workerCount = Math.max(2, Runtime.getRuntime().availableProcessors());
        consumerPool = Executors.newFixedThreadPool(workerCount, r -> {
            Thread t = new Thread(r, "zenve-event-worker");
            t.setDaemon(true);
            return t;
        });

        for (int i = 0; i < workerCount; i++) {
            consumerPool.submit(this::processQueueLoop);
        }
        log.info("EventQueueService started with {} background worker threads", workerCount);
    }

    @PreDestroy
    public void stopConsumers() {
        running = false;
        if (consumerPool != null) {
            consumerPool.shutdownNow();
        }
    }

    /**
     * Producer: Publish an event asynchronously without blocking caller API thread.
     */
    public boolean publish(EventType type, Map<String, Object> payload) {
        return publish(type, payload, "evt_" + UUID.randomUUID());
    }

    public boolean publish(EventType type, Map<String, Object> payload, String correlationId) {
        EventMessage msg = new EventMessage(
                correlationId,
                type,
                payload != null ? new HashMap<>(payload) : new HashMap<>(),
                System.currentTimeMillis(),
                0,
                null
        );

        boolean queued = mainQueue.offer(msg);
        if (queued) {
            totalPublished.incrementAndGet();
            log.debug("Published event [{}] with ID [{}]", type, correlationId);
        } else {
            log.error("Event queue is FULL! Dropped event [{}] with ID [{}]", type, correlationId);
        }
        return queued;
    }

    /**
     * Consumer Loop: pulls events from queue and routes them to appropriate handlers.
     */
    private void processQueueLoop() {
        while (running && !Thread.currentThread().isInterrupted()) {
            try {
                EventMessage msg = mainQueue.poll(500, TimeUnit.MILLISECONDS);
                if (msg == null) continue;

                // Idempotent consumer verification
                if (processedEventIds.contains(msg.id())) {
                    log.info("Duplicate event [{}] ignored by idempotent consumer", msg.id());
                    continue;
                }

                try {
                    handleEvent(msg);
                    processedEventIds.add(msg.id());
                    totalProcessed.incrementAndGet();
                } catch (Exception e) {
                    int nextAttempt = msg.attempts() + 1;
                    if (nextAttempt < MAX_ATTEMPTS) {
                        log.warn("Event [{}] failed (attempt {}/{}). Re-queuing. Error: {}",
                                msg.id(), nextAttempt, MAX_ATTEMPTS, e.getMessage());
                        mainQueue.offer(msg.withAttempt(nextAttempt, e.getMessage()));
                    } else {
                        // Max retries exceeded -> Move to Dead Letter Queue (DLQ)
                        log.error("Event [{}] exceeded max attempts. Moving to Dead Letter Queue. Error: {}",
                                msg.id(), e.getMessage());
                        deadLetterQueue.add(msg.withAttempt(nextAttempt, e.getMessage()));
                        totalFailed.incrementAndGet();
                    }
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.error("Unexpected worker loop error: {}", e.getMessage(), e);
            }
        }
    }

    /**
     * Event Dispatcher logic
     */
    private void handleEvent(EventMessage msg) {
        switch (msg.type()) {
            case USER_REGISTERED -> log.info("[Worker] Processing Welcome Flow for User: {}", msg.payload().get("email"));
            case POST_CREATED -> log.info("[Worker] Processing Feed Fanout for Post: {}", msg.payload().get("postId"));
            case POST_LIKED -> log.info("[Worker] Updating Post Like Counter: {}", msg.payload().get("postId"));
            case POST_COMMENTED -> log.info("[Worker] Recording Comment Metric: {}", msg.payload().get("commentId"));
            case USER_FOLLOWED -> log.info("[Worker] Synchronizing Follow Graph: {} -> {}", msg.payload().get("followerId"), msg.payload().get("followingId"));
            case NOTIFICATION_DISPATCH -> log.info("[Worker] Dispatching Notification: {}", msg.payload().get("title"));
            case CHAT_EVENT -> log.info("[Worker] Processing Chat Delivery Receipt: msgId={}", msg.payload().get("messageId"));
            case MEDIA_PROCESSING -> log.info("[Worker] Generating Media Thumbnail: {}", msg.payload().get("mediaUrl"));
            case ANALYTICS_EVENT -> log.info("[Worker] Ingesting Analytics Metric: {}", msg.payload().get("metricName"));
            case EMAIL_NOTIFICATION -> log.info("[Worker] Dispatched Outbound Email to: {}", msg.payload().get("recipient"));
        }
    }

    public long getQueueSize() { return mainQueue.size(); }
    public int getDlqSize() { return deadLetterQueue.size(); }
    public long getTotalPublished() { return totalPublished.get(); }
    public long getTotalProcessed() { return totalProcessed.get(); }
    public long getTotalFailed() { return totalFailed.get(); }
    public List<EventMessage> getDlqItems() { return Collections.unmodifiableList(deadLetterQueue); }

    public void clearDlq() { deadLetterQueue.clear(); }
}

