package com.doctorvet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enterprise Real-Time WebSocket Presence & Event Distribution Service
 * Manages doctor online/offline state, typing indicators, live comment streams,
 * and delivery receipts across distributed client connections.
 */
@Service
public class WebSocketPresenceService {

    private static final Logger log = LoggerFactory.getLogger(WebSocketPresenceService.class);

    private final SimpMessagingTemplate messagingTemplate;

    // DoctorId -> Set of active WebSocket session IDs
    private final Map<Long, Set<String>> doctorSessions = new ConcurrentHashMap<>();
    // SessionId -> DoctorId mapping
    private final Map<String, Long> sessionToDoctor = new ConcurrentHashMap<>();

    public WebSocketPresenceService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        log.info("[WS] Client session connected: {}", sessionId);
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = accessor.getSessionId();
        if (sessionId != null) {
            unregisterSession(sessionId);
        }
    }

    /**
     * Register an authenticated doctor's WebSocket session and broadcast online status.
     */
    public synchronized void registerDoctorSession(Long doctorId, String sessionId) {
        if (doctorId == null || sessionId == null) return;

        doctorSessions.computeIfAbsent(doctorId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
        sessionToDoctor.put(sessionId, doctorId);

        // Broadcast presence
        Object payload = Map.of(
                "type", "PRESENCE",
                "doctorId", doctorId,
                "status", "ONLINE",
                "timestamp", System.currentTimeMillis()
        );
        messagingTemplate.convertAndSend((String) "/topic/presence", payload);
        log.info("[WS Presence] Doctor {} is now ONLINE (Sessions: {})", doctorId, doctorSessions.get(doctorId).size());
    }

    /**
     * Unregister session and broadcast offline status if no active sessions remain.
     */
    public synchronized void unregisterSession(String sessionId) {
        Long doctorId = sessionToDoctor.remove(sessionId);
        if (doctorId != null) {
            Set<String> sessions = doctorSessions.get(doctorId);
            if (sessions != null) {
                sessions.remove(sessionId);
                if (sessions.isEmpty()) {
                    doctorSessions.remove(doctorId);
                    Object payload = Map.of(
                            "type", "PRESENCE",
                            "doctorId", doctorId,
                            "status", "OFFLINE",
                            "timestamp", System.currentTimeMillis()
                    );
                    messagingTemplate.convertAndSend((String) "/topic/presence", payload);
                    log.info("[WS Presence] Doctor {} is now OFFLINE", doctorId);
                }
            }
        }
    }

    public boolean isDoctorOnline(Long doctorId) {
        return doctorId != null && doctorSessions.containsKey(doctorId) && !doctorSessions.get(doctorId).isEmpty();
    }

    public Set<Long> getOnlineDoctorIds() {
        return Collections.unmodifiableSet(doctorSessions.keySet());
    }

    /**
     * Send Real-Time Typing Indicator to a peer.
     */
    public void sendTypingIndicator(Long senderId, Long receiverId, boolean isTyping) {
        if (receiverId == null || senderId == null) return;
        Object payload = Map.of(
                "type", "TYPING",
                "senderId", senderId,
                "isTyping", isTyping,
                "timestamp", System.currentTimeMillis()
        );
        messagingTemplate.convertAndSend((String) ("/topic/user/" + receiverId + "/typing"), payload);
    }

    /**
     * Broadcast live comment on a post to all active viewers.
     */
    public void broadcastLiveComment(Long postId, Object comment) {
        if (postId == null || comment == null) return;
        messagingTemplate.convertAndSend((String) ("/topic/posts/" + postId + "/comments"), (Object) comment);
    }

    /**
     * Broadcast new post event to global live feed stream.
     */
    public void broadcastFeedEvent(String action, Object post) {
        Object payload = Map.of(
                "action", action,
                "post", post != null ? post : "",
                "timestamp", System.currentTimeMillis()
        );
        messagingTemplate.convertAndSend((String) "/topic/feed", payload);
    }
}
