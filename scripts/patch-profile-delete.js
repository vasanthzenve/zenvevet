const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. Update DoctorProfileService.java
const servicePath = path.join(rootDir, 'server/src/main/java/com/doctorvet/service/DoctorProfileService.java');
let serviceCode = fs.readFileSync(servicePath, 'utf8');

const newImports = `import com.doctorvet.model.*;
import com.doctorvet.repository.*;
import com.doctorvet.security.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;`;

serviceCode = serviceCode.replace(/import com\.doctorvet\.model\.DoctorProfile;[\s\S]*?import java\.util\.Optional;/, newImports);

// Update constructor & fields
const oldFields = `    private final DoctorProfileRepository repository;

    public DoctorProfileService(DoctorProfileRepository repository) {
        this.repository = repository;
    }`;

const newFields = `    private static final Logger log = LoggerFactory.getLogger(DoctorProfileService.class);

    private final DoctorProfileRepository repository;
    private final PostRepository postRepo;
    private final CommentRepository commentRepo;
    private final PostLikeRepository postLikeRepo;
    private final SavedPostRepository savedPostRepo;
    private final StoryRepository storyRepo;
    private final StoryLikeRepository storyLikeRepo;
    private final StoryViewRepository storyViewRepo;
    private final ClinicalCaseRepository caseRepo;
    private final ShortVideoRepository videoRepo;
    private final DoctorConnectionRepository connectionRepo;
    private final ConnectionRequestRepository requestRepo;
    private final NotificationRepository notificationRepo;
    private final ConversationRepository conversationRepo;
    private final MessageRepository messageRepo;
    private final CommunityMemberRepository communityMemberRepo;
    private final UserLoginDeviceRepository userLoginDeviceRepo;
    private final PasswordResetOtpRepository passwordResetOtpRepo;
    private final TokenService tokenService;

    public DoctorProfileService(
            DoctorProfileRepository repository,
            PostRepository postRepo,
            CommentRepository commentRepo,
            PostLikeRepository postLikeRepo,
            SavedPostRepository savedPostRepo,
            StoryRepository storyRepo,
            StoryLikeRepository storyLikeRepo,
            StoryViewRepository storyViewRepo,
            ClinicalCaseRepository caseRepo,
            ShortVideoRepository videoRepo,
            DoctorConnectionRepository connectionRepo,
            ConnectionRequestRepository requestRepo,
            NotificationRepository notificationRepo,
            ConversationRepository conversationRepo,
            MessageRepository messageRepo,
            CommunityMemberRepository communityMemberRepo,
            UserLoginDeviceRepository userLoginDeviceRepo,
            PasswordResetOtpRepository passwordResetOtpRepo,
            TokenService tokenService) {
        this.repository = repository;
        this.postRepo = postRepo;
        this.commentRepo = commentRepo;
        this.postLikeRepo = postLikeRepo;
        this.savedPostRepo = savedPostRepo;
        this.storyRepo = storyRepo;
        this.storyLikeRepo = storyLikeRepo;
        this.storyViewRepo = storyViewRepo;
        this.caseRepo = caseRepo;
        this.videoRepo = videoRepo;
        this.connectionRepo = connectionRepo;
        this.requestRepo = requestRepo;
        this.notificationRepo = notificationRepo;
        this.conversationRepo = conversationRepo;
        this.messageRepo = messageRepo;
        this.communityMemberRepo = communityMemberRepo;
        this.userLoginDeviceRepo = userLoginDeviceRepo;
        this.passwordResetOtpRepo = passwordResetOtpRepo;
        this.tokenService = tokenService;
    }`;

serviceCode = serviceCode.replace(oldFields, newFields);

// Add permanentlyDeleteDoctor method before the last closing brace
const deleteMethod = `
    /**
     * Permanently delete a doctor profile and cascade-delete all associated records across the database:
     * stories, posts, comments, likes, saved bookmarks, clinical cases, short videos,
     * connections, requests, direct messages, notifications, and auth sessions.
     */
    @Transactional
    public boolean permanentlyDeleteDoctor(Long doctorId) {
        if (doctorId == null) return false;
        Optional<DoctorProfile> profileOpt = repository.findById(doctorId);
        if (profileOpt.isEmpty()) return false;

        DoctorProfile profile = profileOpt.get();
        String doctorName = profile.getName();
        String doctorEmail = profile.getEmail();

        // 1. Delete all stories authored by this doctor
        try {
            List<Story> stories = storyRepo.findByDoctorIdOrderByCreatedAtDesc(doctorId);
            for (Story s : stories) {
                storyLikeRepo.deleteAll(storyLikeRepo.findByStoryId(s.getId()));
                storyViewRepo.deleteAll(storyViewRepo.findByStoryIdOrderByViewedAtDesc(s.getId()));
                storyRepo.delete(s);
            }
        } catch (Exception e) {
            log.warn("Error cleaning up stories for doctor {}: {}", doctorId, e.getMessage());
        }

        // 2. Delete doctor's likes & views on other stories
        try {
            List<StoryLike> myStoryLikes = storyLikeRepo.findAll().stream()
                    .filter(sl -> sl.getDoctorId() != null && sl.getDoctorId().equals(doctorId))
                    .toList();
            if (!myStoryLikes.isEmpty()) storyLikeRepo.deleteAll(myStoryLikes);

            List<StoryView> myStoryViews = storyViewRepo.findAll().stream()
                    .filter(sv -> sv.getViewerDoctorId() != null && sv.getViewerDoctorId().equals(doctorId))
                    .toList();
            if (!myStoryViews.isEmpty()) storyViewRepo.deleteAll(myStoryViews);
        } catch (Exception e) {
            log.warn("Error cleaning up story interactions for doctor {}: {}", doctorId, e.getMessage());
        }

        // 3. Delete all posts authored by this doctor (including post comments and likes)
        try {
            List<Post> posts = postRepo.findAll().stream()
                    .filter(p -> (p.getAuthorId() != null && p.getAuthorId().equals(doctorId)) ||
                                 (doctorName != null && p.getAuthorName() != null && p.getAuthorName().equalsIgnoreCase(doctorName)))
                    .toList();
            for (Post p : posts) {
                commentRepo.deleteAll(commentRepo.findByPostIdOrderByCreatedAtAsc(p.getId()));
                List<PostLike> postLikes = postLikeRepo.findAll().stream()
                        .filter(pl -> pl.getPostId() != null && pl.getPostId().equals(p.getId()))
                        .toList();
                if (!postLikes.isEmpty()) postLikeRepo.deleteAll(postLikes);

                List<SavedPost> savedPosts = savedPostRepo.findAll().stream()
                        .filter(sp -> sp.getPostId() != null && sp.getPostId().equals(p.getId()))
                        .toList();
                if (!savedPosts.isEmpty()) savedPostRepo.deleteAll(savedPosts);

                postRepo.delete(p);
            }
        } catch (Exception e) {
            log.warn("Error cleaning up posts for doctor {}: {}", doctorId, e.getMessage());
        }

        // 4. Delete doctor's own comments, likes, and bookmarks on other posts
        try {
            List<Comment> myComments = commentRepo.findAll().stream()
                    .filter(c -> (c.getAuthorId() != null && c.getAuthorId().equals(doctorId)) ||
                                 (doctorName != null && c.getAuthorName() != null && c.getAuthorName().equalsIgnoreCase(doctorName)))
                    .toList();
            if (!myComments.isEmpty()) commentRepo.deleteAll(myComments);

            List<PostLike> myPostLikes = postLikeRepo.findAll().stream()
                    .filter(pl -> pl.getDoctorId() != null && pl.getDoctorId().equals(doctorId))
                    .toList();
            if (!myPostLikes.isEmpty()) postLikeRepo.deleteAll(myPostLikes);

            List<SavedPost> mySavedPosts = savedPostRepo.findByDoctorIdOrderBySavedAtDesc(doctorId);
            if (!mySavedPosts.isEmpty()) savedPostRepo.deleteAll(mySavedPosts);
        } catch (Exception e) {
            log.warn("Error cleaning up post interactions for doctor {}: {}", doctorId, e.getMessage());
        }

        // 5. Delete clinical cases authored by this doctor
        try {
            List<ClinicalCase> cases = caseRepo.findAll().stream()
                    .filter(c -> (c.getAuthorId() != null && c.getAuthorId().equals(doctorId)) ||
                                 (doctorName != null && c.getAuthorName() != null && c.getAuthorName().equalsIgnoreCase(doctorName)))
                    .toList();
            if (!cases.isEmpty()) caseRepo.deleteAll(cases);
        } catch (Exception e) {
            log.warn("Error cleaning up clinical cases for doctor {}: {}", doctorId, e.getMessage());
        }

        // 6. Delete short videos / reels authored by this doctor
        try {
            List<ShortVideo> videos = videoRepo.findAll().stream()
                    .filter(v -> (v.getDoctorId() != null && v.getDoctorId().equals(doctorId)) ||
                                 (doctorName != null && v.getDoctorName() != null && v.getDoctorName().equalsIgnoreCase(doctorName)))
                    .toList();
            if (!videos.isEmpty()) videoRepo.deleteAll(videos);
        } catch (Exception e) {
            log.warn("Error cleaning up short videos for doctor {}: {}", doctorId, e.getMessage());
        }

        // 7. Delete professional connections & connection requests
        try {
            List<DoctorConnection> connections = connectionRepo.findAllByDoctorId(doctorId);
            if (!connections.isEmpty()) connectionRepo.deleteAll(connections);

            List<ConnectionRequest> reqs = requestRepo.findAll().stream()
                    .filter(r -> (r.getSenderId() != null && r.getSenderId().equals(doctorId)) ||
                                 (r.getReceiverId() != null && r.getReceiverId().equals(doctorId)))
                    .toList();
            if (!reqs.isEmpty()) requestRepo.deleteAll(reqs);
        } catch (Exception e) {
            log.warn("Error cleaning up connections for doctor {}: {}", doctorId, e.getMessage());
        }

        // 8. Delete notifications
        try {
            List<Notification> notifs = notificationRepo.findAll().stream()
                    .filter(n -> (n.getRecipientId() != null && n.getRecipientId().equals(doctorId)) ||
                                 (n.getSenderId() != null && n.getSenderId().equals(doctorId)))
                    .toList();
            if (!notifs.isEmpty()) notificationRepo.deleteAll(notifs);
        } catch (Exception e) {
            log.warn("Error cleaning up notifications for doctor {}: {}", doctorId, e.getMessage());
        }

        // 9. Delete direct chat conversations and messages
        try {
            List<Conversation> conversations = conversationRepo.findAllByDoctorId(doctorId);
            for (Conversation conv : conversations) {
                List<Message> msgs = messageRepo.findByConversationIdOrderByCreatedAtAsc(conv.getId());
                if (!msgs.isEmpty()) messageRepo.deleteAll(msgs);
                conversationRepo.delete(conv);
            }
        } catch (Exception e) {
            log.warn("Error cleaning up conversations for doctor {}: {}", doctorId, e.getMessage());
        }

        // 10. Community memberships
        try {
            List<CommunityMember> memberships = communityMemberRepo.findAll().stream()
                    .filter(cm -> cm.getDoctorId() != null && cm.getDoctorId().equals(doctorId))
                    .toList();
            if (!memberships.isEmpty()) communityMemberRepo.deleteAll(memberships);
        } catch (Exception e) {
            log.warn("Error cleaning up community memberships for doctor {}: {}", doctorId, e.getMessage());
        }

        // 11. User login devices & password reset OTPs
        try {
            if (doctorEmail != null && !doctorEmail.isBlank()) {
                List<UserLoginDevice> devices = userLoginDeviceRepo.findByUserEmailIgnoreCase(doctorEmail);
                if (!devices.isEmpty()) userLoginDeviceRepo.deleteAll(devices);

                List<PasswordResetOtp> otps = passwordResetOtpRepo.findAllByEmailIgnoreCase(doctorEmail);
                if (!otps.isEmpty()) passwordResetOtpRepo.deleteAll(otps);
            }
        } catch (Exception e) {
            log.warn("Error cleaning up devices/otps for doctor {}: {}", doctorId, e.getMessage());
        }

        // 12. Terminate all active sessions & refresh tokens
        try {
            tokenService.invalidateAllForDoctor(doctorId);
        } catch (Exception e) {
            log.warn("Error invalidating tokens for doctor {}: {}", doctorId, e.getMessage());
        }

        // 13. Permanently delete the doctor profile itself
        repository.deleteById(doctorId);
        log.info("Permanently deleted doctor profile and all associated data for doctor ID: {}", doctorId);
        return true;
    }
}
`;

serviceCode = serviceCode.replace(/\}\s*$/, deleteMethod);
fs.writeFileSync(servicePath, serviceCode, 'utf8');
console.log('[OK] Updated DoctorProfileService.java with permanentlyDeleteDoctor');

// 2. Update DoctorProfileController.java
const controllerPath = path.join(rootDir, 'server/src/main/java/com/doctorvet/controller/DoctorProfileController.java');
let controllerCode = fs.readFileSync(controllerPath, 'utf8');

const deleteEndpoints = `
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteAccount(
            @PathVariable String id,
            HttpServletRequest request) {

        Long numericId = null;
        try {
            String digits = id.replaceAll("[^0-9]", "");
            if (!digits.isBlank()) {
                numericId = Long.parseLong(digits);
            }
        } catch (Exception ignored) {}

        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to delete account"));
        }

        // Ownership Verification: Prevent IDOR (prevent deleting someone else's account)
        if (numericId != null && !numericId.equals(authenticatedDoctorId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden", "message", "Access denied: You can only permanently delete your own account"));
        }

        boolean deleted = doctorService.permanentlyDeleteDoctor(authenticatedDoctorId);
        if (deleted) {
            return ResponseEntity.ok(Map.of("success", true, "message", "Account permanently deleted"));
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/me")
    public ResponseEntity<?> deleteMyAccount(HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to delete account"));
        }

        boolean deleted = doctorService.permanentlyDeleteDoctor(authenticatedDoctorId);
        if (deleted) {
            return ResponseEntity.ok(Map.of("success", true, "message", "Account permanently deleted"));
        }
        return ResponseEntity.notFound().build();
    }
}
`;

controllerCode = controllerCode.replace(/\}\s*$/, deleteEndpoints);
fs.writeFileSync(controllerPath, controllerCode, 'utf8');
console.log('[OK] Updated DoctorProfileController.java with DELETE endpoints');

