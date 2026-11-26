const fs = require('fs');
const path = require('path');

const controllerPath = path.resolve(__dirname, '../server/src/main/java/com/doctorvet/controller/DoctorProfileController.java');
let code = fs.readFileSync(controllerPath, 'utf8');

const oldDeleteSection = `    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteAccount(
            @PathVariable String id,
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

    @DeleteMapping("/me")
    public ResponseEntity<?> deleteMyAccount(HttpServletRequest request) {
        Long authenticatedDoctorId = resolveAuthenticatedDoctor(request);
        if (authenticatedDoctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Sign in required to delete account"));
        }

        boolean deleted = doctorService.permanentlyDeleteDoctor(authenticatedDoctorId);
        if (deleted) {
            return ResponseEntity.ok(Map.of("success", true, "message", "Account permanently deleted"));
        }
        return ResponseEntity.notFound().build();
    }
}`;

const newDeleteSection = `    @DeleteMapping("/{id}")
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
}`;

const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

if (code.includes('@DeleteMapping("/{id}")')) {
  code = code.replace(
    /@DeleteMapping\("\/\{id\}"\)[\s\S]*?\}\s*\}\s*$/,
    newDeleteSection + '\n}\n'
  );
  if (isCRLF) code = code.replace(/\n/g, '\r\n');
  fs.writeFileSync(controllerPath, code, 'utf8');
  console.log('[OK] Updated DoctorProfileController.java with DELETE and POST deletion endpoints.');
} else {
  console.log('[WARN] @DeleteMapping("/{id}") not found.');
}

