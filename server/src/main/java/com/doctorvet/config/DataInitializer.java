package com.doctorvet.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.doctorvet.model.CaseLike;
import com.doctorvet.model.ClinicalCase;
import com.doctorvet.model.CommunityPost;
import com.doctorvet.model.CommunityPostLike;
import com.doctorvet.model.DoctorProfile;
import com.doctorvet.model.Post;
import com.doctorvet.model.PostLike;
import com.doctorvet.model.ShortVideo;
import com.doctorvet.model.VideoLike;
import com.doctorvet.repository.CaseLikeRepository;
import com.doctorvet.repository.ClinicalCaseRepository;
import com.doctorvet.repository.CommunityPostLikeRepository;
import com.doctorvet.repository.CommunityPostRepository;
import com.doctorvet.repository.DoctorConnectionRepository;
import com.doctorvet.repository.DoctorProfileRepository;
import com.doctorvet.repository.PostLikeRepository;
import com.doctorvet.repository.PostRepository;
import com.doctorvet.repository.ShortVideoRepository;
import com.doctorvet.repository.VideoLikeRepository;

@Configuration
public class DataInitializer {

    @Bean
    @SuppressWarnings("unused")
    public CommandLineRunner initDatabase(DoctorProfileRepository docRepo,
                                  DoctorConnectionRepository connRepo,
                                  PostRepository postRepo,
                                  PostLikeRepository likeRepo,
                                  CommunityPostRepository communityPostRepo,
                                  CommunityPostLikeRepository communityLikeRepo,
                                  ShortVideoRepository videoRepo,
                                  VideoLikeRepository videoLikeRepo,
                                  ClinicalCaseRepository caseRepo,
                                  CaseLikeRepository caseLikeRepo) {
        return args -> {
            for (DoctorProfile d : docRepo.findAll()) {
                long c = connRepo.countConnectionsForDoctor(d.getId());
                if (d.getConnectionsCount() != (int) c) {
                    d.setConnectionsCount((int) c);
                    docRepo.save(d);
                }
            }

            // 1. Ensure all existing likes have voteType set to 'LIKE' if null
            for (PostLike pl : likeRepo.findAll()) {
                if (pl.getVoteType() == null || pl.getVoteType().isBlank()) {
                    pl.setVoteType("LIKE");
                    if (pl.getReaction() == null) pl.setReaction("like_puppy");
                    likeRepo.save(pl);
                }
            }
            likeRepo.flush();

            for (CaseLike cl : caseLikeRepo.findAll()) {
                if (cl.getVoteType() == null || cl.getVoteType().isBlank()) {
                    cl.setVoteType("LIKE");
                    if (cl.getReaction() == null) cl.setReaction("like_puppy");
                    caseLikeRepo.save(cl);
                }
            }
            caseLikeRepo.flush();

            for (CommunityPostLike cpl : communityLikeRepo.findAll()) {
                if (cpl.getVoteType() == null || cpl.getVoteType().isBlank()) {
                    cpl.setVoteType("LIKE");
                    if (cpl.getReaction() == null) cpl.setReaction("like_puppy");
                    communityLikeRepo.save(cpl);
                }
            }
            communityLikeRepo.flush();

            for (VideoLike vl : videoLikeRepo.findAll()) {
                if (vl.getVoteType() == null || vl.getVoteType().isBlank()) {
                    vl.setVoteType("LIKE");
                    if (vl.getReaction() == null) vl.setReaction("like_puppy");
                    videoLikeRepo.save(vl);
                }
            }
            videoLikeRepo.flush();

            // Link existing clinical case posts to clinical cases if caseId is null
            for (Post p : postRepo.findAll()) {
                if ("CLINICAL_CASE".equalsIgnoreCase(p.getPostType()) && p.getCaseId() == null) {
                    for (ClinicalCase c : caseRepo.findAll()) {
                        if (c.getAuthorName() != null && c.getAuthorName().equalsIgnoreCase(p.getAuthorName())) {
                            if ((p.getImageUrl() != null && p.getImageUrl().equals(c.getMediaUrl())) ||
                                    (p.getContent() != null && (p.getContent().contains(c.getTitle()) || c.getTitle().contains(p.getContent())))) {
                                p.setCaseId(c.getId());
                                postRepo.save(p);
                                break;
                            }
                        }
                    }
                }
            }

            // Cross-synchronize likes and dislikes between linked Posts and ClinicalCases bidirectionally
            for (Post p : postRepo.findAll()) {
                if (p.getCaseId() != null) {
                    Long caseId = p.getCaseId();
                    // Copy PostLikes into CaseLikes if missing
                    for (PostLike pl : likeRepo.findAll()) {
                        if (pl.getPostId().equals(p.getId())) {
                            if (caseLikeRepo.findByCaseIdAndDoctorId(caseId, pl.getDoctorId()).isEmpty()) {
                                caseLikeRepo.save(new CaseLike(caseId, pl.getDoctorId(), pl.getVoteType(), pl.getReaction()));
                            }
                        }
                    }
                    // Copy CaseLikes into PostLikes if missing
                    for (CaseLike cl : caseLikeRepo.findAll()) {
                        if (cl.getCaseId().equals(caseId)) {
                            if (likeRepo.findByPostIdAndDoctorId(p.getId(), cl.getDoctorId()).isEmpty()) {
                                likeRepo.save(new PostLike(p.getId(), cl.getDoctorId(), cl.getVoteType(), cl.getReaction()));
                            }
                        }
                    }
                    caseLikeRepo.flush();
                    likeRepo.flush();
                }
            }

            // Enforce that all feed posts have their like & dislike count strictly equal to actual recorded user votes
            for (Post p : postRepo.findAll()) {
                long actualLikes = likeRepo.countByPostIdAndVoteType(p.getId(), "LIKE");
                long actualDislikes = likeRepo.countByPostIdAndVoteType(p.getId(), "DISLIKE");
                if (p.getLikes() != (int) actualLikes || p.getDislikes() != (int) actualDislikes) {
                    p.setLikes((int) actualLikes);
                    p.setDislikes((int) actualDislikes);
                    postRepo.save(p);
                }
            }

            // Enforce that all clinical cases have their like & dislike count strictly equal to actual recorded votes
            for (ClinicalCase c : caseRepo.findAll()) {
                long actualLikes = caseLikeRepo.countByCaseIdAndVoteType(c.getId(), "LIKE");
                long actualDislikes = caseLikeRepo.countByCaseIdAndVoteType(c.getId(), "DISLIKE");
                if (c.getLikes() != (int) actualLikes || c.getDislikes() != (int) actualDislikes) {
                    c.setLikes((int) actualLikes);
                    c.setDislikes((int) actualDislikes);
                    caseRepo.save(c);
                }
            }

            // Enforce that all community posts have their like & dislike count strictly equal to actual recorded votes
            for (CommunityPost cp : communityPostRepo.findAll()) {
                long actualLikes = communityLikeRepo.countByCommunityPostIdAndVoteType(cp.getId(), "LIKE");
                long actualDislikes = communityLikeRepo.countByCommunityPostIdAndVoteType(cp.getId(), "DISLIKE");
                if (cp.getLikes() != (int) actualLikes || cp.getDislikes() != (int) actualDislikes) {
                    cp.setLikes((int) actualLikes);
                    cp.setDislikes((int) actualDislikes);
                    communityPostRepo.save(cp);
                }
            }

            // Enforce that all short videos have their like & dislike count strictly equal to actual recorded votes
            for (ShortVideo sv : videoRepo.findAll()) {
                long actualLikes = videoLikeRepo.countByVideoIdAndVoteType(sv.getId(), "LIKE");
                long actualDislikes = videoLikeRepo.countByVideoIdAndVoteType(sv.getId(), "DISLIKE");
                if (sv.getLikes() != (int) actualLikes || sv.getDislikes() != (int) actualDislikes) {
                    sv.setLikes((int) actualLikes);
                    sv.setDislikes((int) actualDislikes);
                    videoRepo.save(sv);
                }
            }
        };
    }
}
