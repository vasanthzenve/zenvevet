package com.doctorvet.controller;

import com.doctorvet.service.GitLeakScannerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/security/git-leak-audit")
@CrossOrigin(originPatterns = "*")
public class GitLeakAuditController {

    private final GitLeakScannerService scannerService;

    public GitLeakAuditController(GitLeakScannerService scannerService) {
        this.scannerService = scannerService;
    }

    public record RunAuditReq(String targetUrl) {}

    @GetMapping
    public ResponseEntity<?> getAuditReport(@RequestParam(required = false) String targetUrl) {
        GitLeakScannerService.GitLeakAuditReport report = scannerService.runAudit(targetUrl);
        return ResponseEntity.ok(report);
    }

    @PostMapping("/run")
    public ResponseEntity<?> triggerAudit(@RequestBody(required = false) RunAuditReq req) {
        String target = req != null ? req.targetUrl() : null;
        GitLeakScannerService.GitLeakAuditReport report = scannerService.runAudit(target);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/summary")
    public ResponseEntity<?> getAuditSummary(@RequestParam(required = false) String targetUrl) {
        GitLeakScannerService.GitLeakAuditReport report = scannerService.runAudit(targetUrl);
        return ResponseEntity.ok(Map.of(
                "timestamp", report.timestamp(),
                "targetHost", report.targetHost(),
                "totalProbed", report.totalProbed(),
                "passedCount", report.passedCount(),
                "exposedCount", report.exposedCount(),
                "overallAssessment", report.overallAssessment()
        ));
    }
}
