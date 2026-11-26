package com.doctorvet.service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.doctorvet.model.Comment;
import com.doctorvet.model.DoctorProfile;
import com.doctorvet.model.Notification;
import com.doctorvet.model.ShortVideo;
import com.doctorvet.model.VideoLike;
import com.doctorvet.repository.CommentRepository;
import com.doctorvet.repository.DoctorProfileRepository;
import com.doctorvet.repository.NotificationRepository;
import com.doctorvet.repository.ShortVideoRepository;
import com.doctorvet.repository.VideoLikeRepository;

@Service
public class ShortVideoService {

    private static final Logger log = LoggerFactory.getLogger(ShortVideoService.class);

    private final ShortVideoRepository videoRepo;
    private final VideoLikeRepository videoLikeRepo;
    private final CommentRepository commentRepo;
    private final NotificationRepository notificationRepo;
    private final DoctorProfileRepository doctorRepo;
    private final SimpMessagingTemplate messagingTemplate;

    private final ConcurrentHashMap<String, Object> videoLocks = new ConcurrentHashMap<>();

    public ShortVideoService(
            ShortVideoRepository videoRepo,
            VideoLikeRepository videoLikeRepo,
            CommentRepository commentRepo,
            NotificationRepository notificationRepo,
            DoctorProfileRepository doctorRepo,
            @Autowired(required = false) SimpMessagingTemplate messagingTemplate) {
        this.videoRepo = videoRepo;
        this.videoLikeRepo = videoLikeRepo;
        this.commentRepo = commentRepo;
        this.notificationRepo = notificationRepo;
        this.doctorRepo = doctorRepo;
        this.messagingTemplate = messagingTemplate;
    }

    public List<ShortVideo> getAllVideos() {
        return getAllVideos(null);
    }

    public List<ShortVideo> getAllVideos(Long currentDoctorId) {
        List<ShortVideo> list = videoRepo.findAll();
        for (ShortVideo v : list) {
            long actualLikes = videoLikeRepo.countByVideoIdAndVoteType(v.getId(), "LIKE");
            long actualDislikes = videoLikeRepo.countByVideoIdAndVoteType(v.getId(), "DISLIKE");
            if (v.getLikes() != (int) actualLikes || v.getDislikes() != (int) actualDislikes) {
                v.setLikes((int) actualLikes);
                v.setDislikes((int) actualDislikes);
                videoRepo.save(v);
            }
            if (currentDoctorId != null) {
                Optional<VideoLike> userVote = videoLikeRepo.findByVideoIdAndDoctorId(v.getId(), currentDoctorId);
                if (userVote.isPresent()) {
                    VideoLike uv = userVote.get();
                    v.setIsLiked("LIKE".equalsIgnoreCase(uv.getVoteType()));
                    v.setIsDisliked("DISLIKE".equalsIgnoreCase(uv.getVoteType()));
                    v.setUserReaction(uv.getReaction());
                } else {
                    v.setIsLiked(false);
                    v.setIsDisliked(false);
                    v.setUserReaction(null);
                }
            } else {
                v.setIsLiked(false);
                v.setIsDisliked(false);
                v.setUserReaction(null);
            }
            if (v.getThumbnail() != null && (v.getThumbnail().contains("543a7dc6")
                    || v.getThumbnail().contains("bcb16239") || v.getThumbnail().contains("43090d16"))) {
                v.setThumbnail(null);
                videoRepo.save(v);
            }
        }
        return list;
    }

    @Transactional
    public ShortVideo createVideo(ShortVideo video) {
        String dedupeKey = null;
        if (video.getIdempotencyKey() != null && !video.getIdempotencyKey().isBlank()) {
            dedupeKey = "vkey:" + video.getIdempotencyKey().trim();
        } else if (video.getDoctorName() != null) {
            dedupeKey = "vdoc:" + video.getDoctorName().trim() + ":" + (video.getTitle() != null ? video.getTitle().hashCode() : 0);
        }

        Object lock = dedupeKey != null ? videoLocks.computeIfAbsent(dedupeKey, k -> new Object()) : new Object();

        synchronized (lock) {
            try {
                // 1. Idempotency Key check
                if (video.getIdempotencyKey() != null && !video.getIdempotencyKey().isBlank()) {
                    Optional<ShortVideo> existing = videoRepo.findByIdempotencyKey(video.getIdempotencyKey().trim());
                    if (existing.isPresent()) {
                        log.info("[ShortVideoService] Idempotent reel hit: Returning existing video ID {}", existing.get().getId());
                        return existing.get();
                    }
                }

                // 2. Doctor + Title 8-second time window deduplication
                LocalDateTime cutoff = LocalDateTime.now().minusSeconds(8);
                if (video.getDoctorName() != null && !video.getDoctorName().isBlank()) {
                    List<ShortVideo> recent = videoRepo.findByDoctorNameAndCreatedAtAfter(video.getDoctorName().trim(), cutoff);
                    for (ShortVideo v : recent) {
                        if (isSameVideo(v, video)) {
                            log.info("[ShortVideoService] Deduplicated duplicate reel from doctor '{}': Returning existing video ID {}", video.getDoctorName(), v.getId());
                            return v;
                        }
                    }
                }

                if (video.getViews() == null || video.getViews().isBlank()) {
                    video.setViews("1");
                }
                if (video.getViewsCount() <= 0) {
                    video.setViewsCount(1);
                }
                video.setLikes(0);
                if (video.getCreatedAt() == null) {
                    video.setCreatedAt(LocalDateTime.now());
                }

                ShortVideo saved = videoRepo.save(video);
                log.info("[ShortVideoService] Saved new reel ID {} by '{}'", saved.getId(), saved.getDoctorName());

                // Broadcast notifications only once for the newly created reel
                try {
                    String authorName = saved.getDoctorName() != null && !saved.getDoctorName().isBlank()
                            ? saved.getDoctorName()
                            : "A Doctor";
                    String avatar = null;
                    Long authorId = 0L;

                    List<DoctorProfile> allDocs = doctorRepo.findAll();
                    for (DoctorProfile doc : allDocs) {
                        if (doc.getName() != null && (doc.getName().equalsIgnoreCase(authorName)
                                || doc.getName().toLowerCase().contains(authorName.toLowerCase()))) {
                            avatar = doc.getAvatar();
                            authorId = doc.getId();
                            break;
                        }
                    }

                    String notifMsg = authorName + " uploaded a new surgical reel: \"" + saved.getTitle() + "\"";

                    for (DoctorProfile doc : allDocs) {
                        if (!doc.getId().equals(authorId)) {
                            Notification notif = new Notification(
                                    doc.getId(),
                                    authorId,
                                    authorName,
                                    avatar,
                                    "REEL_UPLOAD",
                                    notifMsg,
                                    saved.getId());
                            notificationRepo.save(notif);

                            if (messagingTemplate != null) {
                                try {
                                    messagingTemplate.convertAndSend("/topic/user/" + doc.getId() + "/notifications",
                                            (Object) notif, (Map<String, Object>) null);
                                } catch (Exception ignored) {
                                }
                            }
                        }
                    }

                    if (messagingTemplate != null) {
                        try {
                            messagingTemplate.convertAndSend("/topic/notifications", (Object) saved,
                                    (Map<String, Object>) null);
                        } catch (Exception ignored) {
                        }
                    }
                } catch (Exception e) {
                    log.warn("[ShortVideoService] Notification dispatch note: {}", e.getMessage());
                }

                return saved;
            } finally {
                if (dedupeKey != null) {
                    videoLocks.remove(dedupeKey);
                }
            }
        }
    }

    private boolean isSameVideo(ShortVideo v1, ShortVideo v2) {
        if (v1 == null || v2 == null) return false;
        String t1 = v1.getTitle() != null ? v1.getTitle().trim() : "";
        String t2 = v2.getTitle() != null ? v2.getTitle().trim() : "";
        if (!t1.equalsIgnoreCase(t2)) return false;

        String u1 = v1.getVideoUrl() != null ? v1.getVideoUrl().trim() : "";
        String u2 = v2.getVideoUrl() != null ? v2.getVideoUrl().trim() : "";
        return u1.equals(u2);
    }

    public List<Comment> getVideoComments(Long videoId) {
        return commentRepo.findByPostIdOrderByCreatedAtAsc(100000L + videoId);
    }

    @Transactional
    public Comment addVideoComment(Long videoId, Long authorId, String authorName, String authorAvatar, String authorSpecialty, String content) {
        Comment comment = new Comment(100000L + videoId, authorId, authorName, authorAvatar, authorSpecialty, content);
        Comment saved = commentRepo.save(comment);

        videoRepo.findById(videoId).ifPresent(v -> {
            v.setComments(v.getComments() + 1);
            videoRepo.save(v);
        });

        return saved;
    }

    @Transactional
    public Map<String, Object> toggleLike(Long videoId, Long doctorId, String doctorName) {
        return toggleVideoVote(videoId, doctorId, doctorName, "LIKE", null);
    }

    @Transactional
    public Map<String, Object> toggleVideoVote(Long videoId, Long doctorId, String doctorName, String requestedVoteType, String reaction) {
        ShortVideo video = videoRepo.findById(videoId)
                .orElseThrow(() -> new IllegalArgumentException("Short video not found with id " + videoId));

        Long effectiveDoctorId = (doctorId != null && doctorId > 0) ? doctorId : 1L;
        final boolean isExplicitUnvote = (requestedVoteType == null || requestedVoteType.isBlank())
                && (reaction == null || reaction.isBlank());

        if (requestedVoteType == null || requestedVoteType.isBlank()) {
            if (reaction != null && (reaction.startsWith("sad_") || reaction.equalsIgnoreCase("DISLIKE"))) {
                requestedVoteType = "DISLIKE";
            } else {
                requestedVoteType = "LIKE";
            }
        } else {
            requestedVoteType = requestedVoteType.toUpperCase();
        }

        final String targetVoteType = requestedVoteType;
        final String targetReaction = (reaction != null && !reaction.isBlank())
                ? reaction
                : (targetVoteType.equals("LIKE") ? "like_puppy" : "sad_puppy");

        Optional<VideoLike> existingVote = videoLikeRepo.findByVideoIdAndDoctorId(videoId, effectiveDoctorId);

        boolean isLiked = false;
        boolean isDisliked = false;
        String resultingVote = "NONE";
        String resultingReaction = null;

        if (existingVote.isPresent()) {
            VideoLike vl = existingVote.get();
            String currentVoteType = vl.getVoteType() != null ? vl.getVoteType().toUpperCase() : "LIKE";
            String currentReaction = vl.getReaction();

            boolean isSameReaction = (currentReaction != null && currentReaction.equalsIgnoreCase(targetReaction));
            boolean isQuickUnvote = (reaction == null || reaction.isBlank()) && currentVoteType.equalsIgnoreCase(targetVoteType);

            if (isExplicitUnvote || isSameReaction || isQuickUnvote) {
                videoLikeRepo.delete(vl);
                videoLikeRepo.flush();
                resultingVote = "NONE";
                resultingReaction = null;
            } else {
                vl.setVoteType(targetVoteType);
                vl.setReaction(targetReaction);
                videoLikeRepo.save(vl);
                videoLikeRepo.flush();
                resultingVote = targetVoteType;
                resultingReaction = targetReaction;
                if ("LIKE".equals(resultingVote)) isLiked = true;
                if ("DISLIKE".equals(resultingVote)) isDisliked = true;
            }
        } else if (!isExplicitUnvote) {
            VideoLike newVote = new VideoLike(videoId, effectiveDoctorId, targetVoteType, targetReaction);
            videoLikeRepo.save(newVote);
            videoLikeRepo.flush();
            resultingVote = targetVoteType;
            resultingReaction = targetReaction;
            if ("LIKE".equals(resultingVote)) isLiked = true;
            if ("DISLIKE".equals(resultingVote)) isDisliked = true;
        }

        long actualLikes = videoLikeRepo.countByVideoIdAndVoteType(videoId, "LIKE");
        long actualDislikes = videoLikeRepo.countByVideoIdAndVoteType(videoId, "DISLIKE");
        video.setLikes((int) actualLikes);
        video.setDislikes((int) actualDislikes);
        videoRepo.saveAndFlush(video);

        // Broadcast real-time vote update
        if (messagingTemplate != null) {
            Map<String, Object> event = new HashMap<>();
            event.put("type", "VIDEO_LIKE_UPDATED");
            event.put("videoId", videoId);
            event.put("likes", (int) actualLikes);
            event.put("dislikes", (int) actualDislikes);
            event.put("doctorId", effectiveDoctorId);
            event.put("voteType", resultingVote);
            event.put("reaction", resultingReaction);
            event.put("isLiked", isLiked);
            event.put("isDisliked", isDisliked);
            event.put("timestamp", System.currentTimeMillis());
            try {
                messagingTemplate.convertAndSend("/topic/videos", (Object) event);
                messagingTemplate.convertAndSend("/topic/feed", (Object) event);
            } catch (Exception e) {
                log.warn("[ShortVideoService] WebSocket like broadcast error: {}", e.getMessage());
            }
        }

        Map<String, Object> res = new HashMap<>();
        res.put("video", video);
        res.put("videoId", videoId);
        res.put("likes", (int) actualLikes);
        res.put("dislikes", (int) actualDislikes);
        res.put("isLiked", isLiked);
        res.put("isDisliked", isDisliked);
        res.put("voteType", resultingVote);
        res.put("reaction", resultingReaction);
        return res;
    }

    public boolean isVideoLikedByDoctor(Long videoId, Long doctorId) {
        if (doctorId == null || doctorId <= 0) return false;
        return videoLikeRepo.existsByVideoIdAndDoctorId(videoId, doctorId);
    }

    public Optional<ShortVideo> getVideoById(Long id) {
        return videoRepo.findById(id);
    }

    @Transactional
    public boolean deleteVideo(Long id) {
        if (videoRepo.existsById(id)) {
            videoLikeRepo.deleteAll(videoLikeRepo.findByVideoId(id));
            videoRepo.deleteById(id);
            return true;
        }
        return false;
    }
}
