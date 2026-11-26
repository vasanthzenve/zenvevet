package com.doctorvet.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "messages", indexes = {
    @Index(name = "idx_msg_conv_created", columnList = "conversationId, createdAt"),
    @Index(name = "idx_msg_client_id", columnList = "clientMsgId"),
    @Index(name = "idx_msg_receiver_status", columnList = "receiverId, status"),
    @Index(name = "idx_msg_sender_receiver", columnList = "senderId, receiverId, createdAt")
})
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long conversationId;

    @Column(nullable = false)
    private Long senderId;

    private Long receiverId;

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String text;

    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String attachmentUrl;

    @Column(length = 50)
    private String attachmentType; // image, video, audio, scan, document

    @Column(length = 32)
    private String messageType = "TEXT"; // TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT

    @Column(length = 128)
    private String clientMsgId;

    @Column(name = "story_id")
    private Long storyId;

    private boolean isRead = false;

    @Column(length = 20)
    private String status = "SENT"; // SENT, DELIVERED, SEEN

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt = LocalDateTime.now();

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime deliveredAt;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime readAt;

    public Message() {}

    public Message(Long conversationId, Long senderId, Long receiverId, String text, String attachmentUrl, String attachmentType) {
        this.conversationId = conversationId;
        this.senderId = senderId;
        this.receiverId = receiverId;
        this.text = text;
        this.attachmentUrl = attachmentUrl;
        this.attachmentType = attachmentType;
        this.messageType = deriveMessageType(attachmentUrl, attachmentType);
        this.isRead = false;
        this.status = "SENT";
        this.createdAt = LocalDateTime.now();
    }

    private static String deriveMessageType(String url, String type) {
        if (url != null && !url.isBlank()) {
            if (type != null && !type.isBlank()) {
                String t = type.toUpperCase();
                if (t.contains("VIDEO")) return "VIDEO";
                if (t.contains("AUDIO") || t.contains("VOICE")) return "AUDIO";
                if (t.contains("DOC") || t.contains("PDF") || t.contains("SCAN")) return "DOCUMENT";
                if (t.contains("IMAGE") || t.contains("PHOTO")) return "IMAGE";
            }
            String lower = url.toLowerCase();
            if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return "VIDEO";
            if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg") || lower.endsWith(".m4a")) return "AUDIO";
            if (lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx")) return "DOCUMENT";
            return "IMAGE";
        }
        return "TEXT";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getConversationId() { return conversationId; }
    public void setConversationId(Long conversationId) { this.conversationId = conversationId; }

    public Long getSenderId() { return senderId; }
    public void setSenderId(Long senderId) { this.senderId = senderId; }

    public Long getReceiverId() { return receiverId; }
    public void setReceiverId(Long receiverId) { this.receiverId = receiverId; }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }

    public String getMessage() { return text; }
    public void setMessage(String message) { this.text = message; }

    public String getAttachmentUrl() { return attachmentUrl; }
    public void setAttachmentUrl(String attachmentUrl) {
        this.attachmentUrl = attachmentUrl;
        if (attachmentUrl != null && !attachmentUrl.isBlank() && "TEXT".equals(this.messageType)) {
            this.messageType = deriveMessageType(attachmentUrl, this.attachmentType);
        }
    }

    public String getAttachmentType() { return attachmentType; }
    public void setAttachmentType(String attachmentType) {
        this.attachmentType = attachmentType;
        if (attachmentType != null && !attachmentType.isBlank()) {
            this.messageType = deriveMessageType(this.attachmentUrl, attachmentType);
        }
    }

    public String getMessageType() { return messageType; }
    public void setMessageType(String messageType) { this.messageType = messageType; }

    public String getClientMsgId() { return clientMsgId; }
    public void setClientMsgId(String clientMsgId) { this.clientMsgId = clientMsgId; }

    public Long getStoryId() { return storyId; }
    public void setStoryId(Long storyId) { this.storyId = storyId; }

    @JsonProperty("isRead")
    public boolean isRead() { return isRead; }
    public void setRead(boolean read) {
        this.isRead = read;
        if (read) {
            this.status = "SEEN";
            if (this.readAt == null) {
                this.readAt = LocalDateTime.now();
            }
            if (this.deliveredAt == null) {
                this.deliveredAt = this.readAt;
            }
        }
    }

    public String getStatus() { return status; }
    public void setStatus(String status) {
        this.status = status;
        if ("SEEN".equalsIgnoreCase(status)) {
            this.isRead = true;
            if (this.readAt == null) {
                this.readAt = LocalDateTime.now();
            }
            if (this.deliveredAt == null) {
                this.deliveredAt = this.readAt;
            }
        } else if ("DELIVERED".equalsIgnoreCase(status)) {
            if (this.deliveredAt == null) {
                this.deliveredAt = LocalDateTime.now();
            }
        }
    }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getDeliveredAt() { return deliveredAt; }
    public void setDeliveredAt(LocalDateTime deliveredAt) { this.deliveredAt = deliveredAt; }

    public LocalDateTime getReadAt() { return readAt; }
    public void setReadAt(LocalDateTime readAt) { this.readAt = readAt; }
}
