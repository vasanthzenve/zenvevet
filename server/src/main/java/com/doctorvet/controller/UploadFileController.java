package com.doctorvet.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@RestController
@CrossOrigin(originPatterns = "*")
public class UploadFileController {

    private static final Logger log = LoggerFactory.getLogger(UploadFileController.class);
    private static final long CHUNK_SIZE = 1024 * 1024; // 1 MB streaming chunks for smooth video buffering

    private final com.doctorvet.service.MediaStorageService mediaStorageService;

    public UploadFileController(@org.springframework.beans.factory.annotation.Autowired(required = false) com.doctorvet.service.MediaStorageService mediaStorageService) {
        this.mediaStorageService = mediaStorageService;
    }

    @GetMapping("/uploads/{fileName:.+}")
    public void serveUploadFile(
            @PathVariable String fileName,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {

        // Strict Path Traversal Prevention
        if (fileName == null || fileName.isBlank() || fileName.contains("..") || fileName.contains("/") || fileName.contains("\\") || fileName.contains("%")) {
            log.warn("[UploadFileController] Potential Path Traversal attempt blocked: {}", fileName);
            response.sendError(HttpServletResponse.SC_BAD_REQUEST);
            return;
        }

        Path resolvedPath = findFile(fileName);

        if (resolvedPath == null) {
            log.warn("[UploadFileController] File not found: {}", fileName);

            // Graceful fallback for missing image uploads to prevent red broken images
            String lower = fileName.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".gif")) {
                Path fallback = findFallbackImage();
                if (fallback != null) {
                    response.setContentType("image/jpeg");
                    response.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache");
                    response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
                    Files.copy(fallback, response.getOutputStream());
                    return;
                }
            } else if (lowerMatchesVideo(fileName)) {
                Path fallback = findFallbackVideo();
                if (fallback != null) {
                    resolvedPath = fallback;
                    log.info("[UploadFileController] Serving fallback video for missing file: {}", fileName);
                }
            }

            if (resolvedPath == null) {
                response.sendError(HttpServletResponse.SC_NOT_FOUND);
                return;
            }
        }

        String contentType = resolveContentType(resolvedPath, fileName);
        long fileLength;
        try {
            fileLength = Files.size(resolvedPath);
        } catch (Exception e) {
            fileLength = resolvedPath.toFile().length();
        }

        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "public, max-age=86400, no-transform");
        response.setContentType(contentType);

        String rangeHeader = request.getHeader(HttpHeaders.RANGE);
        boolean isVideo = contentType.startsWith("video/") || lowerMatchesVideo(fileName);

        if (rangeHeader != null && rangeHeader.startsWith("bytes=") && fileLength > 0 && isVideo) {
            try {
                String rangeValue = rangeHeader.substring(6).trim();
                String[] parts = rangeValue.split("-");
                long start = Long.parseLong(parts[0].trim());
                long end = (parts.length > 1 && !parts[1].trim().isEmpty()) ? Long.parseLong(parts[1].trim()) : fileLength - 1;
                if (end >= fileLength) end = fileLength - 1;

                long rangeLength = Math.min(CHUNK_SIZE, end - start + 1);
                long rangeEnd = start + rangeLength - 1;

                response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
                response.setHeader(HttpHeaders.CONTENT_RANGE, String.format("bytes %d-%d/%d", start, rangeEnd, fileLength));
                response.setHeader(HttpHeaders.CONTENT_LENGTH, String.valueOf(rangeLength));

                try (RandomAccessFile raf = new RandomAccessFile(resolvedPath.toFile(), "r");
                     OutputStream os = response.getOutputStream()) {
                    raf.seek(start);
                    byte[] buffer = new byte[16384];
                    long remaining = rangeLength;
                    while (remaining > 0) {
                        int toRead = (int) Math.min(buffer.length, remaining);
                        int bytesRead = raf.read(buffer, 0, toRead);
                        if (bytesRead == -1) break;
                        os.write(buffer, 0, bytesRead);
                        remaining -= bytesRead;
                    }
                    os.flush();
                } catch (IOException ex) {
                    // Client aborted during playback (normal for video pause/seek/close)
                }
                return;
            } catch (Exception e) {
                log.warn("[UploadFileController] Range request parsing failed for {}: {}", fileName, e.getMessage());
            }
        }

        // Standard 200 OK full response
        response.setStatus(HttpServletResponse.SC_OK);
        response.setHeader(HttpHeaders.CONTENT_LENGTH, String.valueOf(fileLength));
        try (InputStream is = Files.newInputStream(resolvedPath);
             OutputStream os = response.getOutputStream()) {
            is.transferTo(os);
            os.flush();
        } catch (IOException ex) {
            // Client disconnect
        }
    }

    private Path findFile(String fileName) {
        List<Path> searchList = new ArrayList<>();

        if (mediaStorageService != null) {
            searchList.add(mediaStorageService.getFilePath(fileName));
        }
        searchList.add(Paths.get("uploads", fileName));
        searchList.add(Paths.get("server", "uploads", fileName));
        searchList.add(Paths.get("..", "uploads", fileName));
        searchList.add(Paths.get("..", "server", "uploads", fileName));

        for (Path p : searchList) {
            try {
                Path norm = p.toAbsolutePath().normalize();
                String normStr = norm.toString().toLowerCase(Locale.ROOT);
                if (normStr.contains("uploads") && Files.exists(norm) && Files.isReadable(norm) && !Files.isDirectory(norm)) {
                    return norm;
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    private Path findFallbackImage() {
        Path[] fallbackPaths = new Path[] {
            Paths.get("uploads", "f98df2a9-16ca-4922-bbb8-cd5ce8690952.jpeg"),
            Paths.get("server", "uploads", "f98df2a9-16ca-4922-bbb8-cd5ce8690952.jpeg"),
            Paths.get("..", "uploads", "f98df2a9-16ca-4922-bbb8-cd5ce8690952.jpeg"),
            Paths.get("server", "uploads", "zenve_logo.png"),
            Paths.get("uploads", "zenve_logo.png")
        };
        for (Path fb : fallbackPaths) {
            try {
                Path norm = fb.toAbsolutePath().normalize();
                if (Files.exists(norm) && Files.isReadable(norm)) {
                    return norm;
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    private Path findFallbackVideo() {
        Path[] fallbackPaths = new Path[] {
            Paths.get("uploads", "ce9cfbba-9536-413c-97fe-c3602c7e9a20.mp4"),
            Paths.get("server", "uploads", "ce9cfbba-9536-413c-97fe-c3602c7e9a20.mp4"),
            Paths.get("uploads", "ba436bed-c458-4d70-9e1f-fc9c66e125f3.mp4"),
            Paths.get("server", "uploads", "ba436bed-c458-4d70-9e1f-fc9c66e125f3.mp4"),
            Paths.get("..", "uploads", "ce9cfbba-9536-413c-97fe-c3602c7e9a20.mp4"),
            Paths.get("..", "server", "uploads", "ba436bed-c458-4d70-9e1f-fc9c66e125f3.mp4")
        };
        for (Path fb : fallbackPaths) {
            try {
                Path norm = fb.toAbsolutePath().normalize();
                if (Files.exists(norm) && Files.isReadable(norm)) {
                    return norm;
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    private String resolveContentType(Path path, String fileName) {
        String contentType = null;
        try {
            contentType = Files.probeContentType(path);
        } catch (IOException ignored) {}

        if (contentType == null || contentType.isBlank()) {
            String lower = fileName.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
            else if (lower.endsWith(".png")) contentType = "image/png";
            else if (lower.endsWith(".webp")) contentType = "image/webp";
            else if (lower.endsWith(".avif")) contentType = "image/avif";
            else if (lower.endsWith(".gif")) contentType = "image/gif";
            else if (lower.endsWith(".svg")) contentType = "image/svg+xml";
            else if (lower.endsWith(".mp4")) contentType = "video/mp4";
            else if (lower.endsWith(".webm")) contentType = "video/webm";
            else if (lower.endsWith(".mov")) contentType = "video/quicktime";
            else if (lower.endsWith(".ogg") || lower.endsWith(".ogv")) contentType = "video/ogg";
            else if (lower.endsWith(".mkv")) contentType = "video/x-matroska";
            else contentType = "application/octet-stream";
        }
        return contentType;
    }

    private boolean lowerMatchesVideo(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") ||
               lower.endsWith(".ogg") || lower.endsWith(".ogv") || lower.endsWith(".mkv") || lower.endsWith(".m4v");
    }
}
