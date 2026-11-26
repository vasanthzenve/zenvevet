const fs = require('fs');
const path = require('path');

const authControllerPath = path.join(__dirname, '..', 'server', 'src', 'main', 'java', 'com', 'doctorvet', 'controller', 'AuthController.java');
let content = fs.readFileSync(authControllerPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Update record AuthResponse
const oldAuthResponse = `    public record AuthResponse(
            String token,
            Long id,
            String name,
            String email,
            String specialty,
            String qualification,
            String clinic,
            String city,
            String state,
            String avatar,
            String coverImage,
            String bio,
            String headline,
            String phone,
            String licenseNumber,
            Integer experienceYears,
            boolean verified,
            int connectionsCount,
            int casesCount,
            boolean active) {
    }`;

const newAuthResponse = `    public record AuthResponse(
            String token,
            Long id,
            String name,
            String email,
            String specialty,
            String qualification,
            String clinic,
            String city,
            String state,
            String avatar,
            String coverImage,
            String bio,
            String headline,
            String phone,
            String licenseNumber,
            Integer experienceYears,
            boolean verified,
            int connectionsCount,
            int casesCount,
            boolean active,
            String refreshToken) {
        public AuthResponse(
                String token, Long id, String name, String email, String specialty, String qualification,
                String clinic, String city, String state, String avatar, String coverImage, String bio,
                String headline, String phone, String licenseNumber, Integer experienceYears,
                boolean verified, int connectionsCount, int casesCount, boolean active) {
            this(token, id, name, email, specialty, qualification, clinic, city, state, avatar, coverImage, bio,
                 headline, phone, licenseNumber, experienceYears, verified, connectionsCount, casesCount, active, null);
        }
    }`;

if (content.includes(oldAuthResponse)) {
    content = content.replace(oldAuthResponse, newAuthResponse);
    console.log('✓ Successfully updated AuthResponse record');
} else {
    console.warn('! Could not find oldAuthResponse');
}

// 2. Add /refresh endpoint
const oldLogoutAnchor = `        return ResponseEntity.ok(Map.of("message", "Successfully signed out"));
    }`;

const newLogoutAndRefresh = `        return ResponseEntity.ok(Map.of("message", "Successfully signed out"));
    }

    public record RefreshTokenRequest(String refreshToken) {}

    @PostMapping("/refresh")
    public ResponseEntity<?> refreshToken(@RequestBody RefreshTokenRequest req) {
        if (req == null || req.refreshToken() == null || req.refreshToken().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Bad Request", "message", "Refresh token is required"));
        }
        TokenService.RotationResult result = tokenService.rotateRefreshToken(req.refreshToken(), "", "");
        if (!result.success()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Unauthorized", "message", result.errorMessage()));
        }
        return ResponseEntity.ok(Map.of(
                "token", result.newAccessToken(),
                "refreshToken", result.newRefreshToken(),
                "doctorId", result.doctorId(),
                "role", result.role()
        ));
    }`;

if (content.includes(oldLogoutAnchor)) {
    content = content.replace(oldLogoutAnchor, newLogoutAndRefresh);
    console.log('✓ Successfully added /refresh endpoint');
} else {
    console.warn('! Could not find oldLogoutAnchor');
}

fs.writeFileSync(authControllerPath, content, 'utf8');
console.log('AuthController.java saved successfully.');

