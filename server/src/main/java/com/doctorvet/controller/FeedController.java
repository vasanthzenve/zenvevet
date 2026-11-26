package com.doctorvet.controller;

import com.doctorvet.model.*;
import com.doctorvet.security.TokenService;
import com.doctorvet.service.FeedService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/feed")
@CrossOrigin(originPatterns = "*")
public class FeedController {

    private final FeedService feedService;
    private final TokenService tokenService;

    public FeedController(FeedService feedService, TokenService tokenService) {
        this.feedService = feedService;
        this.tokenService = tokenService;
    }

    private Long resolveAuthenticatedDoctor(HttpServletRequest request) {
        Object authAttr = request.getAttribute("authenticatedDoctorId");
        if (authAttr instanceof Long l) return l;
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            if (tokenService.validateToken(token)) {
                return tokenService.getDoctorIdFromToken(token);
            }
        }
        return null;
    }

    @GetMapping
    public List<Post> getFeedPosts(@RequestParam(required = false) String type,
                                   @RequestParam(required = false) Long doctorId,
                                   HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        return feedService.getFeedPosts(type, effectiveDocId);
    }

    @PostMapping("/posts")
    public Post createPost(@RequestBody Post post, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId != null) {
            post.setAuthorId(authenticatedDoctorId);
        }
        return feedService.createPost(post);
    }

    @PutMapping("/posts/{id}")
    public ResponseEntity<?> updatePost(@PathVariable Long id, @RequestBody Map<String, String> body, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to edit post"));
        }
        Optional<Post> existing = feedService.getPostById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Post p = existing.get();
        if (p.getAuthorId() != null && !p.getAuthorId().equals(authenticatedDoctorId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden", "message", "You cannot edit another doctor's post"));
        }
        return feedService.updatePost(id, body)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<?> deletePost(@PathVariable Long id, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to delete post"));
        }
        Optional<Post> existing = feedService.getPostById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Post p = existing.get();
        if (p.getAuthorId() != null && !p.getAuthorId().equals(authenticatedDoctorId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden", "message", "You cannot delete another doctor's post"));
        }
        if (feedService.deletePost(id)) {
            return ResponseEntity.ok(Map.of("message", "Post deleted successfully", "id", id));
        }
        return ResponseEntity.notFound().build();
    }

    @PostMapping({"/posts/{id}/like", "/posts/{id}/vote"})
    public ResponseEntity<?> toggleLikePost(@PathVariable Long id,
            @RequestParam(required = false) Long doctorId,
            @RequestParam(required = false) String voteType,
            @RequestParam(required = false) String reaction,
            @RequestParam(required = false, defaultValue = "Dr. You") String doctorName,
            HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        if (effectiveDocId == null || effectiveDocId <= 0) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized. Please log in to vote on posts."));
        }
        return feedService.toggleVote(id, effectiveDocId, doctorName, voteType, reaction)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/posts/{id}/comments")
    public List<Comment> getPostComments(@PathVariable Long id) {
        return feedService.getCommentsForPost(id);
    }

    public record AddCommentDto(Long authorId, String authorName, String authorAvatar, String authorSpecialty,
            String content) {
    }

    @PostMapping("/posts/{id}/comments")
    public ResponseEntity<?> addComment(@PathVariable Long id, @RequestBody AddCommentDto dto, HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveAuthorId = authDocId != null ? authDocId : dto.authorId();
        return feedService
                .addComment(id, effectiveAuthorId, dto.authorName(), dto.authorAvatar(), dto.authorSpecialty(),
                        dto.content())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/posts/{id}/bookmark")
    public ResponseEntity<?> toggleBookmark(@PathVariable Long id, @RequestParam(required = false) Long doctorId, HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        if (effectiveDocId == null) effectiveDocId = 1L;
        boolean bookmarked = feedService.toggleBookmark(id, effectiveDocId);
        return ResponseEntity.ok(Map.of("postId", id, "isBookmarked", bookmarked));
    }

    @GetMapping("/posts/saved")
    public List<Post> getSavedPosts(@RequestParam(required = false) Long doctorId, HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        if (effectiveDocId == null) effectiveDocId = 1L;
        return feedService.getSavedPosts(effectiveDocId);
    }

    @PostMapping("/posts/{id}/report")
    public ResponseEntity<?> reportPost(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long reporterId = authDocId != null ? authDocId : Long.valueOf(body.getOrDefault("reporterId", 1).toString());
        String reason = body.getOrDefault("reason", "Inappropriate content").toString();
        feedService.reportPost(id, reporterId, reason);
        return ResponseEntity
                .ok(Map.of("message", "Post reported to moderators. Thank you for keeping the community safe."));
    }

    @DeleteMapping("/posts/{id}/comments/{commentId}")
    public ResponseEntity<?> deleteComment(
            @PathVariable Long id,
            @PathVariable Long commentId,
            @RequestParam(required = false) Long doctorId,
            HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        if (effectiveDocId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to delete comment"));
        }
        if (feedService.deleteComment(id, commentId, effectiveDocId)) {
            return ResponseEntity.ok(Map.of("message", "Comment deleted successfully"));
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Forbidden", "message", "Access denied: You can only delete your own comment"));
    }
}
