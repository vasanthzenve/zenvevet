package com.doctorvet.service;

import com.doctorvet.model.CaseLike;
import com.doctorvet.model.ClinicalCase;
import com.doctorvet.model.DoctorProfile;
import com.doctorvet.model.Notification;
import com.doctorvet.model.Post;
import com.doctorvet.model.PostLike;
import com.doctorvet.repository.CaseLikeRepository;
import com.doctorvet.repository.ClinicalCaseRepository;
import com.doctorvet.repository.DoctorProfileRepository;
import com.doctorvet.repository.NotificationRepository;
import com.doctorvet.repository.PostRepository;
import com.doctorvet.repository.PostLikeRepository;
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
public class ClinicalCaseService {

    private static final Logger log = LoggerFactory.getLogger(ClinicalCaseService.class);

    private final ClinicalCaseRepository caseRepo;
    private final CaseLikeRepository caseLikeRepo;
    private final NotificationRepository notificationRepo;
    private final DoctorProfileRepository doctorRepo;
    private final PostRepository postRepo;
    private final PostLikeRepository postLikeRepo;
    private final SimpMessagingTemplate messagingTemplate;

    private final ConcurrentHashMap<String, Object> caseLocks = new ConcurrentHashMap<>();

    public ClinicalCaseService(
            ClinicalCaseRepository caseRepo,
            CaseLikeRepository caseLikeRepo,
            NotificationRepository notificationRepo,
            DoctorProfileRepository doctorRepo,
            @Autowired(required = false) PostRepository postRepo,
            @Autowired(required = false) PostLikeRepository postLikeRepo,
            @Autowired(required = false) SimpMessagingTemplate messagingTemplate) {
        this.caseRepo = caseRepo;
        this.caseLikeRepo = caseLikeRepo;
        this.notificationRepo = notificationRepo;
        this.doctorRepo = doctorRepo;
        this.postRepo = postRepo;
        this.postLikeRepo = postLikeRepo;
        this.messagingTemplate = messagingTemplate;
    }

    public List<ClinicalCase> getAllCases(String species) {
        return getAllCases(species, null);
    }

    @Transactional
    public List<ClinicalCase> getAllCases(String species, Long currentDoctorId) {
        List<ClinicalCase> cases;
        if (species != null && !species.isBlank() && !species.equalsIgnoreCase("all")) {
            cases = caseRepo.findBySpecies(species);
        } else {
            cases = caseRepo.findAll();
        }

        if (!cases.isEmpty()) {
            for (ClinicalCase c : cases) {
                // Bidirectional sync between matching Post and ClinicalCase
                if (postRepo != null && postLikeRepo != null) {
                    try {
                        List<Post> matchingPosts = new ArrayList<>(postRepo.findByCaseId(c.getId()));
                        if (matchingPosts.isEmpty()) {
                            for (Post p : postRepo.findAll()) {
                                if ("CLINICAL_CASE".equalsIgnoreCase(p.getPostType())) {
                                    if (p.getAuthorName() != null && c.getAuthorName() != null &&
                                            p.getAuthorName().equalsIgnoreCase(c.getAuthorName())) {
                                        if ((c.getMediaUrl() != null && c.getMediaUrl().equals(p.getImageUrl())) ||
                                                (p.getContent() != null && (p.getContent().contains(c.getTitle()) || c.getTitle().contains(p.getContent()) ||
                                                        (c.getPresentingComplaint() != null && p.getContent().contains(c.getPresentingComplaint()))))) {
                                            p.setCaseId(c.getId());
                                            postRepo.save(p);
                                            matchingPosts.add(p);
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        for (Post p : matchingPosts) {
                            List<PostLike> pLikes = postLikeRepo.findByPostId(p.getId());
                            for (PostLike pl : pLikes) {
                                if (caseLikeRepo.findByCaseIdAndDoctorId(c.getId(), pl.getDoctorId()).isEmpty()) {
                                    caseLikeRepo.save(new CaseLike(c.getId(), pl.getDoctorId(), pl.getVoteType(), pl.getReaction()));
                                }
                            }
                            List<CaseLike> cLikes = caseLikeRepo.findByCaseId(c.getId());
                            for (CaseLike cl : cLikes) {
                                if (postLikeRepo.findByPostIdAndDoctorId(p.getId(), cl.getDoctorId()).isEmpty()) {
                                    postLikeRepo.save(new PostLike(p.getId(), cl.getDoctorId(), cl.getVoteType(), cl.getReaction()));
                                }
                            }
                            caseLikeRepo.flush();
                            postLikeRepo.flush();

                            long postActualLikes = postLikeRepo.countByPostId(p.getId());
                            if (p.getLikes() != (int) postActualLikes) {
                                p.setLikes((int) postActualLikes);
                                postRepo.save(p);
                            }
                        }
                    } catch (Exception err) {
                        log.warn("[ClinicalCaseService] Note syncing case-post likes on read: {}", err.getMessage());
                    }
                }

                long actualLikes = caseLikeRepo.countByCaseIdAndVoteType(c.getId(), "LIKE");
                long actualDislikes = caseLikeRepo.countByCaseIdAndVoteType(c.getId(), "DISLIKE");
                if (c.getLikes() != (int) actualLikes || c.getDislikes() != (int) actualDislikes) {
                    c.setLikes((int) actualLikes);
                    c.setDislikes((int) actualDislikes);
                    caseRepo.save(c);
                }
                if (currentDoctorId != null) {
                    Optional<CaseLike> userVote = caseLikeRepo.findByCaseIdAndDoctorId(c.getId(), currentDoctorId);
                    if (userVote.isPresent()) {
                        CaseLike uv = userVote.get();
                        boolean isL = "LIKE".equalsIgnoreCase(uv.getVoteType());
                        boolean isD = "DISLIKE".equalsIgnoreCase(uv.getVoteType());
                        c.setIsLiked(isL);
                        c.setIsDisliked(isD);
                        c.setUserReaction(uv.getReaction());
                    } else {
                        c.setIsLiked(false);
                        c.setIsDisliked(false);
                        c.setUserReaction(null);
                    }
                } else {
                    c.setIsLiked(false);
                    c.setIsDisliked(false);
                    c.setUserReaction(null);
                }
            }
        }
        return cases;
    }

    @Transactional
    public Optional<ClinicalCase> getCaseById(Long id) {
        return caseRepo.findById(id).map(c -> {
            c.setViews(c.getViews() + 1);
            return caseRepo.save(c);
        });
    }

    @Transactional
    public ClinicalCase createCase(ClinicalCase clinicalCase) {
        String dedupeKey = null;
        if (clinicalCase.getIdempotencyKey() != null && !clinicalCase.getIdempotencyKey().isBlank()) {
            dedupeKey = "ckey:" + clinicalCase.getIdempotencyKey().trim();
        } else if (clinicalCase.getAuthorName() != null) {
            dedupeKey = "cauth:" + clinicalCase.getAuthorName().trim() + ":" + (clinicalCase.getTitle() != null ? clinicalCase.getTitle().hashCode() : 0);
        }

        Object lock = dedupeKey != null ? caseLocks.computeIfAbsent(dedupeKey, k -> new Object()) : new Object();

        synchronized (lock) {
            try {
                // 1. Idempotency Key check
                if (clinicalCase.getIdempotencyKey() != null && !clinicalCase.getIdempotencyKey().isBlank()) {
                    Optional<ClinicalCase> existing = caseRepo.findByIdempotencyKey(clinicalCase.getIdempotencyKey().trim());
                    if (existing.isPresent()) {
                        log.info("[ClinicalCaseService] Idempotent case hit: Returning existing case ID {}", existing.get().getId());
                        return existing.get();
                    }
                }

                // 2. Author + Title 8-second time window deduplication
                LocalDateTime cutoff = LocalDateTime.now().minusSeconds(8);
                if (clinicalCase.getAuthorName() != null && !clinicalCase.getAuthorName().isBlank()) {
                    List<ClinicalCase> recent = caseRepo.findByAuthorNameAndCreatedAtAfter(clinicalCase.getAuthorName().trim(), cutoff);
                    for (ClinicalCase c : recent) {
                        if (isSameCase(c, clinicalCase)) {
                            log.info("[ClinicalCaseService] Deduplicated duplicate case from author '{}': Returning existing case ID {}", clinicalCase.getAuthorName(), c.getId());
                            return c;
                        }
                    }
                }

                if (clinicalCase.getViews() <= 0) {
                    clinicalCase.setViews(1);
                }
                if (clinicalCase.getCreatedAt() == null) {
                    clinicalCase.setCreatedAt(LocalDateTime.now());
                }

                ClinicalCase saved = caseRepo.save(clinicalCase);
                log.info("[ClinicalCaseService] Saved new clinical case ID {} by '{}'", saved.getId(), saved.getAuthorName());

                // Broadcast notifications only once for the newly created case
                try {
                    String authorName = saved.getAuthorName() != null && !saved.getAuthorName().isBlank() ? saved.getAuthorName() : "A Colleague Doctor";
                    String avatar = null;
                    Long authorId = 0L;

                    List<DoctorProfile> allDocs = doctorRepo.findAll();
                    for (DoctorProfile doc : allDocs) {
                        if (doc.getName() != null && (doc.getName().equalsIgnoreCase(authorName) || doc.getName().toLowerCase().contains(authorName.toLowerCase()))) {
                            avatar = doc.getAvatar();
                            authorId = doc.getId();
                            break;
                        }
                    }

                    String notifMsg = authorName + " shared a new clinical case: \"" + saved.getTitle() + "\" (" + (saved.getSpecies() != null ? saved.getSpecies() : "General") + ")";

                    for (DoctorProfile doc : allDocs) {
                        if (!doc.getId().equals(authorId)) {
                            Notification notif = new Notification(
                                    doc.getId(),
                                    authorId,
                                    authorName,
                                    avatar,
                                    "CLINICAL_CASE_SHARED",
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
                    log.warn("[ClinicalCaseService] Notification dispatch note: {}", e.getMessage());
                }

                return saved;
            } finally {
                if (dedupeKey != null) {
                    caseLocks.remove(dedupeKey);
                }
            }
        }
    }

    private boolean isSameCase(ClinicalCase c1, ClinicalCase c2) {
        if (c1 == null || c2 == null) return false;
        String t1 = c1.getTitle() != null ? c1.getTitle().trim() : "";
        String t2 = c2.getTitle() != null ? c2.getTitle().trim() : "";
        if (!t1.equalsIgnoreCase(t2)) return false;

        String u1 = c1.getMediaUrl() != null ? c1.getMediaUrl().trim() : "";
        String u2 = c2.getMediaUrl() != null ? c2.getMediaUrl().trim() : "";
        return u1.equals(u2);
    }

    @Transactional
    public Optional<Map<String, Object>> toggleLike(Long caseId, Long doctorId, String doctorName) {
        return toggleVote(caseId, doctorId, doctorName, "LIKE", null);
    }

    @Transactional
    public Optional<Map<String, Object>> toggleVote(Long caseId, Long doctorId, String doctorName, String requestedVoteType, String reaction) {
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

        return caseRepo.findById(caseId).map(c -> {
            Optional<CaseLike> existing = caseLikeRepo.findByCaseIdAndDoctorId(caseId, doctorId);
            boolean isLiked = false;
            boolean isDisliked = false;
            String resultingVote = "NONE";
            String resultingReaction = null;

            if (existing.isPresent()) {
                CaseLike cl = existing.get();
                String currentVoteType = cl.getVoteType() != null ? cl.getVoteType().toUpperCase() : "LIKE";
                String currentReaction = cl.getReaction();

                boolean isSameReaction = (currentReaction != null && currentReaction.equalsIgnoreCase(targetReaction));
                boolean isQuickUnvote = (reaction == null || reaction.isBlank()) && currentVoteType.equalsIgnoreCase(targetVoteType);

                if (isExplicitUnvote || isSameReaction || isQuickUnvote) {
                    // Clicked same reaction or explicit unvote -> remove vote
                    caseLikeRepo.delete(cl);
                    caseLikeRepo.flush();
                    resultingVote = "NONE";
                    resultingReaction = null;
                } else {
                    // Switched vote or switched emoji reaction
                    cl.setVoteType(targetVoteType);
                    cl.setReaction(targetReaction);
                    caseLikeRepo.save(cl);
                    caseLikeRepo.flush();
                    resultingVote = targetVoteType;
                    resultingReaction = targetReaction;
                    if ("LIKE".equals(resultingVote)) isLiked = true;
                    if ("DISLIKE".equals(resultingVote)) isDisliked = true;
                }
            } else if (!isExplicitUnvote) {
                // New vote
                CaseLike newVote = new CaseLike(caseId, doctorId, targetVoteType, targetReaction);
                caseLikeRepo.save(newVote);
                caseLikeRepo.flush();
                resultingVote = targetVoteType;
                resultingReaction = targetReaction;
                if ("LIKE".equals(resultingVote)) isLiked = true;
                if ("DISLIKE".equals(resultingVote)) isDisliked = true;

                if (isLiked && c.getAuthorId() != null && !c.getAuthorId().equals(doctorId)) {
                    notificationRepo.save(new Notification(
                            c.getAuthorId(),
                            doctorId,
                            doctorName,
                            null,
                            "CASE_LIKE",
                            doctorName + " liked your clinical case study.",
                            caseId));
                }
            }

            long actualLikes = caseLikeRepo.countByCaseIdAndVoteType(caseId, "LIKE");
            long actualDislikes = caseLikeRepo.countByCaseIdAndVoteType(caseId, "DISLIKE");
            c.setLikes((int) actualLikes);
            c.setDislikes((int) actualDislikes);
            ClinicalCase saved = caseRepo.save(c);
            saved.setIsLiked(isLiked);
            saved.setIsDisliked(isDisliked);
            saved.setUserReaction(resultingReaction);

            // Synchronize vote with associated Post(s) in feed
            List<Post> matchingPosts = new ArrayList<>();
            if (postRepo != null && postLikeRepo != null) {
                try {
                    matchingPosts.addAll(postRepo.findByCaseId(caseId));
                    if (matchingPosts.isEmpty()) {
                        for (Post p : postRepo.findAll()) {
                            if ("CLINICAL_CASE".equalsIgnoreCase(p.getPostType())) {
                                if (p.getAuthorName() != null && c.getAuthorName() != null &&
                                        p.getAuthorName().equalsIgnoreCase(c.getAuthorName())) {
                                    if ((c.getMediaUrl() != null && c.getMediaUrl().equals(p.getImageUrl())) ||
                                            (p.getContent() != null && (p.getContent().contains(c.getTitle()) || c.getTitle().contains(p.getContent()) ||
                                                    (c.getPresentingComplaint() != null && p.getContent().contains(c.getPresentingComplaint()))))) {
                                        p.setCaseId(caseId);
                                        postRepo.save(p);
                                        matchingPosts.add(p);
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    for (Post p : matchingPosts) {
                        Optional<PostLike> postExisting = postLikeRepo.findByPostIdAndDoctorId(p.getId(), doctorId);
                        if ("NONE".equals(resultingVote)) {
                            if (postExisting.isPresent()) {
                                postLikeRepo.delete(postExisting.get());
                                postLikeRepo.flush();
                            }
                        } else {
                            if (postExisting.isPresent()) {
                                PostLike pl = postExisting.get();
                                pl.setVoteType(resultingVote);
                                pl.setReaction(resultingReaction);
                                postLikeRepo.save(pl);
                            } else {
                                postLikeRepo.save(new PostLike(p.getId(), doctorId, resultingVote, resultingReaction));
                            }
                            postLikeRepo.flush();
                        }
                        long postActualLikes = postLikeRepo.countByPostIdAndVoteType(p.getId(), "LIKE");
                        long postActualDislikes = postLikeRepo.countByPostIdAndVoteType(p.getId(), "DISLIKE");
                        p.setLikes((int) postActualLikes);
                        p.setDislikes((int) postActualDislikes);
                        postRepo.save(p);

                        if (messagingTemplate != null) {
                            Map<String, Object> postBroadcast = new HashMap<>();
                            postBroadcast.put("type", "POST_LIKE_UPDATED");
                            postBroadcast.put("postId", p.getId());
                            postBroadcast.put("caseId", caseId);
                            postBroadcast.put("likes", p.getLikes());
                            postBroadcast.put("dislikes", p.getDislikes());
                            postBroadcast.put("doctorId", doctorId);
                            postBroadcast.put("voteType", resultingVote);
                            postBroadcast.put("reaction", resultingReaction);
                            postBroadcast.put("isLiked", isLiked);
                            postBroadcast.put("isDisliked", isDisliked);
                            postBroadcast.put("timestamp", System.currentTimeMillis());
                            messagingTemplate.convertAndSend("/topic/feed", (Object) postBroadcast);
                        }
                    }
                } catch (Exception err) {
                    log.warn("[ClinicalCaseService] Note while synchronizing post vote: {}", err.getMessage());
                }
            }

            if (messagingTemplate != null) {
                try {
                    Map<String, Object> broadcast = new HashMap<>();
                    broadcast.put("type", "CASE_LIKE_UPDATED");
                    broadcast.put("caseId", caseId);
                    if (!matchingPosts.isEmpty()) {
                        broadcast.put("postId", matchingPosts.get(0).getId());
                    }
                    broadcast.put("likes", saved.getLikes());
                    broadcast.put("dislikes", saved.getDislikes());
                    broadcast.put("doctorId", doctorId);
                    broadcast.put("voteType", resultingVote);
                    broadcast.put("reaction", resultingReaction);
                    broadcast.put("isLiked", isLiked);
                    broadcast.put("isDisliked", isDisliked);
                    broadcast.put("timestamp", System.currentTimeMillis());
                    messagingTemplate.convertAndSend("/topic/cases", (Object) broadcast);
                } catch (Exception e) {
                    log.warn("[ClinicalCaseService] Failed to broadcast real-time case vote update: {}", e.getMessage());
                }
            }

            Map<String, Object> res = new HashMap<>();
            res.put("case", saved);
            res.put("caseId", caseId);
            res.put("likes", saved.getLikes());
            res.put("dislikes", saved.getDislikes());
            res.put("isLiked", isLiked);
            res.put("isDisliked", isDisliked);
            res.put("voteType", resultingVote);
            res.put("reaction", resultingReaction);
            return res;
        });
    }

    @Transactional
    public boolean deleteCase(Long id) {
        if (caseRepo.existsById(id)) {
            try {
                caseLikeRepo.deleteByCaseId(id);
            } catch (Exception ignored) {}
            caseRepo.deleteById(id);
            return true;
        }
        return false;
    }
}
