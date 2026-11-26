package com.doctorvet.controller;

import com.doctorvet.model.DoctorProfile;
import com.doctorvet.security.TokenService;
import com.doctorvet.service.DoctorProfileService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/api/v1/profiles", "/api/v1/doctors"})
@CrossOrigin(originPatterns = "*")
public class DoctorProfileController {

    private final DoctorProfileService doctorService;
    private final TokenService tokenService;

    public DoctorProfileController(DoctorProfileService doctorService, TokenService tokenService) {
        this.doctorService = doctorService;
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
    public List<DoctorProfile> getAllProfiles(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String specialty,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String city
    ) {
        return doctorService.getAllProfiles(search, specialty, state, city);
    }

    @GetMapping("/{id}")
    public ResponseEntity<DoctorProfile> getProfileById(@PathVariable Long id) {
        return doctorService.getProfileById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createProfile(@RequestBody DoctorProfile profile, HttpServletRequest request) {
        return ResponseEntity.ok(doctorService.createProfile(profile));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateProfile(
            @PathVariable String id,
            @RequestBody Map<String, Object> updates,
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
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to update doctor profile"));
        }

        // Ownership Verification: Prevent IDOR (updating someone else's profile)
        if (numericId != null && !numericId.equals(authenticatedDoctorId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden", "message", "Access denied: You cannot update another doctor's profile"));
        }

        // Privilege Escalation Prevention: regular users cannot self-grant VCI verification
        updates.remove("verified");

        return doctorService.updateProfile(authenticatedDoctorId, updates)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

        @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteAccount(
            @PathVariable String id,
            HttpServletRequest request) {
        return performAccountDeletion(id, request);
    }

    @PostMapping("/{id}/delete")
    public ResponseEntity<?> deleteAccountViaPost(
            @PathVariable String id,
            HttpServletRequest request) {
        return performAccountDeletion(id, request);
    }

    @DeleteMapping("/me")
    public ResponseEntity<?> deleteMyAccount(HttpServletRequest request) {
        return performAccountDeletion(null, request);
    }

    @PostMapping("/me/delete")
    public ResponseEntity<?> deleteMyAccountViaPost(HttpServletRequest request) {
        return performAccountDeletion(null, request);
    }

    @PostMapping("/delete")
    public ResponseEntity<?> deleteAccountPostRoot(
            @RequestParam(required = false) String id,
            HttpServletRequest request) {
        return performAccountDeletion(id, request);
    }

    private ResponseEntity<?> performAccountDeletion(String id, HttpServletRequest request) {
        Long numericId = null;
        if (id != null && !id.isBlank() && !"me".equalsIgnoreCase(id)) {
            try {
                String digits = id.replaceAll("[^0-9]", "");
                if (!digits.isBlank()) {
                    numericId = Long.parseLong(digits);
                }
            } catch (Exception ignored) {}
        }

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
}
