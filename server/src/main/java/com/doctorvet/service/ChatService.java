package com.doctorvet.service;

import com.doctorvet.exception.AccessDeniedException;
import com.doctorvet.model.Conversation;
import com.doctorvet.model.DoctorProfile;
import com.doctorvet.model.Message;
import com.doctorvet.model.Notification;
import com.doctorvet.repository.ConversationRepository;
import com.doctorvet.repository.DoctorProfileRepository;
import com.doctorvet.repository.MessageRepository;
import com.doctorvet.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ConversationRepository convRepo;
    private final MessageRepository msgRepo;
    private final DoctorProfileRepository doctorRepo;
    private final NotificationRepository notificationRepo;
    private final SimpMessagingTemplate messagingTemplate;

    // Concurrency lock table for atomic conversation creation and message deduplication
    private final ConcurrentHashMap<String, Object> chatLocks = new ConcurrentHashMap<>();

    public ChatService(ConversationRepository convRepo,
                       MessageRepository msgRepo,
                       DoctorProfileRepository doctorRepo,
                       NotificationRepository notificationRepo,
                       @Autowired(required = false) SimpMessagingTemplate messagingTemplate) {
        this.convRepo = convRepo;
        this.msgRepo = msgRepo;
        this.doctorRepo = doctorRepo;
        this.notificationRepo = notificationRepo;
        this.messagingTemplate = messagingTemplate;
    }

    public List<Conversation> getConversations(Long doctorId) {
        if (doctorId == null) return Collections.emptyList();
        List<Conversation> list = convRepo.findAllByDoctorId(doctorId);
        for (Conversation conv : list) {
            // Keep peer profiles updated if changed
            if (conv.getDoctor1Id() != null) {
                doctorRepo.findById(conv.getDoctor1Id()).ifPresent(d -> {
                    if (d.getName() != null) conv.setDoctor1Name(d.getName());
                    if (d.getAvatar() != null) conv.setDoctor1Avatar(d.getAvatar());
                });
            }
            if (conv.getDoctor2Id() != null) {
                doctorRepo.findById(conv.getDoctor2Id()).ifPresent(d -> {
                    if (d.getName() != null) conv.setDoctor2Name(d.getName());
                    if (d.getAvatar() != null) conv.setDoctor2Avatar(d.getAvatar());
                });
            }
        }
        return list;
    }

    private String getPairLockKey(Long doc1, Long doc2) {
        long min = Math.min(doc1, doc2);
        long max = Math.max(doc1, doc2);
        return "pair:" + min + ":" + max;
    }

    @Transactional
    public Conversation startConversation(Long doctor1Id, Long doctor2Id, String initialMessage) {
        if (doctor1Id == null || doctor2Id == null) {
            throw new IllegalArgumentException("Doctor IDs cannot be null");
        }
        if (doctor1Id.equals(doctor2Id)) {
            throw new IllegalArgumentException("Cannot create conversation with self");
        }

        String lockKey = getPairLockKey(doctor1Id, doctor2Id);
        Object lock = chatLocks.computeIfAbsent(lockKey, k -> new Object());

        synchronized (lock) {
            try {
                List<Conversation> existing = convRepo.findBetweenDoctorsList(doctor1Id, doctor2Id);
                if (!existing.isEmpty()) {
                    return existing.get(0);
                }

                DoctorProfile doc1 = doctorRepo.findById(doctor1Id).orElse(null);
                DoctorProfile doc2 = doctorRepo.findById(doctor2Id).orElse(null);

                String doc1Name = doc1 != null ? doc1.getName() : "Dr. You";
                String doc2Name = doc2 != null ? doc2.getName() : "Dr. Peer";
                String doc1Avatar = doc1 != null ? doc1.getAvatar() : null;
                String doc2Avatar = doc2 != null ? doc2.getAvatar() : null;

                Conversation conv = new Conversation(doctor1Id, doctor2Id, doc1Name, doc2Name, doc1Avatar, doc2Avatar);
                conv.setLastMessage(initialMessage != null ? initialMessage : "Started new consultation");
                conv.setLastMessageSenderId(doctor1Id);
                conv.setUpdatedAt(LocalDateTime.now());
                Conversation saved = convRepo.save(conv);

                if (initialMessage != null && !initialMessage.isBlank()) {
                    Message msg = new Message(saved.getId(), doctor1Id, doctor2Id, initialMessage, null, null);
                    msg.setStatus("SENT");
                    msg.setCreatedAt(LocalDateTime.now());
                    msgRepo.save(msg);
                }

                log.info("[ChatService] Created canonical conversation ID {} between doctors {} and {}", saved.getId(), doctor1Id, doctor2Id);
                return saved;
            } finally {
                chatLocks.remove(lockKey);
            }
        }
    }

    public Conversation getOrCreateCanonicalConversation(Long senderId, Long receiverId) {
        List<Conversation> existing = convRepo.findBetweenDoctorsList(senderId, receiverId);
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        return startConversation(senderId, receiverId, null);
    }

    public List<Message> getMessages(Long conversationId) {
        return getMessages(conversationId, null);
    }

    @Transactional
    public List<Message> getMessages(Long conversationId, Long requestingDoctorId) {
        if (conversationId == null) {
            return Collections.emptyList();
        }

        Conversation conv = convRepo.findById(conversationId).orElse(null);
        if (conv == null) {
            log.warn("[ChatService] Conversation ID {} not found", conversationId);
            return Collections.emptyList();
        }

        // Strict Conversation Participant Validation: Never leak messages to non-participants!
        if (requestingDoctorId != null && !conv.isParticipant(requestingDoctorId)) {
            log.warn("[ChatService] Unauthorized message query on conversation ID {} by doctor ID {}", conversationId, requestingDoctorId);
            throw new AccessDeniedException("Access denied: You are not a participant of conversation " + conversationId);
        }

        List<Message> messages = msgRepo.findByConversationIdOrderByCreatedAtAscIdAsc(conversationId);

        // Auto-deliver any SENT messages received by the requesting doctor
        if (requestingDoctorId != null && !messages.isEmpty()) {
            List<Long> newlyDeliveredIds = new ArrayList<>();
            LocalDateTime now = LocalDateTime.now();
            Long senderId = null;

            for (Message m : messages) {
                if (requestingDoctorId.equals(m.getReceiverId()) && "SENT".equalsIgnoreCase(m.getStatus())) {
                    m.setStatus("DELIVERED");
                    m.setDeliveredAt(now);
                    msgRepo.save(m);
                    newlyDeliveredIds.add(m.getId());
                    if (senderId == null) {
                        senderId = m.getSenderId();
                    }
                }
            }

            if (!newlyDeliveredIds.isEmpty()) {
                broadcastStatusUpdate(conversationId, senderId, requestingDoctorId, newlyDeliveredIds, "DELIVERED", null, now);
            }
        }

        return messages;
    }

    public Message sendMessage(Long conversationId, Long senderId, Long receiverId, String text, String attachmentUrl, String attachmentType) {
        return sendMessage(conversationId, senderId, receiverId, text, attachmentUrl, attachmentType, null, null);
    }

    public Message sendMessage(Long conversationId, Long senderId, Long receiverId, String text, String attachmentUrl, String attachmentType, String clientMsgId) {
        return sendMessage(conversationId, senderId, receiverId, text, attachmentUrl, attachmentType, clientMsgId, null);
    }

    @Transactional
    public Message sendMessage(Long conversationId, Long senderId, Long receiverId, String text, String attachmentUrl, String attachmentType, String clientMsgId, Long storyId) {
        if (senderId == null || receiverId == null) {
            throw new IllegalArgumentException("Both senderId and receiverId are required");
        }
        if (senderId.equals(receiverId)) {
            throw new IllegalArgumentException("Cannot send message to yourself");
        }

        // 1. Client idempotency token deduplication
        if (clientMsgId != null && !clientMsgId.isBlank()) {
            Optional<Message> dup = msgRepo.findByClientMsgId(clientMsgId.trim());
            if (dup.isPresent()) {
                log.info("[ChatService] Deduplicated message by clientMsgId: {}", clientMsgId);
                return dup.get();
            }
        }

        String lockKey = getPairLockKey(senderId, receiverId);
        Object lock = chatLocks.computeIfAbsent(lockKey, k -> new Object());

        synchronized (lock) {
            try {
                // 2. Strict conversation resolution: NEVER blindly trust a mismatched or missing conversationId!
                Conversation conv = null;
                if (conversationId != null && conversationId > 0) {
                    Optional<Conversation> opt = convRepo.findById(conversationId);
                    if (opt.isPresent()) {
                        Conversation candidate = opt.get();
                        // Verify that candidate conversation is actually between senderId and receiverId
                        if (candidate.isParticipant(senderId) && candidate.isParticipant(receiverId)) {
                            conv = candidate;
                        } else {
                            log.warn("[ChatService] Warning: Client passed conversationId {} which does not belong to doctors {} & {}. Re-routing to verified conversation.", conversationId, senderId, receiverId);
                        }
                    }
                }

                if (conv == null) {
                    conv = getOrCreateCanonicalConversation(senderId, receiverId);
                }

                Long verifiedConvId = conv.getId();

                // 3. Deduplicate rapid identical submissions (within last 3 seconds)
                LocalDateTime cutoff = LocalDateTime.now().minusSeconds(3);
                List<Message> recentMsgs = msgRepo.findByConversationIdAndSenderIdAndReceiverIdAndCreatedAtAfter(verifiedConvId, senderId, receiverId, cutoff);
                for (Message m : recentMsgs) {
                    if (isSameContent(m.getText(), text) && isSameContent(m.getAttachmentUrl(), attachmentUrl)) {
                        log.info("[ChatService] Deduplicated rapid repeat message in conv ID {}", verifiedConvId);
                        return m;
                    }
                }

                Message msg = new Message(verifiedConvId, senderId, receiverId, text, attachmentUrl, attachmentType);
                if (storyId != null) {
                    msg.setStoryId(storyId);
                }
                if (clientMsgId != null && !clientMsgId.isBlank()) {
                    msg.setClientMsgId(clientMsgId.trim());
                }
                msg.setStatus("SENT");
                msg.setCreatedAt(LocalDateTime.now());
                Message saved = msgRepo.save(msg);

                // Update conversation metadata
                String preview = text != null && !text.isBlank() ? (text.length() > 500 ? text.substring(0, 497) + "..." : text) : "Sent an attachment";
                conv.setLastMessage(preview);
                conv.setLastMessageSenderId(senderId);
                conv.setUpdatedAt(LocalDateTime.now());
                if (conv.getDoctor1Id().equals(receiverId)) {
                    conv.setUnreadCountDoctor1(conv.getUnreadCountDoctor1() + 1);
                } else {
                    conv.setUnreadCountDoctor2(conv.getUnreadCountDoctor2() + 1);
                }
                convRepo.save(conv);

                log.info("[ChatService] Message ID {} saved in conversation ID {} (sender {}, receiver {})", saved.getId(), verifiedConvId, senderId, receiverId);

                // Notification dispatch
                DoctorProfile sender = doctorRepo.findById(senderId).orElse(null);
                String senderName = sender != null ? sender.getName() : "Dr. You";
                String senderAvatar = sender != null ? sender.getAvatar() : null;

                String notifText = senderName + ": " + (text != null && text.length() > 40 ? text.substring(0, 40) + "..." : (text != null && !text.isBlank() ? text : "Sent an attachment"));

                notificationRepo.save(new Notification(
                        receiverId,
                        senderId,
                        senderName,
                        senderAvatar,
                        "NEW_MESSAGE",
                        notifText,
                        verifiedConvId
                ));

                // Real-time WebSocket delivery strictly to the verified conversation topic & user queues
                try {
                    messagingTemplate.convertAndSend("/topic/messages/" + verifiedConvId, (Object) saved);
                    messagingTemplate.convertAndSend("/topic/user/" + receiverId + "/messages", (Object) saved);
                    messagingTemplate.convertAndSend("/topic/user/" + senderId + "/messages", (Object) saved);
                    messagingTemplate.convertAndSend("/topic/user/" + receiverId + "/notifications", "NEW_MESSAGE");
                } catch (Exception ignored) {}

                return saved;
            } finally {
                chatLocks.remove(lockKey);
            }
        }
    }

    private boolean isSameContent(String s1, String s2) {
        String a = s1 != null ? s1.trim() : "";
        String b = s2 != null ? b = s2.trim() : "";
        return a.equals(b);
    }

    @Transactional
    public boolean markMessageAsRead(Long messageId, Long readerDoctorId) {
        return msgRepo.findById(messageId).map(m -> {
            if (readerDoctorId != null && !readerDoctorId.equals(m.getReceiverId())) {
                return false;
            }
            LocalDateTime now = LocalDateTime.now();
            m.setRead(true);
            m.setStatus("SEEN");
            m.setReadAt(now);
            if (m.getDeliveredAt() == null) {
                m.setDeliveredAt(now);
            }
            msgRepo.save(m);

            broadcastStatusUpdate(m.getConversationId(), m.getSenderId(), readerDoctorId, List.of(m.getId()), "SEEN", now, m.getDeliveredAt());
            return true;
        }).orElse(false);
    }

    @Transactional
    public boolean markMessageAsDelivered(Long messageId, Long receiverDoctorId) {
        return msgRepo.findById(messageId).map(m -> {
            if (receiverDoctorId != null && !receiverDoctorId.equals(m.getReceiverId())) {
                return false;
            }
            if ("SEEN".equalsIgnoreCase(m.getStatus())) {
                return true;
            }
            LocalDateTime now = LocalDateTime.now();
            m.setStatus("DELIVERED");
            if (m.getDeliveredAt() == null) {
                m.setDeliveredAt(now);
            }
            msgRepo.save(m);

            broadcastStatusUpdate(m.getConversationId(), m.getSenderId(), receiverDoctorId, List.of(m.getId()), "DELIVERED", null, now);
            return true;
        }).orElse(false);
    }

    @Transactional
    public void markConversationAsDelivered(Long conversationId, Long receiverDoctorId) {
        if (conversationId == null || receiverDoctorId == null) return;

        Conversation conv = convRepo.findById(conversationId).orElse(null);
        if (conv == null || !conv.isParticipant(receiverDoctorId)) return;

        List<Message> messages = msgRepo.findByConversationIdOrderByCreatedAtAscIdAsc(conversationId);
        List<Long> deliveredIds = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        Long senderId = null;

        for (Message m : messages) {
            if (receiverDoctorId.equals(m.getReceiverId()) && "SENT".equalsIgnoreCase(m.getStatus())) {
                m.setStatus("DELIVERED");
                m.setDeliveredAt(now);
                msgRepo.save(m);
                deliveredIds.add(m.getId());
                if (senderId == null) senderId = m.getSenderId();
            }
        }

        if (!deliveredIds.isEmpty()) {
            broadcastStatusUpdate(conversationId, senderId, receiverDoctorId, deliveredIds, "DELIVERED", null, now);
        }
    }

    @Transactional
    public void markConversationAsRead(Long conversationId, Long doctorId) {
        if (conversationId == null || doctorId == null) return;

        Conversation conv = convRepo.findById(conversationId).orElse(null);
        if (conv == null || !conv.isParticipant(doctorId)) return;

        if (conv.getDoctor1Id().equals(doctorId)) {
            conv.setUnreadCountDoctor1(0);
        } else {
            conv.setUnreadCountDoctor2(0);
        }
        convRepo.save(conv);

        List<Message> messages = msgRepo.findByConversationIdOrderByCreatedAtAscIdAsc(conversationId);
        List<Long> seenIds = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        Long otherDoctorId = conv.getOtherDoctorId(doctorId);

        for (Message m : messages) {
            if (doctorId.equals(m.getReceiverId()) && (!m.isRead() || !"SEEN".equalsIgnoreCase(m.getStatus()))) {
                m.setRead(true);
                m.setStatus("SEEN");
                m.setReadAt(now);
                if (m.getDeliveredAt() == null) {
                    m.setDeliveredAt(now);
                }
                msgRepo.save(m);
                seenIds.add(m.getId());
            }
        }

        // Mark associated notifications as read
        List<Notification> notifs = notificationRepo.findByRecipientIdOrderByCreatedAtDesc(doctorId);
        for (Notification n : notifs) {
            if ("NEW_MESSAGE".equalsIgnoreCase(n.getType()) && conversationId.equals(n.getTargetId()) && !n.isRead()) {
                n.setRead(true);
                notificationRepo.save(n);
            }
        }

        try {
            messagingTemplate.convertAndSend("/topic/user/" + doctorId + "/notifications", "NOTIFICATIONS_UPDATED");
        } catch (Exception ignored) {}

        if (!seenIds.isEmpty()) {
            broadcastStatusUpdate(conversationId, otherDoctorId, doctorId, seenIds, "SEEN", now, null);
        }
    }

    private void broadcastStatusUpdate(Long conversationId, Long senderId, Long receiverOrReaderId,
                                       List<Long> messageIds, String status, LocalDateTime readAt, LocalDateTime deliveredAt) {
        Map<String, Object> event = new HashMap<>();
        event.put("type", "MESSAGE_STATUS_UPDATE");
        event.put("status", status);
        event.put("conversationId", conversationId);
        event.put("messageIds", messageIds);
        if (readAt != null) event.put("readAt", readAt.toString());
        if (deliveredAt != null) event.put("deliveredAt", deliveredAt.toString());
        event.put("readerId", receiverOrReaderId);
        event.put("receiverId", receiverOrReaderId);
        event.put("timestamp", LocalDateTime.now().toString());

        try {
            messagingTemplate.convertAndSend("/topic/messages/" + conversationId, (Object) event);
            if (senderId != null) {
                messagingTemplate.convertAndSend("/topic/user/" + senderId + "/messages", (Object) event);
            }
            if (receiverOrReaderId != null) {
                messagingTemplate.convertAndSend("/topic/user/" + receiverOrReaderId + "/messages", (Object) event);
            }
        } catch (Exception ignored) {}
    }
}
