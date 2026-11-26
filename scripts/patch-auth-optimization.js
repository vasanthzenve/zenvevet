const fs = require('fs');
const path = 'zenve-vet/server/src/main/java/com/doctorvet/controller/AuthController.java';

let content = fs.readFileSync(path, 'utf8');

const target1 = `        // 1. Try to find doctor in DB by email, phone, or name
        Optional<DoctorProfile> docOpt = doctorRepo.findAll().stream()
                .filter(d -> (d.getEmail() != null && d.getEmail().toLowerCase().equals(search))
                        || (d.getPhone() != null && !cleanPhone.isBlank()
                                && d.getPhone().replaceAll("[^0-9]", "").contains(cleanPhone))
                        || (d.getName() != null && d.getName().toLowerCase().contains(search))
                        || (d.getName() != null && search.contains(d.getName().toLowerCase())))
                .findFirst();

        DoctorProfile profile = docOpt.orElse(null);

        // Check password if doctor already has a password set
        if (profile != null && profile.getPasswordHash() != null && !profile.getPasswordHash().isBlank()) {
            if (req.password() == null || req.password().isBlank()) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Password is required to sign in."));
            }
            if (!passwordSecurityService.verifyPassword(req.password().trim(), profile.getPasswordHash())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message",
                                "Incorrect password. Please verify your credentials or use Forgot Password to reset it."));
            }
        }

        // 3. If still not found, return unauthorized
        if (profile == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "No registered doctor account found matching '" + req.identifier() + "'. Please check your credentials or create a new account."));
        } else {
            // If legacy account has no password set yet, set it on first successful login
            if ((profile.getPasswordHash() == null || profile.getPasswordHash().isBlank())
                    && req.password() != null && !req.password().isBlank()) {
                profile.setPasswordHash(passwordSecurityService.hashPassword(req.password().trim()));
            }
            profile.setActive(true);
            profile = doctorRepo.save(profile);
        }`;

const replacement1 = `        // 1. Optimized database-indexed lookup
        Optional<DoctorProfile> docOpt = doctorRepo.findByEmailIgnoreCase(search);
        if (docOpt.isEmpty() && !cleanPhone.isBlank()) {
            docOpt = doctorRepo.findByPhone(rawSearch);
            if (docOpt.isEmpty() && cleanPhone.length() >= 10) {
                var matches = doctorRepo.findByPhoneContaining(cleanPhone.substring(cleanPhone.length() - 10));
                if (!matches.isEmpty()) {
                    docOpt = Optional.of(matches.get(0));
                }
            }
        }
        if (docOpt.isEmpty()) {
            var idMatches = doctorRepo.findByIdentifierOrPhone(search, cleanPhone);
            if (!idMatches.isEmpty()) {
                docOpt = Optional.of(idMatches.get(0));
            }
        }

        DoctorProfile profile = docOpt.orElse(null);

        // 2. Existence verification
        if (profile == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "No registered doctor account found matching '" + req.identifier() + "'. Please check your credentials or create a new account."));
        }

        // 3. Secure password verification
        if (profile.getPasswordHash() != null && !profile.getPasswordHash().isBlank()) {
            if (req.password() == null || req.password().isBlank()) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Password is required to sign in."));
            }
            if (!passwordSecurityService.verifyPassword(req.password().trim(), profile.getPasswordHash())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message",
                                "Incorrect password. Please verify your credentials or use Forgot Password to reset it."));
            }
        } else {
            if (req.password() != null && !req.password().isBlank()) {
                profile.setPasswordHash(passwordSecurityService.hashPassword(req.password().trim()));
            } else {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Account has no password set. Please sign in via OTP or use Forgot Password to establish credentials."));
            }
        }
        profile.setActive(true);
        profile = doctorRepo.save(profile);`;

const target2 = `        // 1. Look up doctor profile
        Optional<DoctorProfile> docOpt = doctorRepo.findAll().stream()
                .filter(d -> (d.getEmail() != null && d.getEmail().toLowerCase().equals(search))
                        || (d.getPhone() != null && !cleanPhone.isBlank()
                                && d.getPhone().replaceAll("[^0-9]", "").contains(cleanPhone))
                        || (d.getName() != null && d.getName().toLowerCase().contains(search))
                        || (d.getName() != null && search.contains(d.getName().toLowerCase())))
                .findFirst();`;

const replacement2 = `        // 1. Optimized database-indexed lookup
        Optional<DoctorProfile> docOpt = doctorRepo.findByEmailIgnoreCase(search);
        if (docOpt.isEmpty() && !cleanPhone.isBlank()) {
            docOpt = doctorRepo.findByPhone(rawSearch);
            if (docOpt.isEmpty() && cleanPhone.length() >= 10) {
                var matches = doctorRepo.findByPhoneContaining(cleanPhone.substring(cleanPhone.length() - 10));
                if (!matches.isEmpty()) {
                    docOpt = Optional.of(matches.get(0));
                }
            }
        }
        if (docOpt.isEmpty()) {
            var idMatches = doctorRepo.findByIdentifierOrPhone(search, cleanPhone);
            if (!idMatches.isEmpty()) {
                docOpt = Optional.of(idMatches.get(0));
            }
        }`;

let replaced1 = false;
let replaced2 = false;

// Normalize CRLF to LF for matching
const normContent = content.replace(/\\r\\n/g, '\\n');
const normT1 = target1.replace(/\\r\\n/g, '\\n');
const normT2 = target2.replace(/\\r\\n/g, '\\n');

if (normContent.includes(normT1)) {
  content = normContent.replace(normT1, replacement1);
  replaced1 = true;
} else {
  console.log('Target 1 not matched');
}

if (content.includes(normT2)) {
  content = content.replace(normT2, replacement2);
  replaced2 = true;
} else {
  console.log('Target 2 not matched');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Replaced 1:', replaced1, 'Replaced 2:', replaced2);

