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

import com.doctorvet.model.CaseLike;
import com.doctorvet.model.ClinicalCase;
import com.doctorvet.model.Comment;
import com.doctorvet.model.Notification;
import com.doctorvet.model.Post;
import com.doctorvet.model.PostLike;
import com.doctorvet.model.Report;
import com.doctorvet.model.SavedPost;
import com.doctorvet.repository.CaseLikeRepository;
import com.doctorvet.repository.ClinicalCaseRepository;
import com.doctorvet.repository.CommentRepository;
import com.doctorvet.repository.NotificationRepository;
import com.doctorvet.repository.PostLikeRepository;
import com.doctorvet.repository.PostRepository;
import com.doctorvet.repository.ReportRepository;
import com.doctorvet.repository.SavedPostRepository;

@Service
public class FeedService {

    private static final Logger log = LoggerFactory.getLogger(FeedService.class);

    private final PostRepository postRepo;
    private final CommentRepository commentRepo;
    private final PostLikeRepository likeRepo;
    private final SavedPostRepository savedRepo;
    private final ReportRepository reportRepo;
    private final NotificationRepository notificationRepo;
    private final ClinicalCaseRepository caseRepo;
    private final CaseLikeRepository caseLikeRepo;
    private final SimpMessagingTemplate messagingTemplate;

    // Concurrency lock table to prevent race conditions during rapid / parallel submissions
    private final ConcurrentHashMap<String, Object> submissionLocks = new ConcurrentHashMap<>();

    public FeedService(PostRepository postRepo,
            CommentRepository commentRepo,
            PostLikeRepository likeRepo,
            SavedPostRepository savedRepo,
            ReportRepository reportRepo,
            NotificationRepository notificationRepo,
            @Autowired(required = false) ClinicalCaseRepository caseRepo,
            @Autowired(required = false) CaseLikeRepository caseLikeRepo,
            @Autowired(required = false) SimpMessagingTemplate messagingTemplate) {
        this.postRepo = postRepo;
        this.commentRepo = commentRepo;
        this.likeRepo = likeRepo;
        this.savedRepo = savedRepo;
        this.reportRepo = reportRepo;
        this.notificationRepo = notificationRepo;
        this.caseRepo = caseRepo;
        this.caseLikeRepo = caseLikeRepo;
        this.messagingTemplate = messagingTemplate;
    }

    public List<Post> getFeedPosts(String type) {
        return getFeedPosts(type, null);
    }

    @Transactional
    public List<Post> getFeedPosts(String type, Long currentDoctorId) {
        List<Post> posts;
        if (type != null && !type.isBlank() && !type.equalsIgnoreCase("all") && !type.equalsIgnoreCase("all posts")) {
            posts = postRepo.findByPostType(type);
        } else {
            posts = postRepo.findAllByOrderByCreatedAtDesc();
        }

        if (!posts.isEmpty()) {
            for (Post p : posts) {
                if ("CLINICAL_CASE".equalsIgnoreCase(p.getPostType())) {
                    ClinicalCase linkedCase = null;
                    if (p.getCaseId() != null && caseRepo != null) {
                        linkedCase = caseRepo.findById(p.getCaseId()).orElse(null);
                    }
                    if (linkedCase == null && caseRepo != null) {
                        for (ClinicalCase cc : caseRepo.findAll()) {
                            if (cc.getAuthorName() != null && p.getAuthorName() != null &&
                                    cc.getAuthorName().equalsIgnoreCase(p.getAuthorName())) {
                                if ((p.getImageUrl() != null && p.getImageUrl().equals(cc.getMediaUrl())) ||
                                        (p.getContent() != null && (p.getContent().contains(cc.getTitle()) || cc.getTitle().contains(p.getContent()) ||
                                                (cc.getPresentingComplaint() != null && p.getContent().contains(cc.getPresentingComplaint()))))) {
                                    linkedCase = cc;
                                    p.setCaseId(cc.getId());
                                    postRepo.save(p);
                                    break;
                                }
                            }
                        }
                    }

                    if (linkedCase != null && caseLikeRepo != null) {
                        Long cId = linkedCase.getId();
                        try {
                            List<CaseLike> cLikes = caseLikeRepo.findByCaseId(cId);
                            for (CaseLike cl : cLikes) {
                                if (likeRepo.findByPostIdAndDoctorId(p.getId(), cl.getDoctorId()).isEmpty()) {
                                    likeRepo.save(new PostLike(p.getId(), cl.getDoctorId(), cl.getVoteType(), cl.getReaction()));
                                }
                            }
                            List<PostLike> pLikes = likeRepo.findByPostId(p.getId());
                            for (PostLike pl : pLikes) {
                                if (caseLikeRepo.findByCaseIdAndDoctorId(cId, pl.getDoctorId()).isEmpty()) {
                                    caseLikeRepo.save(new CaseLike(cId, pl.getDoctorId(), pl.getVoteType(), pl.getReaction()));
                                }
                            }
                            likeRepo.flush();
                            caseLikeRepo.flush();

                            long actualCaseLikes = caseLikeRepo.countByCaseId(cId);
                            if (linkedCase.getLikes() != (int) actualCaseLikes) {
                                linkedCase.setLikes((int) actualCaseLikes);
                                caseRepo.save(linkedCase);
                            }
                        } catch (Exception err) {
                            log.warn("[FeedService] Note syncing post-case likes on read: {}", err.getMessage());
                        }
                    }
                }

                long actualLikes = likeRepo.countByPostIdAndVoteType(p.getId(), "LIKE");
                long actualDislikes = likeRepo.countByPostIdAndVoteType(p.getId(), "DISLIKE");
                if (p.getLikes() != (int) actualLikes || p.getDislikes() != (int) actualDislikes) {
                    p.setLikes((int) actualLikes);
                    p.setDislikes((int) actualDislikes);
                    postRepo.save(p);
                }
                if (currentDoctorId != null) {
                    Optional<PostLike> userVote = likeRepo.findByPostIdAndDoctorId(p.getId(), currentDoctorId);
                    if (userVote.isPresent()) {
                        PostLike uv = userVote.get();
                        boolean isL = "LIKE".equalsIgnoreCase(uv.getVoteType());
                        boolean isD = "DISLIKE".equalsIgnoreCase(uv.getVoteType());
                        p.setIsLiked(isL);
                        p.setIsDisliked(isD);
                        p.setUserReaction(uv.getReaction());
                    } else {
                        p.setIsLiked(false);
                        p.setIsDisliked(false);
                        p.setUserReaction(null);
                    }
                } else {
                    p.setIsLiked(false);
                    p.setIsDisliked(false);
                    p.setUserReaction(null);
                }
            }
        }
        return posts;
    }

    @Transactional
    public Post createPost(Post post) {
        String dedupeKey = null;
        if (post.getIdempotencyKey() != null && !post.getIdempotencyKey().isBlank()) {
            dedupeKey = "key:" + post.getIdempotencyKey().trim();
        } else if (post.getAuthorId() != null) {
            dedupeKey = "author:" + post.getAuthorId() + ":" + (post.getContent() != null ? post.getContent().hashCode() : 0);
        } else if (post.getAuthorName() != null) {
            dedupeKey = "name:" + post.getAuthorName().trim() + ":" + (post.getContent() != null ? post.getContent().hashCode() : 0);
        }

        Object lock = dedupeKey != null ? submissionLocks.computeIfAbsent(dedupeKey, k -> new Object()) : new Object();

        synchronized (lock) {
            try {
                // 1. Idempotency Key deduplication
                if (post.getIdempotencyKey() != null && !post.getIdempotencyKey().isBlank()) {
                    Optional<Post> existing = postRepo.findByIdempotencyKey(post.getIdempotencyKey().trim());
                    if (existing.isPresent()) {
                        log.info("[FeedService] Idempotent post creation hit: Returning existing post ID {}", existing.get().getId());
                        return existing.get();
                    }
                }

                // 2. Author + Content time-window deduplication (last 8 seconds)
                LocalDateTime recentCutoff = LocalDateTime.now().minusSeconds(8);
                if (post.getAuthorId() != null) {
                    List<Post> recent = postRepo.findByAuthorIdAndCreatedAtAfter(post.getAuthorId(), recentCutoff);
                    for (Post p : recent) {
                        if (isSameContent(p, post)) {
                            log.info("[FeedService] Deduplicated duplicate post from authorId {}: Returning existing post ID {}", post.getAuthorId(), p.getId());
                            return p;
                        }
                    }
                } else if (post.getAuthorName() != null && !post.getAuthorName().isBlank()) {
                    List<Post> recent = postRepo.findByAuthorNameAndCreatedAtAfter(post.getAuthorName().trim(), recentCutoff);
                    for (Post p : recent) {
                        if (isSameContent(p, post)) {
                            log.info("[FeedService] Deduplicated duplicate post from authorName {}: Returning existing post ID {}", post.getAuthorName(), p.getId());
                            return p;
                        }
                    }
                }

                // Posts strictly start with 0 likes upon creation
                post.setLikes(0);
                if (post.getCreatedAt() == null) {
                    post.setCreatedAt(LocalDateTime.now());
                }

                Post saved = postRepo.save(post);
                log.info("[FeedService] Successfully published new post ID {} by author '{}'", saved.getId(), saved.getAuthorName());
                return saved;
            } finally {
                if (dedupeKey != null) {
                    submissionLocks.remove(dedupeKey);
                }
            }
        }
    }

    private boolean isSameContent(Post p1, Post p2) {
        if (p1 == null || p2 == null) return false;
        String c1 = p1.getContent() != null ? p1.getContent().trim() : "";
        String c2 = p2.getContent() != null ? p2.getContent().trim() : "";
        if (!c1.equals(c2)) return false;

        String img1 = p1.getImageUrl() != null ? p1.getImageUrl().trim() : "";
        String img2 = p2.getImageUrl() != null ? p2.getImageUrl().trim() : "";
        if (!img1.equals(img2)) return false;

        String vid1 = p1.getVideoUrl() != null ? p1.getVideoUrl().trim() : "";
        String vid2 = p2.getVideoUrl() != null ? p2.getVideoUrl().trim() : "";
        return vid1.equals(vid2);
    }

    public Optional<Post> getPostById(Long id) {
        return postRepo.findById(id);
    }

    @Transactional
    public Optional<Post> updatePost(Long id, Map<String, String> body) {
        return postRepo.findById(id).map(p -> {
            if (body.containsKey("content"))
                p.setContent(body.get("content"));
            if (body.containsKey("imageUrl"))
                p.setImageUrl(body.get("imageUrl"));
            return postRepo.save(p);
        });
    }

    @Transactional
    public boolean deletePost(Long id) {
        if (postRepo.existsById(id)) {
            postRepo.deleteById(id);
            return true;
        }
        return false;
    }

    @Transactional
    public Optional<Map<String, Object>> toggleLike(Long postId, Long doctorId, String doctorName) {
        return toggleVote(postId, doctorId, doctorName, "LIKE", null);
    }

    @Transactional
    public Optional<Map<String, Object>> toggleVote(Long postId, Long doctorId, String doctorName, String requestedVoteType, String reaction) {
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

        return postRepo.findById(postId).map(p -> {
            Optional<PostLike> existing = likeRepo.findByPostIdAndDoctorId(postId, doctorId);
            boolean isLiked = false;
            boolean isDisliked = false;
            String resultingVote = "NONE";
            String resultingReaction = null;

            if (existing.isPresent()) {
                PostLike pl = existing.get();
                String currentVoteType = pl.getVoteType() != null ? pl.getVoteType().toUpperCase() : "LIKE";
                String currentReaction = pl.getReaction();

                boolean isSameReaction = (currentReaction != null && currentReaction.equalsIgnoreCase(targetReaction));
                boolean isQuickUnvote = (reaction == null || reaction.isBlank()) && currentVoteType.equalsIgnoreCase(targetVoteType);

                if (isExplicitUnvote || isSameReaction || isQuickUnvote) {
                    // Clicked same reaction or explicit unvote -> remove vote
                    likeRepo.delete(pl);
                    likeRepo.flush();
                    resultingVote = "NONE";
                    resultingReaction = null;
                } else {
                    // Switched vote or switched emoji reaction
                    pl.setVoteType(targetVoteType);
                    pl.setReaction(targetReaction);
                    likeRepo.save(pl);
                    likeRepo.flush();
                    resultingVote = targetVoteType;
                    resultingReaction = targetReaction;
                    if ("LIKE".equals(resultingVote)) isLiked = true;
                    if ("DISLIKE".equals(resultingVote)) isDisliked = true;
                }
            } else if (!isExplicitUnvote) {
                // New vote
                PostLike newVote = new PostLike(postId, doctorId, targetVoteType, targetReaction);
                likeRepo.save(newVote);
                likeRepo.flush();
                resultingVote = targetVoteType;
                resultingReaction = targetReaction;
                if ("LIKE".equals(resultingVote)) isLiked = true;
                if ("DISLIKE".equals(resultingVote)) isDisliked = true;

                if (isLiked && p.getAuthorId() != null && !p.getAuthorId().equals(doctorId)) {
                    notificationRepo.save(new Notification(
                            p.getAuthorId(),
                            doctorId,
                            doctorName,
                            null,
                            "POST_LIKE",
                            doctorName + " liked your clinical post.",
                            postId));
                }
            }

            long actualLikes = likeRepo.countByPostIdAndVoteType(postId, "LIKE");
            long actualDislikes = likeRepo.countByPostIdAndVoteType(postId, "DISLIKE");
            p.setLikes((int) actualLikes);
            p.setDislikes((int) actualDislikes);
            Post saved = postRepo.save(p);
            saved.setIsLiked(isLiked);
            saved.setIsDisliked(isDisliked);
            saved.setUserReaction(resultingReaction);

            // Synchronize vote with associated ClinicalCase if present or matching
            ClinicalCase linkedCase = null;
            if (caseRepo != null && caseLikeRepo != null) {
                try {
                    Long linkedCaseId = p.getCaseId();
                    if (linkedCaseId != null) {
                        linkedCase = caseRepo.findById(linkedCaseId).orElse(null);
                    }
                    if (linkedCase == null && "CLINICAL_CASE".equalsIgnoreCase(p.getPostType())) {
                        for (ClinicalCase cc : caseRepo.findAll()) {
                            if (cc.getAuthorName() != null && p.getAuthorName() != null &&
                                    cc.getAuthorName().equalsIgnoreCase(p.getAuthorName())) {
                                if ((p.getImageUrl() != null && p.getImageUrl().equals(cc.getMediaUrl())) ||
                                        (p.getContent() != null && (p.getContent().contains(cc.getTitle()) || cc.getTitle().contains(p.getContent()) ||
                                                (cc.getPresentingComplaint() != null && p.getContent().contains(cc.getPresentingComplaint()))))) {
                                    linkedCase = cc;
                                    p.setCaseId(cc.getId());
                                    postRepo.save(p);
                                    break;
                                }
                            }
                        }
                    }

                    if (linkedCase != null) {
                        Long cId = linkedCase.getId();
                        Optional<CaseLike> caseExisting = caseLikeRepo.findByCaseIdAndDoctorId(cId, doctorId);
                        if ("NONE".equals(resultingVote)) {
                            if (caseExisting.isPresent()) {
                                caseLikeRepo.delete(caseExisting.get());
                                caseLikeRepo.flush();
                            }
                        } else {
                            if (caseExisting.isPresent()) {
                                CaseLike cl = caseExisting.get();
                                cl.setVoteType(resultingVote);
                                cl.setReaction(resultingReaction);
                                caseLikeRepo.save(cl);
                            } else {
                                caseLikeRepo.save(new CaseLike(cId, doctorId, resultingVote, resultingReaction));
                            }
                            caseLikeRepo.flush();
                        }

                        long caseActualLikes = caseLikeRepo.countByCaseIdAndVoteType(cId, "LIKE");
                        long caseActualDislikes = caseLikeRepo.countByCaseIdAndVoteType(cId, "DISLIKE");
                        linkedCase.setLikes((int) caseActualLikes);
                        linkedCase.setDislikes((int) caseActualDislikes);
                        caseRepo.save(linkedCase);

                        // Broadcast real-time vote update to all active clients on /topic/cases
                        if (messagingTemplate != null) {
                            Map<String, Object> caseBroadcast = new HashMap<>();
                            caseBroadcast.put("type", "CASE_LIKE_UPDATED");
                            caseBroadcast.put("caseId", cId);
                            caseBroadcast.put("postId", postId);
                            caseBroadcast.put("likes", linkedCase.getLikes());
                            caseBroadcast.put("dislikes", linkedCase.getDislikes());
                            caseBroadcast.put("doctorId", doctorId);
                            caseBroadcast.put("voteType", resultingVote);
                            caseBroadcast.put("reaction", resultingReaction);
                            caseBroadcast.put("isLiked", isLiked);
                            caseBroadcast.put("isDisliked", isDisliked);
                            caseBroadcast.put("timestamp", System.currentTimeMillis());
                            messagingTemplate.convertAndSend("/topic/cases", (Object) caseBroadcast);
                        }
                    }
                } catch (Exception err) {
                    log.warn("[FeedService] Note while synchronizing case vote: {}", err.getMessage());
                }
            }

            // Broadcast real-time vote update to all active clients on /topic/feed
            if (messagingTemplate != null) {
                try {
                    Map<String, Object> broadcast = new HashMap<>();
                    broadcast.put("type", "POST_LIKE_UPDATED");
                    broadcast.put("postId", postId);
                    if (linkedCase != null) {
                        broadcast.put("caseId", linkedCase.getId());
                    } else if (p.getCaseId() != null) {
                        broadcast.put("caseId", p.getCaseId());
                    }
                    broadcast.put("likes", saved.getLikes());
                    broadcast.put("dislikes", saved.getDislikes());
                    broadcast.put("doctorId", doctorId);
                    broadcast.put("voteType", resultingVote);
                    broadcast.put("reaction", resultingReaction);
                    broadcast.put("isLiked", isLiked);
                    broadcast.put("isDisliked", isDisliked);
                    broadcast.put("timestamp", System.currentTimeMillis());
                    messagingTemplate.convertAndSend("/topic/feed", (Object) broadcast);
                } catch (Exception e) {
                    log.warn("[FeedService] Failed to broadcast real-time vote update: {}", e.getMessage());
                }
            }

            Map<String, Object> res = new HashMap<>();
            res.put("post", saved);
            res.put("postId", postId);
            res.put("likes", saved.getLikes());
            res.put("dislikes", saved.getDislikes());
            res.put("isLiked", isLiked);
            res.put("isDisliked", isDisliked);
            res.put("voteType", resultingVote);
            res.put("reaction", resultingReaction);
            return res;
        });
    }

    public List<Comment> getCommentsForPost(Long postId) {
        return commentRepo.findByPostIdOrderByCreatedAtAsc(postId);
    }

    @Transactional
    public Optional<Comment> addComment(Long postId, Long authorId, String authorName, String authorAvatar,
            String authorSpecialty, String content) {
        return postRepo.findById(postId).map(p -> {
            Comment comment = new Comment(postId, authorId, authorName, authorAvatar, authorSpecialty, content);
            Comment savedComment = commentRepo.save(comment);

            p.setCommentsCount(p.getCommentsCount() + 1);
            postRepo.save(p);

            if (p.getAuthorId() != null && (authorId == null || !p.getAuthorId().equals(authorId))) {
                String snippet = content.length() > 40 ? content.substring(0, 40) + "..." : content;
                notificationRepo.save(new Notification(
                        p.getAuthorId(),
                        authorId != null ? authorId : 0L,
                        authorName,
                        authorAvatar,
                        "POST_COMMENT",
                        authorName + " commented on your post: \"" + snippet + "\"",
                        postId));
            }

            return savedComment;
        });
    }

    @Transactional
    public boolean toggleBookmark(Long postId, Long doctorId) {
        Optional<SavedPost> existing = savedRepo.findByPostIdAndDoctorId(postId, doctorId);
        if (existing.isPresent()) {
            savedRepo.delete(existing.get());
            return false;
        } else {
            savedRepo.save(new SavedPost(postId, doctorId));
            return true;
        }
    }

    public List<Post> getSavedPosts(Long doctorId) {
        List<SavedPost> savedList = savedRepo.findByDoctorIdOrderBySavedAtDesc(doctorId);
        List<Long> postIds = savedList.stream()
                .filter(sp -> sp != null && sp.getPostId() != null)
                .map(sp -> sp.getPostId())
                .toList();
        return postRepo.findAllById(postIds);
    }

    @Transactional
    public void reportPost(Long postId, Long reporterId, String reason) {
        reportRepo.save(new Report(reporterId, postId, reason));
    }

    @Transactional
    public boolean deleteComment(Long postId, Long commentId, Long doctorId) {
        return commentRepo.findById(commentId).map(comment -> {
            if (comment.getAuthorId() != null && doctorId != null && !comment.getAuthorId().equals(doctorId)) {
                return false;
            }
            commentRepo.delete(comment);
            postRepo.findById(postId).ifPresent(p -> {
                p.setCommentsCount(Math.max(0, p.getCommentsCount() - 1));
                postRepo.save(p);
            });
            return true;
        }).orElse(false);
    }

    @Transactional
    public Optional<Comment> editComment(Long commentId, Long doctorId, String newContent) {
        return commentRepo.findById(commentId).map(comment -> {
            if (comment.getAuthorId() != null && doctorId != null && !comment.getAuthorId().equals(doctorId)) {
                return comment;
            }
            comment.setContent(newContent);
            return commentRepo.save(comment);
        });
    }

    @Transactional
    public Optional<Map<String, Object>> recordShare(Long postId) {
        return postRepo.findById(postId).map(post -> {
            post.setShares(post.getShares() + 1);
            Post saved = postRepo.save(post);
            Map<String, Object> res = new HashMap<>();
            res.put("postId", saved.getId());
            res.put("shares", saved.getShares());
            return res;
        });
    }
}
