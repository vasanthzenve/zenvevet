package com.doctorvet.service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.doctorvet.model.Notification;
import com.doctorvet.model.Story;
import com.doctorvet.model.StoryLike;
import com.doctorvet.model.StoryView;
import com.doctorvet.repository.DoctorProfileRepository;
import com.doctorvet.repository.NotificationRepository;
import com.doctorvet.repository.StoryLikeRepository;
import com.doctorvet.repository.StoryRepository;
import com.doctorvet.repository.StoryViewRepository;

@Service
public class StoryService {

    private static final Logger log = LoggerFactory.getLogger(StoryService.class);

    private final StoryRepository storyRepo;
    private final StoryLikeRepository storyLikeRepo;
    private final StoryViewRepository storyViewRepo;
    private final DoctorProfileRepository doctorRepo;
    private final NotificationRepository notificationRepo;
    private final SimpMessagingTemplate messagingTemplate;

    public StoryService(
            StoryRepository storyRepo,
            StoryLikeRepository storyLikeRepo,
            StoryViewRepository storyViewRepo,
            DoctorProfileRepository doctorRepo,
            NotificationRepository notificationRepo,
            @Autowired(required = false) SimpMessagingTemplate messagingTemplate) {
        this.storyRepo = storyRepo;
        this.storyLikeRepo = storyLikeRepo;
        this.storyViewRepo = storyViewRepo;
        this.doctorRepo = doctorRepo;
        this.notificationRepo = notificationRepo;
        this.messagingTemplate = messagingTemplate;
    }

    public List<Story> getActiveStories(Long currentDoctorId) {
        List<Story> stories = storyRepo.findByExpiresAtAfterOrderByCreatedAtDesc(LocalDateTime.now());
        for (Story s : stories) {
            // Ensure mediaType is accurate
            if (s.getMediaType() == null || s.getMediaType().isBlank() || "IMAGE".equalsIgnoreCase(s.getMediaType())) {
                if (isVideoUrl(s.getMediaUrl())) {
                    s.setMediaType("VIDEO");
                } else if (s.getMediaType() == null) {
                    s.setMediaType("IMAGE");
                }
            }

            if (s.getDoctorId() != null) {
                doctorRepo.findById(s.getDoctorId()).ifPresent(doc -> {
                    if (doc.getAvatar() != null && !doc.getAvatar().isBlank()) {
                        s.setAvatar(doc.getAvatar());
                    }
                });
            } else if (s.getDoctorName() != null && !s.getDoctorName().isBlank()) {
                final String docName = s.getDoctorName().toLowerCase(Locale.ROOT).replace("dr.", "").trim();
                doctorRepo.findAll().stream()
                        .filter(d -> d.getName() != null && d.getName().toLowerCase(Locale.ROOT).replace("dr.", "").trim().equals(docName))
                        .findFirst()
                        .ifPresent(doc -> {
                            if (doc.getAvatar() != null && !doc.getAvatar().isBlank()) {
                                s.setAvatar(doc.getAvatar());
                            }
                        });
            }

            long actualLikes = storyLikeRepo.countByStoryId(s.getId());
            s.setLikes((int) actualLikes);

            if (currentDoctorId != null) {
                boolean liked = storyLikeRepo.existsByStoryIdAndDoctorId(s.getId(), currentDoctorId);
                s.setIsLiked(liked);
            } else {
                s.setIsLiked(false);
            }

            // Sync total views count from verified non-owner viewers
            List<StoryView> nonOwnerViews = getStoryViewers(s.getId());
            s.setViews(nonOwnerViews.size());
        }
        return stories;
    }

    public List<Story> getActiveStories() {
        return getActiveStories(null);
    }

    public Optional<Story> getStoryById(Long storyId) {
        return storyRepo.findById(storyId);
    }

    @Transactional
    public Story createStory(Story story) {
        if (story == null) {
            throw new IllegalArgumentException("Story payload cannot be null");
        }

        String mediaUrl = story.getMediaUrl();
        if (mediaUrl == null || mediaUrl.trim().isEmpty()) {
            throw new IllegalArgumentException("Story mediaUrl is required");
        }
        mediaUrl = mediaUrl.trim();

        // Reject temporary local blob URLs that will cause black screens for other users
        if (mediaUrl.toLowerCase(Locale.ROOT).startsWith("blob:")) {
            log.error("[StoryService] Rejected story creation with local blob URL: {}", mediaUrl);
            throw new IllegalArgumentException("Cannot publish story with a local blob URL. Media must be uploaded to the server first.");
        }

        // Auto-detect mediaType if missing or incorrectly marked
        if (story.getMediaType() == null || story.getMediaType().isBlank() || "IMAGE".equalsIgnoreCase(story.getMediaType())) {
            if (isVideoUrl(mediaUrl)) {
                story.setMediaType("VIDEO");
            } else if (story.getMediaType() == null) {
                story.setMediaType("IMAGE");
            }
        }

        story.setMediaUrl(mediaUrl);

        if (story.getDoctorId() != null) {
            doctorRepo.findById(story.getDoctorId()).ifPresent(doc -> {
                if (doc.getAvatar() != null && !doc.getAvatar().isBlank()) {
                    story.setAvatar(doc.getAvatar());
                }
                if (story.getDoctorName() == null || story.getDoctorName().isBlank()) {
                    story.setDoctorName(doc.getName());
                }
            });
        }

        if (story.getDoctorName() == null || story.getDoctorName().isBlank()) {
            story.setDoctorName("Doctor");
        }
        if (story.getFullDoctorName() == null || story.getFullDoctorName().isBlank()) {
            story.setFullDoctorName(story.getDoctorName());
        }

        if (story.getCreatedAt() == null) {
            story.setCreatedAt(LocalDateTime.now());
        }
        if (story.getExpiresAt() == null) {
            story.setExpiresAt(LocalDateTime.now().plusHours(24));
        }
        if (story.getLikes() == null) {
            story.setLikes(0);
        }
        if (story.getShares() == null) {
            story.setShares(0);
        }
        if (story.getViews() == null) {
            story.setViews(0);
        }

        Story saved = storyRepo.save(story);
        log.info("[StoryService] Created new {} story ID {} by {} (media: {})",
                saved.getMediaType(), saved.getId(), saved.getDoctorName(), saved.getMediaUrl());
        return saved;
    }

    private boolean isVideoUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") ||
               lower.endsWith(".ogg") || lower.endsWith(".ogv") || lower.endsWith(".mkv") ||
               lower.endsWith(".m4v") || lower.contains(".mp4?") || lower.contains(".webm?") ||
               lower.startsWith("data:video");
    }

    @Transactional
    public Optional<Map<String, Object>> toggleLike(Long storyId, Long doctorId, String doctorName) {
        return storyRepo.findById(storyId).map(story -> {
            boolean liked = false;
            if (doctorId != null) {
                Optional<StoryLike> existing = storyLikeRepo.findByStoryIdAndDoctorId(storyId, doctorId);
                if (existing.isPresent()) {
                    storyLikeRepo.delete(existing.get());
                    storyLikeRepo.flush();
                    liked = false;
                } else {
                    try {
                        storyLikeRepo.save(new StoryLike(storyId, doctorId));
                        storyLikeRepo.flush();
                        liked = true;

                        if (story.getDoctorId() != null && !story.getDoctorId().equals(doctorId)) {
                            String name = (doctorName != null && !doctorName.isBlank()) ? doctorName : "A veterinarian";
                            String senderAvatar = null;
                            var doc = doctorRepo.findById(doctorId);
                            if (doc.isPresent()) {
                                senderAvatar = doc.get().getAvatar();
                            }
                            notificationRepo.save(new Notification(
                                    story.getDoctorId(),
                                    doctorId,
                                    name,
                                    senderAvatar,
                                    "STORY_LIKE",
                                    name + " liked your 24h story.",
                                    storyId
                            ));
                        }
                    } catch (org.springframework.dao.DataIntegrityViolationException e) {
                        log.warn("[StoryService] Duplicate like ignored for story {} doctor {}", storyId, doctorId);
                        liked = true;
                    }
                }
            } else {
                liked = false;
            }
            long actualLikes = storyLikeRepo.countByStoryId(storyId);
            story.setLikes((int) actualLikes);
            Story saved = storyRepo.save(story);
            saved.setIsLiked(liked);

            if (messagingTemplate != null) {
                try {
                    Map<String, Object> broadcast = new HashMap<>();
                    broadcast.put("type", "STORY_LIKE_UPDATED");
                    broadcast.put("storyId", storyId);
                    broadcast.put("likes", saved.getLikes());
                    broadcast.put("doctorId", doctorId);
                    broadcast.put("isLiked", liked);
                    broadcast.put("timestamp", System.currentTimeMillis());
                    messagingTemplate.convertAndSend("/topic/stories", (Object) broadcast);
                } catch (Exception e) {
                    log.warn("[StoryService] Failed to broadcast story like update: {}", e.getMessage());
                }
            }

            Map<String, Object> res = new HashMap<>();
            res.put("story", saved);
            res.put("isLiked", liked);
            res.put("likes", saved.getLikes());
            return res;
        });
    }

    @Transactional
    public Optional<Map<String, Object>> recordShare(Long storyId) {
        return storyRepo.findById(storyId).map(story -> {
            story.setShares(story.getShares() + 1);
            Story saved = storyRepo.save(story);

            Map<String, Object> res = new HashMap<>();
            res.put("story", saved);
            res.put("shares", saved.getShares());
            return res;
        });
    }

    @Transactional
    public Optional<Map<String, Object>> recordView(
            Long storyId,
            Long viewerDoctorId,
            String viewerDoctorName,
            String viewerDoctorAvatar,
            String viewerSpecialty) {
        return storyRepo.findById(storyId).map(story -> {
            Long ownerId = story.getDoctorId();
            String ownerName = story.getDoctorName() != null ? story.getDoctorName().toLowerCase().replaceAll("^dr\\.?\\s*", "").trim() : "";

            boolean isOwner = false;
            if (viewerDoctorId != null && ownerId != null && viewerDoctorId.equals(ownerId)) {
                isOwner = true;
            }
            if (viewerDoctorName != null && !ownerName.isEmpty()) {
                String cleanViewer = viewerDoctorName.toLowerCase().replaceAll("^dr\\.?\\s*", "").trim();
                if (cleanViewer.equalsIgnoreCase(ownerName)) {
                    isOwner = true;
                }
            }

            // Defensively remove any legacy owner views that may have been previously recorded
            if (ownerId != null) {
                storyViewRepo.findByStoryIdAndViewerDoctorId(storyId, ownerId)
                        .ifPresent(storyViewRepo::delete);
            }

            boolean newlyViewed = false;
            // When a user views their own story, do NOT count them as a viewer and do NOT save to story_views
            if (!isOwner && viewerDoctorId != null) {
                if (!storyViewRepo.existsByStoryIdAndViewerDoctorId(storyId, viewerDoctorId)) {
                    storyViewRepo.save(new StoryView(
                            storyId,
                            viewerDoctorId,
                            viewerDoctorName != null ? viewerDoctorName : "Dr. Colleague",
                            viewerDoctorAvatar,
                            viewerSpecialty != null ? viewerSpecialty : "Veterinary Practitioner"
                    ));
                    newlyViewed = true;
                }
            }

            List<StoryView> validViewers = getStoryViewers(storyId);
            int validCount = validViewers.size();
            story.setViews(validCount);
            storyRepo.save(story);

            // Broadcast real-time view update to all connected clients over WebSocket
            if (newlyViewed && messagingTemplate != null) {
                try {
                    Map<String, Object> broadcast = new HashMap<>();
                    broadcast.put("type", "STORY_VIEW_UPDATED");
                    broadcast.put("storyId", storyId);
                    broadcast.put("views", validCount);
                    broadcast.put("viewerDoctorId", viewerDoctorId);
                    broadcast.put("viewerDoctorName", viewerDoctorName);
                    broadcast.put("timestamp", System.currentTimeMillis());
                    messagingTemplate.convertAndSend("/topic/stories", (Object) broadcast);
                } catch (Exception e) {
                    log.warn("[StoryService] Failed to broadcast story view update: {}", e.getMessage());
                }
            }

            Map<String, Object> res = new HashMap<>();
            res.put("storyId", storyId);
            res.put("views", validCount);
            return res;
        });
    }

    public List<StoryView> getStoryViewers(Long storyId) {
        Optional<Story> storyOpt = storyRepo.findById(storyId);
        List<StoryView> raw = storyViewRepo.findByStoryIdOrderByViewedAtDesc(storyId);
        if (storyOpt.isEmpty()) {
            return raw;
        }
        Story story = storyOpt.get();
        Long ownerId = story.getDoctorId();
        String ownerName = story.getDoctorName() != null ? story.getDoctorName().toLowerCase().replaceAll("^dr\\.?\\s*", "").trim() : "";

        return raw.stream().filter(sv -> {
            if (ownerId != null && sv.getViewerDoctorId() != null && sv.getViewerDoctorId().equals(ownerId)) {
                return false;
            }
            if (!ownerName.isEmpty() && sv.getViewerDoctorName() != null) {
                String vName = sv.getViewerDoctorName().toLowerCase().replaceAll("^dr\\.?\\s*", "").trim();
                if (vName.equalsIgnoreCase(ownerName)) {
                    return false;
                }
            }
            return true;
        }).collect(Collectors.toList());
    }

    @Transactional
    public boolean deleteStory(Long storyId) {
        if (!storyRepo.existsById(storyId)) {
            return false;
        }
        List<StoryLike> likes = storyLikeRepo.findByStoryId(storyId);
        if (!likes.isEmpty()) {
            storyLikeRepo.deleteAll(likes);
        }
        List<StoryView> views = storyViewRepo.findByStoryIdOrderByViewedAtDesc(storyId);
        if (!views.isEmpty()) {
            storyViewRepo.deleteAll(views);
        }
        storyRepo.deleteById(storyId);
        return true;
    }
}
