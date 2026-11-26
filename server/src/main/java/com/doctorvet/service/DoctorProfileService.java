package com.doctorvet.service;

import com.doctorvet.model.*;
import com.doctorvet.repository.*;
import com.doctorvet.security.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class DoctorProfileService {

    private static final Logger log = LoggerFactory.getLogger(DoctorProfileService.class);

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
    }

    public List<DoctorProfile> getAllProfiles(String search, String specialty, String state, String city) {
        if (search != null && !search.isBlank()) {
            String q = search.toLowerCase();
            return repository.findAll().stream()
                    .filter(d -> (d.getName() != null && d.getName().toLowerCase().contains(q)) ||
                            (d.getSpecialty() != null && d.getSpecialty().toLowerCase().contains(q)) ||
                            (d.getCity() != null && d.getCity().toLowerCase().contains(q)) ||
                            (d.getClinic() != null && d.getClinic().toLowerCase().contains(q)))
                    .toList();
        }
        if (specialty != null && !specialty.equals("All specialties")) {
            return repository.findBySpecialty(specialty);
        }
        if (state != null && !state.equals("All states")) {
            return repository.findByState(state);
        }
        if (city != null && !city.isBlank()) {
            return repository.findByCityIgnoreCase(city);
        }
        return repository.findAll();
    }

    public Optional<DoctorProfile> getProfileById(Long id) {
        return repository.findById(id);
    }

    public Optional<DoctorProfile> findByEmail(String email) {
        if (email == null || email.isBlank())
            return Optional.empty();
        return repository.findByEmailIgnoreCase(email.trim());
    }

    public Optional<DoctorProfile> findByEmailOrName(String identifier) {
        if (identifier == null || identifier.isBlank())
            return Optional.empty();
        String clean = identifier.trim().toLowerCase();
        Optional<DoctorProfile> byEmail = repository.findByEmailIgnoreCase(clean);
        if (byEmail.isPresent())
            return byEmail;
        return repository.findAll().stream()
                .filter(d -> (d.getEmail() != null && d.getEmail().equalsIgnoreCase(clean)) ||
                        (d.getName() != null && d.getName().toLowerCase().contains(clean)))
                .findFirst();
    }

    @Transactional
    public DoctorProfile createProfile(DoctorProfile profile) {
        return repository.save(profile);
    }

    @Transactional
    public Optional<DoctorProfile> updateProfile(Long id, Map<String, Object> updates) {
        DoctorProfile doc = null;
        if (id != null) {
            doc = repository.findById(id).orElse(null);
        }
        if (doc == null && updates.containsKey("email") && updates.get("email") != null) {
            String email = updates.get("email").toString().trim().toLowerCase();
            doc = repository.findAll().stream()
                    .filter(d -> d.getEmail() != null && d.getEmail().toLowerCase().equals(email))
                    .findFirst().orElse(null);
        }
        if (doc == null && updates.containsKey("name") && updates.get("name") != null) {
            String name = updates.get("name").toString().trim().toLowerCase();
            doc = repository.findAll().stream()
                    .filter(d -> d.getName() != null && d.getName().toLowerCase().equals(name))
                    .findFirst().orElse(null);
        }
        if (doc == null) {
            doc = new DoctorProfile();
            doc.setName(updates.containsKey("name") ? updates.get("name").toString() : "Doctor");
            doc.setSpecialty(
                    updates.containsKey("specialty") ? updates.get("specialty").toString() : "Veterinary Surgery");
        }

        final DoctorProfile d = doc;
        if (updates.containsKey("name"))
            d.setName(updates.get("name").toString());
        if (updates.containsKey("specialty"))
            d.setSpecialty(updates.get("specialty").toString());
        if (updates.containsKey("qualification"))
            d.setQualification(updates.get("qualification").toString());
        if (updates.containsKey("clinic"))
            d.setClinic(updates.get("clinic").toString());
        if (updates.containsKey("city"))
            d.setCity(updates.get("city").toString());
        if (updates.containsKey("state"))
            d.setState(updates.get("state").toString());
        if (updates.containsKey("avatar"))
            d.setAvatar(updates.get("avatar").toString());
        if (updates.containsKey("bio"))
            d.setBio(updates.get("bio").toString());
        if (updates.containsKey("headline"))
            d.setHeadline(updates.get("headline").toString());
        if (updates.containsKey("coverImage"))
            d.setCoverImage(updates.get("coverImage").toString());
        if (updates.containsKey("phone"))
            d.setPhone(updates.get("phone").toString());
        if (updates.containsKey("email"))
            d.setEmail(updates.get("email").toString());
        if (updates.containsKey("licenseNumber"))
            d.setLicenseNumber(updates.get("licenseNumber").toString());
        if (updates.containsKey("experienceYears")) {
            try {
                d.setExperienceYears(Integer.parseInt(updates.get("experienceYears").toString()));
            } catch (Exception ignored) {
            }
        }
        if (updates.containsKey("active")) {
            try {
                d.setActive(Boolean.parseBoolean(updates.get("active").toString()));
            } catch (Exception ignored) {
            }
        }
        if (updates.containsKey("verified")) {
            try {
                d.setVerified(Boolean.parseBoolean(updates.get("verified").toString()));
            } catch (Exception ignored) {
            }
        }
        if (updates.containsKey("passwordHash") && updates.get("passwordHash") != null) {
            d.setPassword(updates.get("passwordHash").toString().trim());
        } else if (updates.containsKey("password") && updates.get("password") != null) {
            d.setPassword(updates.get("password").toString().trim());
        }
        return Optional.of(repository.save(d));
    }

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
