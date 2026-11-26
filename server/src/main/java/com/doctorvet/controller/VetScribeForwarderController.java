package com.doctorvet.controller;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/vetscribe")
public class VetScribeForwarderController {

    private HttpClient httpClient;

    private synchronized HttpClient getHttpClient() {
        if (httpClient == null) {
            httpClient = HttpClient.newBuilder()
                    .version(HttpClient.Version.HTTP_1_1)
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
        }
        return httpClient;
    }

    private static final String VETSCRIBE_URL = "http://127.0.0.1:8005";

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(VETSCRIBE_URL + "/api/vetscribe/health"))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<String> response = getHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
            return ResponseEntity.status(response.statusCode())
                    .header("Content-Type", "application/json")
                    .body(response.body());
        } catch (Exception e) {
            return ResponseEntity.status(503)
                    .header("Content-Type", "application/json")
                    .body("{\"status\":\"offline\",\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    public record ParaphraseDto(String text) {}

    @PostMapping("/paraphrase")
    public ResponseEntity<String> paraphrase(@RequestBody ParaphraseDto req) {
        try {
            if (req == null || req.text() == null || req.text().isBlank()) {
                return ResponseEntity.badRequest()
                        .header("Content-Type", "application/json")
                        .body("{\"detail\":\"Please enter veterinary clinical notes.\"}");
            }

            String escaped = req.text()
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\r", "\\r")
                    .replace("\n", "\\n")
                    .replace("\t", "\\t");

            String jsonPayload = "{\"text\":\"" + escaped + "\"}";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(VETSCRIBE_URL + "/api/vetscribe/paraphrase"))
                    .timeout(Duration.ofMinutes(3))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                    .build();
            HttpResponse<String> response = getHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
            return ResponseEntity.status(response.statusCode())
                    .header("Content-Type", "application/json")
                    .body(response.body());
        } catch (Exception e) {
            return ResponseEntity.status(503)
                    .header("Content-Type", "application/json")
                    .body("{\"error\":\"VetScribe service unavailable\",\"message\":\"" + e.getMessage() + "\"}");
        }
    }
}
