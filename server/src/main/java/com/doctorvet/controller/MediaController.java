package com.doctorvet.controller;

import com.doctorvet.service.MediaStorageService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/media")
@CrossOrigin(originPatterns = "*")
public class MediaController {

    private static final Logger log = LoggerFactory.getLogger(MediaController.class);
    private final MediaStorageService mediaStorageService;

    public MediaController(MediaStorageService mediaStorageService) {
        this.mediaStorageService = mediaStorageService;
    }

    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadFile(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request) {
        try {
            if (file == null || file.isEmpty()) {
                Map<String, Object> error = new HashMap<>();
                error.put("success", false);
                error.put("error", "No file was provided or file is empty");
                return ResponseEntity.badRequest().body(error);
            }

            String fileUrl = mediaStorageService.storeFile(file);
            String fileName = fileUrl.substring(fileUrl.lastIndexOf("/") + 1);

            // Construct full absolute URL as backup
            String scheme = request.getScheme();
            String host = request.getServerName();
            int port = request.getServerPort();
            String portPart = (("http".equalsIgnoreCase(scheme) && port == 80) || ("https".equalsIgnoreCase(scheme) && port == 443)) ? "" : (":" + port);
            String fullUrl = scheme + "://" + host + portPart + fileUrl;

            // Determine media type
            String contentType = file.getContentType();
            String mediaType = "IMAGE";
            if (contentType != null) {
                String lower = contentType.toLowerCase(Locale.ROOT);
                if (lower.startsWith("video/") || lower.contains("mp4") || lower.contains("webm") || lower.contains("quicktime")) {
                    mediaType = "VIDEO";
                }
            } else {
                String lowerName = fileName.toLowerCase(Locale.ROOT);
                if (lowerName.endsWith(".mp4") || lowerName.endsWith(".webm") || lowerName.endsWith(".mov") || lowerName.endsWith(".ogg")) {
                    mediaType = "VIDEO";
                }
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("url", fileUrl);          // Standard relative path e.g. /uploads/uuid.ext
            response.put("fullUrl", fullUrl);      // Absolute URL fallback e.g. http://host:port/uploads/uuid.ext
            response.put("fileName", fileName);
            response.put("originalName", file.getOriginalFilename());
            response.put("contentType", contentType);
            response.put("mediaType", mediaType);
            response.put("size", file.getSize());

            log.info("[MediaController] File upload successful: {} ({}, {} bytes)", fileName, mediaType, file.getSize());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.warn("[MediaController] File upload validation rejected: {}", e.getMessage());
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            log.error("[MediaController] Unexpected file upload error: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", "Failed to upload media: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}
