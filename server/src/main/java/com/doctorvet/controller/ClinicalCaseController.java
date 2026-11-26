package com.doctorvet.controller;

import com.doctorvet.model.ClinicalCase;
import com.doctorvet.security.TokenService;
import com.doctorvet.service.ClinicalCaseService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/cases")
@CrossOrigin(originPatterns = "*")
public class ClinicalCaseController {

    private final ClinicalCaseService caseService;
    private final TokenService tokenService;

    public ClinicalCaseController(ClinicalCaseService caseService, TokenService tokenService) {
        this.caseService = caseService;
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
    public List<ClinicalCase> getAllCases(@RequestParam(required = false) String species,
                                          @RequestParam(required = false) Long doctorId,
                                          HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        return caseService.getAllCases(species, effectiveDocId);
    }

    @PostMapping({"/{id}/like", "/{id}/vote"})
    public ResponseEntity<?> toggleLikeCase(@PathVariable Long id,
            @RequestParam(required = false) Long doctorId,
            @RequestParam(required = false) String voteType,
            @RequestParam(required = false) String reaction,
            @RequestParam(required = false, defaultValue = "Dr. You") String doctorName,
            HttpServletRequest request) {
        Long authDocId = resolveAuthenticatedDoctor(request);
        Long effectiveDocId = authDocId != null ? authDocId : doctorId;
        if (effectiveDocId == null || effectiveDocId <= 0) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized. Please log in to vote on clinical cases."));
        }
        return caseService.toggleVote(id, effectiveDocId, doctorName, voteType, reaction)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClinicalCase> getCaseById(@PathVariable Long id) {
        return caseService.getCaseById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ClinicalCase createCase(@RequestBody ClinicalCase clinicalCase, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId != null) {
            clinicalCase.setAuthorId(authenticatedDoctorId);
        }
        return caseService.createCase(clinicalCase);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteCase(@PathVariable Long id, HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to delete clinical case"));
        }
        Optional<ClinicalCase> cOpt = caseService.getCaseById(id);
        if (cOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        ClinicalCase c = cOpt.get();
        if (c.getAuthorId() != null && !c.getAuthorId().equals(authenticatedDoctorId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden", "message", "You cannot delete another doctor's clinical case"));
        }
        boolean deleted = caseService.deleteCase(id);
        if (deleted) {
            return ResponseEntity.ok(Map.of("message", "Case deleted successfully", "id", id));
        }
        return ResponseEntity.notFound().build();
    }
}
