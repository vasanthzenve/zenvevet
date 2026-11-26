package com.doctorvet.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MediaStorageService {

    private static final Logger log = LoggerFactory.getLogger(MediaStorageService.class);

    private static final long MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB limit for clinical media

    private static final Set<String> ALLOWED_IMAGE_TYPES = new HashSet<>(Arrays.asList(
            "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"));

    private static final Set<String> ALLOWED_VIDEO_TYPES = new HashSet<>(Arrays.asList(
            "video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-matroska", "video/x-msvideo",
            "video/3gpp"));

    private final Path uploadDir;

    public MediaStorageService() {
        Path chosenDir = resolveUploadDir();
        try {
            if (!Files.exists(chosenDir)) {
                Files.createDirectories(chosenDir);
            }
        } catch (Exception e) {
            log.warn("[MediaStorageService] Could not create chosen upload dir {}, falling back to local uploads: {}", chosenDir, e.getMessage());
            chosenDir = Paths.get("uploads").toAbsolutePath().normalize();
            try {
                if (!Files.exists(chosenDir)) {
                    Files.createDirectories(chosenDir);
                }
            } catch (Exception e2) {
                chosenDir = Paths.get(System.getProperty("java.io.tmpdir"), "zenvevet-uploads").toAbsolutePath().normalize();
                try {
                    if (!Files.exists(chosenDir)) {
                        Files.createDirectories(chosenDir);
                    }
                } catch (Exception ignored) {}
            }
        }
        this.uploadDir = chosenDir;
        log.info("[MediaStorageService] Primary upload directory initialized at: {}", this.uploadDir);
    }

    private static Path resolveUploadDir() {
        // 1. Explicit system property or env var
        String customPath = System.getProperty("app.upload.dir", System.getenv("UPLOAD_DIR"));
        if (customPath != null && !customPath.isBlank()) {
            return Paths.get(customPath).toAbsolutePath().normalize();
        }

        // 2. Discover uploads folder based on code source (project directory)
        try {
            var codeSource = MediaStorageService.class.getProtectionDomain().getCodeSource();
            if (codeSource != null && codeSource.getLocation() != null) {
                Path cur = Paths.get(codeSource.getLocation().toURI());
                while (cur != null && cur.getParent() != null) {
                    Path testUploads = cur.resolve("uploads");
                    if (Files.exists(testUploads) && Files.isWritable(testUploads)) {
                        return testUploads.toAbsolutePath().normalize();
                    }
                    Path testServerUploads = cur.resolve("server").resolve("uploads");
                    if (Files.exists(testServerUploads) && Files.isWritable(testServerUploads)) {
                        return testServerUploads.toAbsolutePath().normalize();
                    }
                    cur = cur.getParent();
                }
            }
        } catch (Exception ignored) {
        }

        // 3. Current working directory candidates
        Path[] candidates = new Path[] {
                Paths.get("uploads"),
                Paths.get("server", "uploads"),
                Paths.get("..", "uploads")
        };

        for (Path c : candidates) {
            try {
                Path abs = c.toAbsolutePath().normalize();
                String pathLower = abs.toString().toLowerCase(Locale.ROOT);
                if (pathLower.contains("windows\\system32") || pathLower.contains("winnt\\system32")) {
                    continue;
                }
                if (Files.exists(abs) && Files.isWritable(abs)) {
                    return abs;
                }
            } catch (Exception ignored) {
            }
        }

        // 4. Safe user-home directory fallback
        Path fallback = Paths.get(System.getProperty("user.home"), ".zenvevet", "uploads").toAbsolutePath().normalize();
        return fallback;
    }

    public String storeFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Cannot store empty or null file");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("File size exceeds maximum allowed limit of 100 MB");
        }

        String contentType = file.getContentType();
        if (contentType != null) {
            contentType = contentType.toLowerCase(Locale.ROOT).trim();
            // Handle charset or parameters in content-type (e.g. video/mp4; codecs=...)
            if (contentType.contains(";")) {
                contentType = contentType.split(";")[0].trim();
            }
        }

        String originalFilename = file.getOriginalFilename();
        String extension = deriveExtension(originalFilename, contentType);

        // Validate format
        boolean isImage = contentType != null && ALLOWED_IMAGE_TYPES.contains(contentType);
        boolean isVideo = contentType != null && ALLOWED_VIDEO_TYPES.contains(contentType);

        if (!isImage && !isVideo) {
            // Check extension as fallback
            if (isImageExtension(extension)) {
                isImage = true;
            } else if (isVideoExtension(extension)) {
                isVideo = true;
            } else {
                throw new IllegalArgumentException(
                        "Unsupported media type: " + (contentType != null ? contentType : originalFilename) +
                                ". Allowed formats: JPG, PNG, WEBP, GIF, AVIF, MP4, WEBM, MOV, OGG.");
            }
        }

        String uniqueFileName = UUID.randomUUID().toString() + extension;
        Path targetLocation = uploadDir.resolve(uniqueFileName).normalize();

        // Atomic write to prevent reading half-uploaded or corrupted files under high
        // concurrency
        Path tempPartFile = uploadDir.resolve(uniqueFileName + ".part").normalize();

        try {
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, tempPartFile, StandardCopyOption.REPLACE_EXISTING);
            }

            // Verify file was written completely
            long writtenBytes = Files.size(tempPartFile);
            if (writtenBytes <= 0) {
                Files.deleteIfExists(tempPartFile);
                throw new IOException("Zero bytes written during media upload");
            }

            // Enterprise File Security Validation: Magic bytes & SVG XSS Sanitization
            validateFileContentSecurity(tempPartFile, extension);

            // Atomic move to make media instantly available to all concurrent readers
            Files.move(tempPartFile, targetLocation, StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
            log.info("[MediaStorageService] Successfully stored media: {} ({} bytes, type: {})",
                    uniqueFileName, writtenBytes, contentType);

            // Safe sync to secondary uploads directory if distinct
            syncToSecondaryDirectories(uniqueFileName, targetLocation);

        } catch (IOException e) {
            try {
                Files.deleteIfExists(tempPartFile);
            } catch (Exception ignored) {
            }
            log.error("[MediaStorageService] Failed to store file: {}", uniqueFileName, e);
            throw new RuntimeException("Failed to store file " + uniqueFileName + ": " + e.getMessage(), e);
        }

        return "/uploads/" + uniqueFileName;
    }

    private void syncToSecondaryDirectories(String uniqueFileName, Path sourceFile) {
        Path[] secondaryCandidates = new Path[] {
                Paths.get("uploads").toAbsolutePath().normalize(),
                Paths.get("server", "uploads").toAbsolutePath().normalize(),
                Paths.get("..", "uploads").toAbsolutePath().normalize()
        };

        for (Path secDir : secondaryCandidates) {
            try {
                if (Files.exists(secDir) && Files.isDirectory(secDir) && Files.isWritable(secDir)) {
                    Path secTarget = secDir.resolve(uniqueFileName).normalize();
                    if (!Files.isSameFile(sourceFile, secTarget) && !sourceFile.equals(secTarget)) {
                        Files.copy(sourceFile, secTarget, StandardCopyOption.REPLACE_EXISTING);
                    }
                }
            } catch (Exception ignored) {
                // Secondary sync failure is non-fatal since primary directory already holds the
                // file
            }
        }
    }

    private String deriveExtension(String originalFilename, String contentType) {
        if (originalFilename != null && originalFilename.contains(".")) {
            String ext = originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase(Locale.ROOT).trim();
            if (ext.length() >= 2 && ext.length() <= 6) {
                return ext;
            }
        }

        if (contentType != null) {
            switch (contentType) {
                case "video/mp4":
                    return ".mp4";
                case "video/webm":
                    return ".webm";
                case "video/quicktime":
                    return ".mov";
                case "video/ogg":
                    return ".ogv";
                case "video/x-matroska":
                    return ".mkv";
                case "image/jpeg":
                case "image/jpg":
                    return ".jpg";
                case "image/png":
                    return ".png";
                case "image/webp":
                    return ".webp";
                case "image/gif":
                    return ".gif";
                case "image/avif":
                    return ".avif";
                case "image/svg+xml":
                    return ".svg";
                default:
                    if (contentType.startsWith("video/"))
                        return ".mp4";
                    if (contentType.startsWith("image/"))
                        return ".jpg";
            }
        }

        return ".bin";
    }

    private boolean isImageExtension(String ext) {
        return ext.equals(".jpg") || ext.equals(".jpeg") || ext.equals(".png") ||
                ext.equals(".webp") || ext.equals(".gif") || ext.equals(".avif") || ext.equals(".svg");
    }

    private boolean isVideoExtension(String ext) {
        return ext.equals(".mp4") || ext.equals(".webm") || ext.equals(".mov") ||
                ext.equals(".m4v") || ext.equals(".ogg") || ext.equals(".ogv") || ext.equals(".mkv");
    }

    private void validateFileContentSecurity(Path filePath, String extension) throws IOException {
        byte[] header = new byte[Math.min(512, (int) Files.size(filePath))];
        try (InputStream is = Files.newInputStream(filePath)) {
            int read = is.read(header);
            if (read <= 0) {
                throw new IllegalArgumentException("Uploaded file is empty");
            }
        }

        // Executable / Script blocking (Magic Bytes)
        if (header.length >= 2 && header[0] == 'M' && header[1] == 'Z') {
            throw new IllegalArgumentException("Executable binaries (.exe/.dll) are strictly forbidden");
        }
        if (header.length >= 4 && header[0] == 0x7F && header[1] == 'E' && header[2] == 'L' && header[3] == 'F') {
            throw new IllegalArgumentException("ELF executable binaries are strictly forbidden");
        }
        String headerStr = new String(header, java.nio.charset.StandardCharsets.ISO_8859_1).toLowerCase(Locale.ROOT);
        if (headerStr.startsWith("#!") || headerStr.contains("<?php") || headerStr.contains("<%")) {
            throw new IllegalArgumentException("Executable scripts are strictly prohibited");
        }

        // SVG Sanitization (prevent Stored XSS)
        if (".svg".equalsIgnoreCase(extension)) {
            String fullContent = Files.readString(filePath, java.nio.charset.StandardCharsets.UTF_8)
                    .toLowerCase(Locale.ROOT);
            if (fullContent.contains("<script") || fullContent.contains("javascript:")
                    || fullContent.contains("onload=") || fullContent.contains("onerror=")
                    || fullContent.contains("<!entity") || fullContent.contains("system")) {
                throw new IllegalArgumentException("SVG contains potentially malicious script or entity content");
            }
        }
    }

    public Path getFilePath(String fileName) {
        return uploadDir.resolve(fileName).normalize();
    }

    public Path getUploadDir() {
        return uploadDir;
    }
}
