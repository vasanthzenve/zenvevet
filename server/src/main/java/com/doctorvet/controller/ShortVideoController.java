package com.doctorvet.controller;

import com.doctorvet.model.Comment;
import com.doctorvet.model.ShortVideo;
import com.doctorvet.security.TokenService;
import com.doctorvet.service.ShortVideoService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/videos")
@CrossOrigin(originPatterns = "*")
public class ShortVideoController {

    private final ShortVideoService videoService;
    private final TokenService tokenService;

    public ShortVideoController(ShortVideoService videoService, TokenService tokenService) {
        this.videoService = videoService;
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

    public record AddCommentDto(Long authorId, String authorName, String authorAvatar, String authorSpecialty, String content) {}

    @GetMapping
    public List<ShortVideo> getAllVideos(@RequestParam(required = false) Long doctorId, HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        return videoService.getAllVideos(effectiveDocId);
    }

    @PostMapping
    public ShortVideo createVideo(@RequestBody ShortVideo video, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId != null) {
            video.setDoctorId(authenticatedDoctorId);
        }
        return videoService.createVideo(video);
    }

    @GetMapping("/{id}/comments")
    public List<Comment> getVideoComments(@PathVariable Long id) {
        return videoService.getVideoComments(id);
    }

    @PostMapping("/{id}/comments")
    public Comment addVideoComment(@PathVariable Long id, @RequestBody AddCommentDto dto, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        Long effectiveAuthorId = authenticatedDoctorId != null ? authenticatedDoctorId : dto.authorId();
        return videoService.addVideoComment(id, effectiveAuthorId, dto.authorName(), dto.authorAvatar(), dto.authorSpecialty(), dto.content());
    }

    @PostMapping({"/{id}/like", "/{id}/vote"})
    public ResponseEntity<Map<String, Object>> toggleVideoLike(
            @PathVariable Long id,
            @RequestParam(required = false) Long doctorId,
            @RequestParam(required = false) String voteType,
            @RequestParam(required = false) String reaction,
            @RequestParam(required = false, defaultValue = "Dr. You") String doctorName,
            HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        Long effectiveDoctorId = authenticatedDoctorId != null ? authenticatedDoctorId : (doctorId != null ? doctorId : 1L);
        return ResponseEntity.ok(videoService.toggleVideoVote(id, effectiveDoctorId, doctorName, voteType, reaction));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteVideo(@PathVariable Long id, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to delete video"));
        }
        Optional<ShortVideo> vOpt = videoService.getVideoById(id);
        if (vOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ShortVideo v = vOpt.get();
        if (v.getDoctorId() != null && !v.getDoctorId().equals(authenticatedDoctorId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden", "message", "You cannot delete another doctor's video"));
        }
        boolean deleted = videoService.deleteVideo(id);
        if (deleted) {
            return ResponseEntity.ok(Map.of("message", "Video deleted successfully", "id", id));
        }
        return ResponseEntity.notFound().build();
    }
}
