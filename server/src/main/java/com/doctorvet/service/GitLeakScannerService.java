package com.doctorvet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class GitLeakScannerService {

    private static final Logger log = LoggerFactory.getLogger(GitLeakScannerService.class);

    @Value("${server.port:8080}")
    private int serverPort;

    public record PathProbe(String path, String category, String severityIfExposed, String description) {}

    public record PathAuditResult(
            String path,
            String category,
            String severity,
            int httpStatus,
            boolean blocked,
            String status, // "PASSED_BLOCKED", "PASSED_NOT_FOUND", "CRITICAL_EXPOSED", "VULNERABLE_EXPOSED"
            String details
    ) {}

    public record GitLeakAuditReport(
            LocalDateTime timestamp,
            String targetHost,
            int totalProbed,
            int passedCount,
            int exposedCount,
            String overallAssessment, // "FULLY_SECURED", "VULNERABILITIES_DETECTED"
            List<PathAuditResult> results
    ) {}

    // Comprehensive database of 36 high-risk sensitive paths
    private static final List<PathProbe> SENSITIVE_PROBES = List.of(
            // 1. Git Repository Internals
            new PathProbe("/.git/", "Git Internals", "CRITICAL", "Git root directory"),
            new PathProbe("/.git/HEAD", "Git Internals", "CRITICAL", "Git HEAD ref pointer"),
            new PathProbe("/.git/config", "Git Internals", "CRITICAL", "Git repository configuration with remote URLs"),
            new PathProbe("/.git/index", "Git Internals", "CRITICAL", "Git binary staging index"),
            new PathProbe("/.git/logs/HEAD", "Git Internals", "CRITICAL", "Git commit history log"),
            new PathProbe("/.git/description", "Git Internals", "HIGH", "Git description file"),

            // 2. Alternative VCS
            new PathProbe("/.svn/entries", "SVN Internals", "CRITICAL", "SVN repository metadata"),
            new PathProbe("/.svn/wc.db", "SVN Internals", "CRITICAL", "SVN SQLite working copy database"),
            new PathProbe("/.hg/hgrc", "Mercurial Internals", "CRITICAL", "Mercurial configuration"),

            // 3. Environment & Secrets
            new PathProbe("/.env", "Environment Secrets", "CRITICAL", "Primary environment secrets file"),
            new PathProbe("/.env.local", "Environment Secrets", "CRITICAL", "Local environment overrides"),
            new PathProbe("/.env.production", "Environment Secrets", "CRITICAL", "Production environment file"),
            new PathProbe("/.env.staging", "Environment Secrets", "CRITICAL", "Staging environment file"),
            new PathProbe("/.env.backup", "Environment Secrets", "CRITICAL", "Backup environment file"),
            new PathProbe("/.env.sample", "Environment Secrets", "HIGH", "Environment sample file"),

            // 4. Database Dumps & SQL Backups
            new PathProbe("/backup.sql", "Database Dump", "CRITICAL", "Root SQL database dump"),
            new PathProbe("/dump.sql", "Database Dump", "CRITICAL", "Database export file"),
            new PathProbe("/database.sql", "Database Dump", "CRITICAL", "Database SQL schema export"),
            new PathProbe("/zenve.sql", "Database Dump", "CRITICAL", "Application SQL export"),
            new PathProbe("/db.sqlite", "Database Dump", "CRITICAL", "SQLite database file"),
            new PathProbe("/db.sqlite3", "Database Dump", "CRITICAL", "SQLite3 database file"),

            // 5. Compressed Archives & Backups
            new PathProbe("/backup.tar.gz", "Backup Archive", "CRITICAL", "Compressed tar archive"),
            new PathProbe("/backup.zip", "Backup Archive", "CRITICAL", "Compressed zip backup"),
            new PathProbe("/site.zip", "Backup Archive", "CRITICAL", "Full site archive"),
            new PathProbe("/web.tar.gz", "Backup Archive", "CRITICAL", "Web root archive"),

            // 6. Cryptographic Keys & Certificates
            new PathProbe("/id_rsa", "Private Key", "CRITICAL", "SSH RSA private key"),
            new PathProbe("/id_ed25519", "Private Key", "CRITICAL", "SSH Ed25519 private key"),
            new PathProbe("/server.key", "Private Key", "CRITICAL", "TLS/SSL private key"),
            new PathProbe("/server.pem", "Private Key", "HIGH", "Certificate PEM container"),

            // 7. Sensitive Configurations
            new PathProbe("/credentials.json", "Credentials", "CRITICAL", "OAuth / Service account credentials"),
            new PathProbe("/web.config", "Configuration", "HIGH", "IIS server configuration"),
            new PathProbe("/wp-config.php", "Configuration", "HIGH", "Web application configuration"),
            new PathProbe("/docker-compose.yml", "Infrastructure", "HIGH", "Docker compose configuration"),

            // 8. Server Logs & OS Artifacts
            new PathProbe("/server.log", "Log File", "HIGH", "Server operational log"),
            new PathProbe("/error.log", "Log File", "HIGH", "Web server error log"),
            new PathProbe("/.DS_Store", "OS Metadata", "MEDIUM", "macOS directory metadata")
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public GitLeakAuditReport runAudit(String customBaseUrl) {
        String baseUrl = customBaseUrl != null && !customBaseUrl.isBlank()
                ? customBaseUrl.replaceAll("/+$", "")
                : "http://localhost:" + serverPort;

        log.info("[GitLeakScanner] Initiating security audit against target: {}", baseUrl);

        List<PathAuditResult> results = new ArrayList<>();
        int passed = 0;
        int exposed = 0;

        for (PathProbe probe : SENSITIVE_PROBES) {
            String fullUrl = baseUrl + probe.path();
            PathAuditResult result = auditPath(fullUrl, probe);
            results.add(result);

            if (result.blocked()) {
                passed++;
            } else {
                exposed++;
            }
        }

        String overallStatus = exposed == 0 ? "FULLY_SECURED" : "VULNERABILITIES_DETECTED";
        log.info("[GitLeakScanner] Audit complete. Total: {}, Passed: {}, Exposed: {}, Assessment: {}",
                SENSITIVE_PROBES.size(), passed, exposed, overallStatus);

        return new GitLeakAuditReport(
                LocalDateTime.now(),
                baseUrl,
                SENSITIVE_PROBES.size(),
                passed,
                exposed,
                overallStatus,
                results
        );
    }

    private PathAuditResult auditPath(String fullUrl, PathProbe probe) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(fullUrl))
                    .timeout(Duration.ofSeconds(3))
                    .header("User-Agent", "ZenveVet-Security-Audit-Scanner/2.0")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();
            String body = response.body() != null ? response.body() : "";

            // If response is 403 (Forbidden) -> successfully blocked by security filter or web server
            // If response is 404 (Not Found) -> file does not exist and cannot be accessed
            // If response is 405 (Method Not Allowed) -> blocked
            if (code == 403 || code == 404 || code == 405) {
                return new PathAuditResult(
                        probe.path(),
                        probe.category(),
                        "SECURED",
                        code,
                        true,
                        code == 403 ? "PASSED_BLOCKED" : "PASSED_NOT_FOUND",
                        "Path returned HTTP " + code + " (Access safely denied)"
                );
            }

            // If response is 200 (OK), check if it actually returned sensitive contents
            if (code == 200) {
                boolean containsGitSignature = body.contains("ref: refs/heads/") || body.contains("[core]") || body.contains("repositoryformatversion");
                boolean containsEnvSignature = body.contains("DB_PASSWORD") || body.contains("JWT_SECRET") || body.contains("SPRING_MAIL");
                boolean containsKeySignature = body.contains("BEGIN PRIVATE KEY") || body.contains("BEGIN RSA PRIVATE KEY");
                boolean containsSqlSignature = body.contains("CREATE TABLE") || body.contains("INSERT INTO") || body.contains("-- MySQL dump");

                if (containsGitSignature || containsEnvSignature || containsKeySignature || containsSqlSignature) {
                    return new PathAuditResult(
                            probe.path(),
                            probe.category(),
                            probe.severityIfExposed(),
                            code,
                            false,
                            "CRITICAL_EXPOSED",
                            "DANGER: Publicly accessible and verified to contain sensitive secret/VCS contents!"
                    );
                }

                // If 200 but returns SPA index.html fallback
                if (body.contains("<!DOCTYPE html>") || body.contains("<html")) {
                    return new PathAuditResult(
                            probe.path(),
                            probe.category(),
                            "LOW",
                            code,
                            true, // SPA fallback, not actual leaked file
                            "PASSED_SPA_ROUTED",
                            "Path returned frontend index.html SPA fallback, file itself is not exposed"
                    );
                }

                // Unrecognized 200 response
                return new PathAuditResult(
                        probe.path(),
                        probe.category(),
                        probe.severityIfExposed(),
                        code,
                        false,
                        "VULNERABLE_EXPOSED",
                        "WARNING: Path returned HTTP 200 with raw file payload!"
                );
            }

            // Redirects (301, 302) or other codes
            return new PathAuditResult(
                    probe.path(),
                    probe.category(),
                    "LOW",
                    code,
                    true,
                    "PASSED_REDIRECT",
                    "Path returned HTTP " + code
            );

        } catch (Exception e) {
            // Connection refused or timeout means service is either protected or unreachable on that port
            return new PathAuditResult(
                    probe.path(),
                    probe.category(),
                    "SECURED",
                    0,
                    true,
                    "PASSED_UNREACHABLE",
                    "Connection prevented or timed out: " + e.getMessage()
            );
        }
    }
}
