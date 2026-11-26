package com.doctorvet.controller;

import com.doctorvet.model.Story;
import com.doctorvet.model.StoryView;
import com.doctorvet.security.TokenService;
import com.doctorvet.service.StoryService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/stories")
@CrossOrigin(originPatterns = "*")
public class StoryController {

    private final StoryService storyService;
    private final TokenService tokenService;

    public StoryController(StoryService storyService, TokenService tokenService) {
        this.storyService = storyService;
        this.tokenService = tokenService;
    }

    @GetMapping
    public ResponseEntity<List<Story>> getActiveStories(@RequestParam(required = false) Long doctorId) {
        return ResponseEntity.ok(storyService.getActiveStories(doctorId));
    }

    @PostMapping
    public ResponseEntity<?> createStory(@RequestBody Story story, HttpServletRequest request) {
        try {
            Long authId = tokenService.resolveDoctorId(request);
            if (authId != null && story.getDoctorId() == null) {
                story.setDoctorId(authId);
            }
            return ResponseEntity.ok(storyService.createStory(story));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "error", e.getMessage()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "success", false,
                    "error", "Failed to create story: " + e.getMessage()
            ));
        }
    }

    @PostMapping("/{id}/like")
    public ResponseEntity<?> toggleLikeStory(
            @PathVariable Long id,
            @RequestParam(required = false) Long doctorId,
            @RequestParam(required = false) String doctorName,
            HttpServletRequest request) {
        Long authId = tokenService.resolveDoctorId(request);
        Long effectiveDocId = authId != null ? authId : doctorId;
        return storyService.toggleLike(id, effectiveDocId, doctorName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/share")
    public ResponseEntity<?> recordShareStory(@PathVariable Long id) {
        return storyService.recordShare(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/view")
    public ResponseEntity<?> recordView(
            @PathVariable Long id,
            @RequestParam(required = false) Long viewerDoctorId,
            @RequestParam(required = false) String viewerDoctorName,
            @RequestParam(required = false) String viewerDoctorAvatar,
            @RequestParam(required = false) String viewerSpecialty,
            HttpServletRequest request) {
        Long authDoctorId = tokenService.resolveDoctorId(request);
        Long effectiveViewerId = viewerDoctorId != null ? viewerDoctorId : authDoctorId;
        return storyService.recordView(id, effectiveViewerId, viewerDoctorName, viewerDoctorAvatar, viewerSpecialty)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/viewers")
    public ResponseEntity<List<StoryView>> getStoryViewers(@PathVariable Long id) {
        return ResponseEntity.ok(storyService.getStoryViewers(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteStory(@PathVariable Long id, HttpServletRequest request) {
        Optional<Story> existing = storyService.getStoryById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Long authId = tokenService.resolveDoctorId(request);
        if (authId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "success", false,
                    "error", "Unauthorized: Sign in required to delete story."
            ));
        }
        Story story = existing.get();
        if (story.getDoctorId() != null && !story.getDoctorId().equals(authId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "success", false,
                    "error", "Forbidden: You are not authorized to delete another doctor's story."
            ));
        }

        boolean deleted = storyService.deleteStory(id);
        if (deleted) {
            return ResponseEntity.ok().body(Map.of("success", true, "message", "Story deleted successfully"));
        }
        return ResponseEntity.notFound().build();
    }
}
