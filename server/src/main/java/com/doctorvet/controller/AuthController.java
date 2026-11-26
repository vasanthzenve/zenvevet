package com.doctorvet.controller;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.doctorvet.model.DoctorProfile;
import com.doctorvet.model.PasswordResetOtp;
import com.doctorvet.repository.AdvertiserRepository;
import com.doctorvet.repository.DoctorProfileRepository;
import com.doctorvet.repository.PasswordResetOtpRepository;
import com.doctorvet.security.PasswordSecurityService;
import com.doctorvet.security.TokenService;
import com.doctorvet.service.EmailService;
import com.doctorvet.service.TwilioVerifyService;

@RestController
@RequestMapping({"/api/v1/auth", "/api/auth"})
@CrossOrigin(originPatterns = "*")
public class AuthController {

    private final DoctorProfileRepository doctorRepo;
    private final TokenService tokenService;
    private final EmailService emailService;
    private final PasswordResetOtpRepository otpRepo;
    private final PasswordSecurityService passwordSecurityService;
    private final AdvertiserRepository advertiserRepo;
    private final com.doctorvet.service.DeviceSecurityService deviceSecurityService;
    private final com.doctorvet.service.TwilioVerifyService twilioVerifyService;
    private final com.doctorvet.security.ssrf.SsrfProtectionService ssrfProtectionService;
    private final com.doctorvet.security.logging.SecurityAuditLogger auditLogger;

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final long LOCKOUT_DURATION_MS = 15 * 60 * 1000L; // 15 minutes lockout
    private final Map<String, long[]> failedLoginTracker = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public AuthController(
            DoctorProfileRepository doctorRepo,
            TokenService tokenService,
            EmailService emailService,
            PasswordResetOtpRepository otpRepo,
            PasswordSecurityService passwordSecurityService,
            AdvertiserRepository advertiserRepo,
            com.doctorvet.service.DeviceSecurityService deviceSecurityService,
            com.doctorvet.service.TwilioVerifyService twilioVerifyService,
            @org.springframework.beans.factory.annotation.Autowired(required = false) com.doctorvet.security.ssrf.SsrfProtectionService ssrfProtectionService,
            @org.springframework.beans.factory.annotation.Autowired(required = false) com.doctorvet.security.logging.SecurityAuditLogger auditLogger) {
        this.doctorRepo = doctorRepo;
        this.tokenService = tokenService;
        this.emailService = emailService;
        this.otpRepo = otpRepo;
        this.passwordSecurityService = passwordSecurityService;
        this.advertiserRepo = advertiserRepo;
        this.deviceSecurityService = deviceSecurityService;
        this.twilioVerifyService = twilioVerifyService;
        this.ssrfProtectionService = ssrfProtectionService;
        this.auditLogger = auditLogger;
    }

    private final Map<String, ResetCodeInfo> resetCodes = new ConcurrentHashMap<>();
    private final Map<String, ResetCodeInfo> loginOtpCodes = new ConcurrentHashMap<>();

    public record ResetCodeInfo(String code, LocalDateTime expiry, Long doctorId) {
    }

    public record LoginRequest(String identifier, String password) {
    }

    public record SendOtpDto(String phone, String mobile, String phoneNumber, String email, String identifier) {
        public String effectivePhone() {
            if (phone != null && !phone.isBlank()) return phone.trim();
            if (mobile != null && !mobile.isBlank()) return mobile.trim();
            if (phoneNumber != null && !phoneNumber.isBlank()) return phoneNumber.trim();
            return "";
        }

        public String effectiveEmail() {
            if (email != null && !email.isBlank()) return email.trim();
            if (identifier != null && identifier.contains("@")) return identifier.trim();
            return "";
        }
    }

    public record GenericVerifyOtpRequest(
            String phone, String mobile, String phoneNumber,
            String email, String identifier,
            String otp, String code) {
        public String effectivePhone() {
            if (phone != null && !phone.isBlank()) return phone.trim();
            if (mobile != null && !mobile.isBlank()) return mobile.trim();
            if (phoneNumber != null && !phoneNumber.isBlank()) return phoneNumber.trim();
            return "";
        }

        public String effectiveEmail() {
            if (email != null && !email.isBlank()) return email.trim();
            if (identifier != null && identifier.contains("@")) return identifier.trim();
            return "";
        }

        public String effectiveCode() {
            if (otp != null && !otp.isBlank()) return otp.trim();
            if (code != null && !code.isBlank()) return code.trim();
            return "";
        }
    }

    public record SendLoginOtpRequest(String phone, String mobile, String email) {
        public String effectivePhone() {
            if (phone != null && !phone.isBlank()) return phone.trim();
            if (mobile != null && !mobile.isBlank()) return mobile.trim();
            return "";
        }

        public String effectiveEmail() {
            if (email != null && !email.isBlank()) return email.trim();
            return "";
        }
    }

    public record LoginWithOtpRequest(String phone, String code) {
    }

    public record RegisterRequest(String name, String email, String password,
            String vciNumber, String specialty, String city, String state, String phone) {
    }

    public record ForgotPasswordRequest(String identifier) {
    }

    public record VerifyOtpRequest(String email, String otp) {
    }

    public record VerifyResetCodeRequest(String identifier, String code) {
    }

    public record ResetPasswordRequest(String identifier, String email, String otp, String code, String newPassword) {
        public String effectiveEmailOrIdentifier() {
            if (email != null && !email.isBlank())
                return email;
            if (identifier != null && !identifier.isBlank())
                return identifier;
            return "";
        }

        public String effectiveCode() {
            if (otp != null && !otp.isBlank())
                return otp;
            if (code != null && !code.isBlank())
                return code;
            return "";
        }
    }

    public record AuthResponse(
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
                    headline, phone, licenseNumber, experienceYears, verified, connectionsCount, casesCount, active,
                    null);
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req, jakarta.servlet.http.HttpServletRequest request) {
        if (req.identifier() == null || req.identifier().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Email, phone number, or doctor name is required"));
        }

        String rawSearch = req.identifier().trim();
        String search = rawSearch.toLowerCase();
        String cleanPhone = rawSearch.replaceAll("[^0-9]", "");

        // Brute-force & Lockout Protection
        String clientIp = request.getRemoteAddr() != null ? request.getRemoteAddr() : "127.0.0.1";
        String lockoutKey = search + "@" + clientIp;
        long now = System.currentTimeMillis();
        long[] tracker = failedLoginTracker.computeIfAbsent(lockoutKey, k -> new long[]{0, 0});
        if (tracker[1] > now) {
            long remainingSeconds = (tracker[1] - now) / 1000;
            if (auditLogger != null) {
                auditLogger.logSecurityEvent(com.doctorvet.security.logging.SecurityAuditLogger.EventType.BRUTE_FORCE_BLOCKED, rawSearch, clientIp, "Attempt while locked out");
            }
            return ResponseEntity.status(429).body(Map.of(
                    "error", "Too Many Requests",
                    "message", "Account temporarily locked due to multiple failed login attempts. Please retry in " + remainingSeconds + " seconds or reset your password."
            ));
        }

        // 1. Optimized database-indexed lookup
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

        // 2. Anti-Account Enumeration: uniform message for non-existent users
        if (profile == null) {
            recordFailedAttempt(lockoutKey, rawSearch, clientIp);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid credentials. Please verify your email, phone, or password."));
        }

        // 3. Secure password verification
        if (profile.getPasswordHash() != null && !profile.getPasswordHash().isBlank()) {
            if (req.password() == null || req.password().isBlank()) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Password is required to sign in."));
            }
            if (!passwordSecurityService.verifyPassword(req.password().trim(), profile.getPasswordHash())) {
                recordFailedAttempt(lockoutKey, rawSearch, clientIp);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Invalid credentials. Please verify your email, phone, or password."));
            }
        } else {
            if (req.password() != null && !req.password().isBlank()) {
                profile.setPasswordHash(passwordSecurityService.hashPassword(req.password().trim()));
            } else {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Account has no password set. Please sign in via OTP or use Forgot Password to establish credentials."));
            }
        }

        // Successful authentication: clear failure tracker
        failedLoginTracker.remove(lockoutKey);
        profile.setActive(true);
        profile = doctorRepo.save(profile);

        // Generate signed token
        String token = tokenService.generateToken(profile.getId(), profile.getName(), profile.getEmail());

        if (auditLogger != null) {
            auditLogger.logSecurityEvent(com.doctorvet.security.logging.SecurityAuditLogger.EventType.LOGIN_SUCCESS, profile.getEmail(), clientIp, "Doctor logged in successfully");
        }

        // Check if login is from another device and dispatch security alert email from no-reply@zenvevet.com
        if (profile.getEmail() != null && !profile.getEmail().isBlank()) {
            deviceSecurityService.checkAndRecordDevice(profile.getEmail(), profile.getName(), "DOCTOR", profile.getId(), request);
        }

        return ResponseEntity.ok(toAuthResponse(token, profile));
    }

    private void recordFailedAttempt(String lockoutKey, String rawSearch, String clientIp) {
        long now = System.currentTimeMillis();
        long[] tracker = failedLoginTracker.compute(lockoutKey, (k, v) -> {
            if (v == null || (now - v[1] > LOCKOUT_DURATION_MS && v[1] > 0)) {
                return new long[] { 1, 0 };
            }
            v[0]++;
            if (v[0] >= MAX_FAILED_ATTEMPTS) {
                v[1] = now + LOCKOUT_DURATION_MS;
            }
            return v;
        });
        if (auditLogger != null) {
            auditLogger.logSecurityEvent(com.doctorvet.security.logging.SecurityAuditLogger.EventType.LOGIN_FAILURE,
                    rawSearch, clientIp, "Failed login attempt #" + tracker[0]);
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Doctor name is required"));
        }
        if (req.email() != null && !req.email().isBlank()) {
            Optional<DoctorProfile> existing = doctorRepo.findByEmailIgnoreCase(req.email().trim());
            if (existing.isPresent()) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "An account with this email address already exists. Please sign in or reset your password."));
            }
        }

        String doctorName = req.name().trim();
        if (!doctorName.startsWith("Dr.") && !doctorName.startsWith("Dr ")) {
            doctorName = "Dr. " + doctorName;
        }

        DoctorProfile newDoctor = new DoctorProfile();
        newDoctor.setName(doctorName);
        newDoctor.setEmail(req.email() != null && !req.email().isBlank() ? req.email().trim() : null);
        newDoctor.setPhone(req.phone() != null && !req.phone().isBlank() ? req.phone().trim() : null);
        newDoctor.setSpecialty(req.specialty() != null && !req.specialty().isBlank() ? req.specialty().trim() : "");
        newDoctor.setCity(req.city() != null && !req.city().isBlank() ? req.city().trim() : "");
        newDoctor.setState(req.state() != null && !req.state().isBlank() ? req.state().trim() : "");
        newDoctor.setQualification("");
        newDoctor.setClinic("");
        newDoctor.setAvatar("");
        newDoctor.setCoverImage("");
        newDoctor.setBio("");
        newDoctor.setHeadline("");
        newDoctor.setLicenseNumber(req.vciNumber() != null && !req.vciNumber().isBlank() ? req.vciNumber().trim() : "");
        newDoctor.setExperienceYears(0);
        newDoctor.setCasesCount(0);
        newDoctor.setConnectionsCount(0);
        newDoctor.setVerified(false);
        newDoctor.setActive(true);
        if (req.password() != null && !req.password().isBlank()) {
            if (!passwordSecurityService.isStrongPassword(req.password().trim())) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "Password must be at least 8 characters long and contain uppercase letters, lowercase letters, and numbers or symbols."));
            }
            newDoctor.setPasswordHash(passwordSecurityService.hashPassword(req.password().trim()));
        }
        DoctorProfile saved = doctorRepo.save(newDoctor);

        if (saved.getEmail() != null && !saved.getEmail().isBlank()) {
            emailService.sendDoctorWelcomeEmail(saved.getEmail(), saved.getName(), saved.getSpecialty());
        }

        String token = tokenService.generateToken(saved.getId(), saved.getName(), saved.getEmail());

        return ResponseEntity.ok(toAuthResponse(token, saved));
    }

    /**
     * Step 1: User Forgot Password -> Dispatches 6-digit OTP from
     * no-reply@zenvevet.com to registered email.
     * Also supports mobile dispatch if a mobile number is registered.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest req) {
        if (req.identifier() == null || req.identifier().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Please enter your registered email address or mobile number."));
        }

        String rawSearch = req.identifier().trim();
        String search = rawSearch.toLowerCase();
        String cleanPhone = rawSearch.replaceAll("[^0-9]", "");

        // 1. Optimized database-indexed lookup
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

        String recipientEmail = null;
        String recipientName = "Zenve Vet Practitioner";
        DoctorProfile doc = docOpt.orElse(null);

        if (doc != null) {
            recipientEmail = doc.getEmail();
            recipientName = doc.getName();
        } else {
            // Check advertiser
            var advOpt = advertiserRepo.findByBusinessEmailIgnoreCase(search);
            if (advOpt.isPresent()) {
                var adv = advOpt.get();
                recipientEmail = adv.getBusinessEmail();
                recipientName = adv.getFullName() != null ? adv.getFullName() : adv.getCompanyName();
            }
        }

        if (doc == null && (recipientEmail == null || recipientEmail.isBlank())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "No account found matching '" + req.identifier()
                            + "'. Please check your credentials or register a new account."));
        }

        // Generate 6-digit OTP
        int randomCode = 100000 + new SecureRandom().nextInt(900000);
        String otpCode = String.valueOf(randomCode);

        // A. Send OTP to registered email from no-reply@zenvevet.com if email is
        // available
        if (recipientEmail != null && !recipientEmail.isBlank()) {
            String lowerEmail = recipientEmail.trim().toLowerCase();
            List<PasswordResetOtp> existingOtps = otpRepo.findAllByEmailIgnoreCase(lowerEmail);
            for (PasswordResetOtp otp : existingOtps) {
                if (!otp.isUsed()) {
                    otp.setUsed(true);
                }
            }
            otpRepo.saveAll(existingOtps);

            PasswordResetOtp newOtp = new PasswordResetOtp(lowerEmail, otpCode, LocalDateTime.now().plusMinutes(10));
            otpRepo.save(newOtp);

            // Send automated email from no-reply@zenvevet.com
            emailService.sendPasswordResetOtpEmail(lowerEmail, recipientName, otpCode, 10);
        }

        // B. Also cache in resetCodes map for phone / mobile support
        if (doc != null) {
            String key = (doc.getEmail() != null && !doc.getEmail().isBlank()) ? doc.getEmail().toLowerCase()
                    : doc.getId().toString();
            resetCodes.put(key, new ResetCodeInfo(otpCode, LocalDateTime.now().plusMinutes(15), doc.getId()));
            if (doc.getPhone() != null && !doc.getPhone().isBlank()) {
                String digits = doc.getPhone().replaceAll("[^0-9]", "");
                if (digits.length() >= 10) {
                    resetCodes.put(digits,
                            new ResetCodeInfo(otpCode, LocalDateTime.now().plusMinutes(15), doc.getId()));
                    twilioVerifyService.sendOtp(doc.getPhone());
                }
            }
        }

        String maskedEmailStr = recipientEmail != null ? maskEmail(recipientEmail) : "";
        String phoneStr = (doc != null && doc.getPhone() != null) ? maskPhoneNumber(doc.getPhone()) : "";

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message",
                "A 6-digit verification code (OTP) has been dispatched from no-reply@zenvevet.com to your registered email.",
                "maskedEmail", maskedEmailStr,
                "email", recipientEmail != null ? recipientEmail : "",
                "doctorName", recipientName,
                "registeredPhoneMasked", phoneStr,
                "sender", "no-reply@zenvevet.com",
                "expiresInMinutes", 10));
    }

    /**
     * Send OTP via Twilio Verify API v2 (SMS) and EmailService (Email).
     * Supports international numbers in E.164 format and dual SMS/email dispatch.
     */
    @PostMapping("/send-otp")
    public ResponseEntity<?> sendOtp(@RequestBody SendOtpDto req) {
        String phone = req.effectivePhone();
        String reqEmail = req.effectiveEmail();

        if (phone.isBlank() && reqEmail.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Mobile number or email address is required to send verification code."
            ));
        }

        String e164 = !phone.isBlank() ? TwilioVerifyService.toE164(phone) : null;
        String cleanPhone = phone.replaceAll("[^0-9]", "");
        String last10 = cleanPhone.length() >= 10 ? cleanPhone.substring(cleanPhone.length() - 10) : cleanPhone;

        Optional<DoctorProfile> docOpt = Optional.empty();
        if (!cleanPhone.isBlank()) {
            docOpt = doctorRepo.findAll().stream()
                    .filter(d -> d.getPhone() != null &&
                            (d.getPhone().replaceAll("[^0-9]", "").endsWith(last10) ||
                             (e164 != null && e164.equals(TwilioVerifyService.toE164(d.getPhone())))))
                    .findFirst();
        }
        if (docOpt.isEmpty() && !reqEmail.isBlank()) {
            docOpt = doctorRepo.findByEmailIgnoreCase(reqEmail.toLowerCase());
        }

        String recipientEmail = docOpt.map(DoctorProfile::getEmail).filter(e -> e != null && !e.isBlank())
                .orElse(reqEmail.isBlank() ? null : reqEmail.trim());
        String recipientName = docOpt.map(DoctorProfile::getName).orElse("Zenve Vet Practitioner");
        Long docId = docOpt.map(DoctorProfile::getId).orElse(null);

        // 1. Generate 6-digit email OTP and dispatch to registered email
        boolean emailSent = false;
        String emailOtpCode = null;
        if (recipientEmail != null && !recipientEmail.isBlank()) {
            int randomCode = 100000 + new SecureRandom().nextInt(900000);
            emailOtpCode = String.valueOf(randomCode);
            String lowerEmail = recipientEmail.toLowerCase().trim();

            ResetCodeInfo codeInfo = new ResetCodeInfo(emailOtpCode, LocalDateTime.now().plusMinutes(10), docId);
            loginOtpCodes.put(lowerEmail, codeInfo);
            if (!cleanPhone.isBlank()) {
                loginOtpCodes.put(cleanPhone, codeInfo);
                if (cleanPhone.length() >= 10) {
                    loginOtpCodes.put(cleanPhone.substring(cleanPhone.length() - 10), codeInfo);
                }
            }
            if (e164 != null) {
                loginOtpCodes.put(e164, codeInfo);
            }

            // Persist in otpRepo
            List<PasswordResetOtp> existingOtps = otpRepo.findAllByEmailIgnoreCase(lowerEmail);
            for (PasswordResetOtp otp : existingOtps) {
                if (!otp.isUsed()) {
                    otp.setUsed(true);
                }
            }
            otpRepo.saveAll(existingOtps);
            otpRepo.save(new PasswordResetOtp(lowerEmail, emailOtpCode, LocalDateTime.now().plusMinutes(10)));

            emailService.sendLoginOtpEmail(lowerEmail, recipientName, emailOtpCode, 10);
            emailSent = true;
        }

        // 2. Dispatch SMS via Twilio Verify
        TwilioVerifyService.SendOtpResult smsResult = null;
        boolean smsSent = false;
        if (!phone.isBlank()) {
            smsResult = twilioVerifyService.sendOtp(phone);
            smsSent = smsResult.success();
            if (!smsResult.success() && !emailSent) {
                int status = "rate_limited".equals(smsResult.status()) ? 429 : 400;
                return ResponseEntity.status(status).body(Map.of(
                        "success", false,
                        "message", smsResult.message(),
                        "status", smsResult.status(),
                        "retryAfterSeconds", smsResult.retryAfterSeconds()
                ));
            }
        }

        String phoneVal = smsResult != null && smsResult.phone() != null ? smsResult.phone() : (e164 != null ? e164 : phone);
        String maskedPhone = !phone.isBlank() ? TwilioVerifyService.maskPhoneNumber(phoneVal) : "";
        String maskedEmail = recipientEmail != null ? maskEmail(recipientEmail) : "";

        StringBuilder msg = new StringBuilder();
        if (smsSent && emailSent) {
            msg.append("A 6-digit verification code has been dispatched via SMS to ").append(maskedPhone)
               .append(" and to your registered email ").append(maskedEmail);
        } else if (smsSent) {
            msg.append("A 6-digit verification code has been dispatched via SMS to ").append(maskedPhone);
        } else if (emailSent) {
            msg.append("A 6-digit verification code has been dispatched to your registered email ").append(maskedEmail);
        } else {
            msg.append("Verification code dispatched.");
        }

        Map<String, Object> responseMap = new java.util.LinkedHashMap<>();
        responseMap.put("success", true);
        responseMap.put("message", msg.toString());
        responseMap.put("status", "pending");
        responseMap.put("smsSent", smsSent);
        responseMap.put("emailSent", emailSent);
        responseMap.put("expiresInSeconds", 600);
        if (!maskedPhone.isBlank()) {
            responseMap.put("phone", phoneVal);
            responseMap.put("maskedPhone", maskedPhone);
        }
        if (recipientEmail != null) {
            responseMap.put("email", recipientEmail);
            responseMap.put("maskedEmail", maskedEmail);
        }

        return ResponseEntity.ok(responseMap);
    }

    /**
     * Step 2: Verify OTP (supports Twilio Verify SMS OTP and Email OTP)
     */
    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@RequestBody GenericVerifyOtpRequest req, jakarta.servlet.http.HttpServletRequest request) {
        String phone = req.effectivePhone();
        String code = req.effectiveCode();
        String email = req.effectiveEmail();

        // If email verification (or no phone provided)
        if (phone.isBlank() && !email.isBlank()) {
            boolean memValid = checkEmailOrMemoryOtp("", email, code);
            if (memValid) {
                return ResponseEntity.ok(Map.of(
                        "success", true,
                        "valid", true,
                        "status", "approved",
                        "message", "OTP verified successfully."
                ));
            }
            return performOtpVerification(email, code);
        }

        if (phone.isBlank() || code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "valid", false,
                    "message", "Mobile number and OTP verification code are required."
            ));
        }

        boolean verified = false;

        // 1. Try Twilio Verify API v2 (for SMS OTP)
        TwilioVerifyService.VerifyOtpResult twilioResult = twilioVerifyService.verifyOtp(phone, code);
        if (twilioResult.success() && twilioResult.valid()) {
            verified = true;
        }

        // 2. If Twilio verification did not match, check Email OTP (dual-channel support)
        if (!verified) {
            verified = checkEmailOrMemoryOtp(phone, email, code);
        }

        if (!verified) {
            String errMessage = (twilioResult != null && !twilioResult.message().isBlank())
                    ? twilioResult.message()
                    : "Invalid or expired verification code. Please check your SMS or email and try again.";
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "valid", false,
                    "status", "failed",
                    "message", errMessage
            ));
        }

        // Successfully verified!
        // Continue authentication flow: check if phone belongs to an existing registered doctor
        String e164 = TwilioVerifyService.toE164(phone);
        String cleanPhone = phone.replaceAll("[^0-9]", "");
        String last10 = cleanPhone.length() >= 10 ? cleanPhone.substring(cleanPhone.length() - 10) : cleanPhone;

        Optional<DoctorProfile> docOpt = doctorRepo.findAll().stream()
                .filter(d -> d.getPhone() != null && !d.getPhone().isBlank() &&
                        (d.getPhone().replaceAll("[^0-9]", "").endsWith(last10) ||
                         (e164 != null && e164.equals(TwilioVerifyService.toE164(d.getPhone())))))
                .findFirst();

        if (docOpt.isEmpty() && !email.isBlank()) {
            docOpt = doctorRepo.findByEmailIgnoreCase(email.toLowerCase().trim());
        }

        if (docOpt.isPresent()) {
            DoctorProfile doc = docOpt.get();
            doc.setActive(true);
            DoctorProfile saved = doctorRepo.save(doc);

            String token = tokenService.generateToken(saved.getId(), saved.getName(), saved.getEmail());
            if (saved.getEmail() != null && !saved.getEmail().isBlank()) {
                deviceSecurityService.checkAndRecordDevice(saved.getEmail(), saved.getName(), "DOCTOR", saved.getId(), request);
            }

            AuthResponse authRes = toAuthResponse(token, saved);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "valid", true,
                    "status", "approved",
                    "message", "OTP verified successfully. Signed in.",
                    "token", token,
                    "user", authRes,
                    "doctor", authRes
            ));
        }

        // Verified successfully for registration or phone number validation
        return ResponseEntity.ok(Map.of(
                "success", true,
                "valid", true,
                "status", "approved",
                "phone", e164 != null ? e164 : phone,
                "registered", false,
                "message", "OTP verified successfully."
        ));
    }

    private boolean checkEmailOrMemoryOtp(String phone, String email, String code) {
        if (code == null || code.isBlank()) return false;
        String cleanCode = code.trim();

        String cleanPhone = phone != null ? phone.replaceAll("[^0-9]", "") : "";
        String last10 = cleanPhone.length() >= 10 ? cleanPhone.substring(cleanPhone.length() - 10) : cleanPhone;
        String e164 = !cleanPhone.isBlank() ? TwilioVerifyService.toE164(phone) : null;

        Optional<DoctorProfile> docOpt = Optional.empty();
        if (!cleanPhone.isBlank()) {
            docOpt = doctorRepo.findAll().stream()
                    .filter(d -> d.getPhone() != null &&
                            (d.getPhone().replaceAll("[^0-9]", "").endsWith(last10) ||
                             (e164 != null && e164.equals(TwilioVerifyService.toE164(d.getPhone())))))
                    .findFirst();
        }
        if (docOpt.isEmpty() && email != null && !email.isBlank()) {
            docOpt = doctorRepo.findByEmailIgnoreCase(email.toLowerCase().trim());
        }

        String resolvedEmail = docOpt.map(DoctorProfile::getEmail)
                .orElse(email != null && !email.isBlank() ? email.toLowerCase().trim() : null);

        // 1. Check loginOtpCodes
        List<String> keys = new java.util.ArrayList<>();
        if (!cleanPhone.isBlank()) {
            keys.add(cleanPhone);
            if (!last10.isBlank()) keys.add(last10);
        }
        if (phone != null && !phone.isBlank()) keys.add(phone.trim());
        if (e164 != null) keys.add(e164);
        if (resolvedEmail != null) keys.add(resolvedEmail.toLowerCase());

        for (String k : keys) {
            ResetCodeInfo info = loginOtpCodes.get(k);
            if (info != null) {
                if (info.expiry().isAfter(LocalDateTime.now()) && info.code().equals(cleanCode)) {
                    for (String rk : keys) loginOtpCodes.remove(rk);
                    if (resolvedEmail != null) {
                        otpRepo.findTopByEmailIgnoreCaseAndUsedFalseOrderByCreatedAtDesc(resolvedEmail)
                                .ifPresent(o -> { o.setUsed(true); otpRepo.save(o); });
                    }
                    return true;
                }
            }
        }

        // 2. Check DB otpRepo
        if (resolvedEmail != null) {
            Optional<PasswordResetOtp> otpOpt = otpRepo.findTopByEmailIgnoreCaseAndUsedFalseOrderByCreatedAtDesc(resolvedEmail);
            if (otpOpt.isPresent()) {
                PasswordResetOtp otpRecord = otpOpt.get();
                if (!otpRecord.isExpired() && otpRecord.getOtp().equals(cleanCode)) {
                    otpRecord.setUsed(true);
                    otpRepo.save(otpRecord);
                    for (String k : keys) loginOtpCodes.remove(k);
                    return true;
                }
            }
        }

        return false;
    }

    @PostMapping("/verify-code")
    public ResponseEntity<?> verifyCode(@RequestBody VerifyResetCodeRequest req) {
        return performOtpVerification(req.identifier(), req.code());
    }

    private ResponseEntity<?> performOtpVerification(String identifier, String inputOtp) {
        if (identifier == null || identifier.isBlank() || inputOtp == null || inputOtp.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email/Identifier and OTP code are required."));
        }

        String search = identifier.trim().toLowerCase();
        String cleanPhone = search.replaceAll("[^0-9]", "");
        String cleanCode = inputOtp.trim();

        // Resolve doctor email if identifier is doctor name or phone number
        String tempOtpEmail = search.contains("@") ? search : null;
        if (tempOtpEmail == null) {
            Optional<DoctorProfile> docMatch = doctorRepo.findAll().stream()
                    .filter(d -> (d.getEmail() != null && d.getEmail().toLowerCase().equals(search))
                            || (d.getPhone() != null && !cleanPhone.isBlank()
                                    && d.getPhone().replaceAll("[^0-9]", "").contains(cleanPhone))
                            || (d.getName() != null && d.getName().toLowerCase().contains(search)))
                    .findFirst();
            if (docMatch.isPresent() && docMatch.get().getEmail() != null) {
                tempOtpEmail = docMatch.get().getEmail().toLowerCase().trim();
            }
        }
        final String resolvedEmail = tempOtpEmail;

        // 1. Try DB-backed email OTP record
        Optional<PasswordResetOtp> otpOpt = Optional.empty();
        if (resolvedEmail != null) {
            otpOpt = otpRepo.findTopByEmailIgnoreCaseAndUsedFalseOrderByCreatedAtDesc(resolvedEmail);
        }
        if (otpOpt.isEmpty()) {
            otpOpt = otpRepo.findTopByEmailIgnoreCaseAndUsedFalseOrderByCreatedAtDesc(search);
        }

        if (otpOpt.isPresent()) {
            PasswordResetOtp otpRecord = otpOpt.get();
            if (otpRecord.isExpired()) {
                otpRecord.setUsed(true);
                otpRepo.save(otpRecord);
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "This OTP verification code has expired. Please request a new code."));
            }
            otpRecord.setAttemptCount(otpRecord.getAttemptCount() + 1);
            if (otpRecord.getAttemptCount() > 5) {
                otpRecord.setUsed(true);
                otpRepo.save(otpRecord);
                return ResponseEntity.badRequest().body(Map.of("message",
                        "Too many invalid attempts. This OTP has been voided. Please request a new one."));
            }
            if (otpRecord.getOtp().equals(cleanCode)) {
                return ResponseEntity.ok(Map.of("valid", true, "success", true, "message",
                        "OTP verified successfully. You may now set your new password."));
            }
        }

        // 2. Check memory map fallback (for mobile OTP)
        ResetCodeInfo info = resetCodes.get(search);
        if (info == null && resolvedEmail != null)
            info = resetCodes.get(resolvedEmail);
        if (info == null && !cleanPhone.isBlank())
            info = resetCodes.get(cleanPhone);

        if (info != null) {
            if (info.expiry().isBefore(LocalDateTime.now())) {
                resetCodes.remove(search);
                if (resolvedEmail != null)
                    resetCodes.remove(resolvedEmail);
                if (!cleanPhone.isBlank())
                    resetCodes.remove(cleanPhone);
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Verification code has expired. Please request a new code."));
            }
            if (info.code().equals(cleanCode)) {
                return ResponseEntity.ok(
                        Map.of("valid", true, "success", true, "message", "Verification code confirmed successfully."));
            }
        }

        return ResponseEntity.badRequest()
                .body(Map.of("message", "Invalid verification code. Please check your email and try again."));
    }

    /**
     * Step 3: Reset Password -> Updates password, marks OTP used, and dispatches
     * confirmation email from no-reply@zenvevet.com
     */
    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest req) {
        String identifier = req.effectiveEmailOrIdentifier();
        String inputOtp = req.effectiveCode();
        String newPassword = req.newPassword();

        if (identifier.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email address or identifier is required."));
        }
        if (inputOtp.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Verification code (OTP) is required."));
        }
        if (newPassword == null || newPassword.length() < 6) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "New password must be at least 6 characters long."));
        }

        String search = identifier.trim().toLowerCase();
        String cleanPhone = search.replaceAll("[^0-9]", "");
        String cleanCode = inputOtp.trim();

        // Resolve doctor email if identifier is doctor name or phone number
        String tempResetEmail = search.contains("@") ? search : null;
        if (tempResetEmail == null) {
            Optional<DoctorProfile> docMatch = doctorRepo.findAll().stream()
                    .filter(d -> (d.getEmail() != null && d.getEmail().toLowerCase().equals(search))
                            || (d.getPhone() != null && !cleanPhone.isBlank()
                                    && d.getPhone().replaceAll("[^0-9]", "").contains(cleanPhone))
                            || (d.getName() != null && d.getName().toLowerCase().contains(search)))
                    .findFirst();
            if (docMatch.isPresent() && docMatch.get().getEmail() != null) {
                tempResetEmail = docMatch.get().getEmail().toLowerCase().trim();
            }
        }
        final String resolvedEmail = tempResetEmail;

        // 1. Verify OTP in DB
        boolean otpVerified = false;
        Optional<PasswordResetOtp> otpOpt = Optional.empty();
        if (resolvedEmail != null) {
            otpOpt = otpRepo.findTopByEmailIgnoreCaseAndUsedFalseOrderByCreatedAtDesc(resolvedEmail);
        }
        if (otpOpt.isEmpty()) {
            otpOpt = otpRepo.findTopByEmailIgnoreCaseAndUsedFalseOrderByCreatedAtDesc(search);
        }

        if (otpOpt.isPresent()) {
            PasswordResetOtp otpRecord = otpOpt.get();
            if (!otpRecord.isExpired() && otpRecord.getOtp().equals(cleanCode)) {
                otpRecord.setUsed(true);
                otpRepo.save(otpRecord);
                otpVerified = true;
            }
        }

        // 2. Or check memory map fallback
        if (!otpVerified) {
            ResetCodeInfo info = resetCodes.get(search);
            if (info == null && resolvedEmail != null)
                info = resetCodes.get(resolvedEmail);
            if (info == null && !cleanPhone.isBlank())
                info = resetCodes.get(cleanPhone);

            if (info != null && !info.expiry().isBefore(LocalDateTime.now()) && info.code().equals(cleanCode)) {
                resetCodes.remove(search);
                if (resolvedEmail != null)
                    resetCodes.remove(resolvedEmail);
                if (!cleanPhone.isBlank())
                    resetCodes.remove(cleanPhone);
                otpVerified = true;
            }
        }

        if (!otpVerified) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Invalid or expired verification code. Please request a new OTP."));
        }

        String newPasswordHash = passwordSecurityService.hashPassword(newPassword.trim());
        boolean accountUpdated = false;
        String userName = "Zenve Vet Practitioner";
        String recipientEmail = null;
        DoctorProfile savedDoctor = null;

        // Update Doctor account
        Optional<DoctorProfile> docOpt = doctorRepo.findAll().stream()
                .filter(d -> (d.getEmail() != null && (d.getEmail().toLowerCase().equals(search)
                        || (resolvedEmail != null && d.getEmail().toLowerCase().equals(resolvedEmail))))
                        || (d.getPhone() != null && !cleanPhone.isBlank()
                                && d.getPhone().replaceAll("[^0-9]", "").contains(cleanPhone))
                        || (d.getName() != null && d.getName().toLowerCase().contains(search)))
                .findFirst();

        if (docOpt.isPresent()) {
            DoctorProfile doc = docOpt.get();
            doc.setPasswordHash(newPasswordHash);
            savedDoctor = doctorRepo.save(doc);
            tokenService.invalidateAllForDoctor(doc.getId());
            userName = doc.getName();
            recipientEmail = doc.getEmail();
            accountUpdated = true;
        }

        // Update Advertiser account if present
        var advOpt = advertiserRepo.findByBusinessEmailIgnoreCase(resolvedEmail != null ? resolvedEmail : search);
        if (advOpt.isPresent()) {
            var adv = advOpt.get();
            adv.setPassword(newPasswordHash);
            advertiserRepo.save(adv);
            if (!accountUpdated) {
                userName = adv.getFullName() != null ? adv.getFullName() : adv.getCompanyName();
                recipientEmail = adv.getBusinessEmail();
                accountUpdated = true;
            }
        }

        if (!accountUpdated) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Could not locate account records for " + search));
        }

        // Send confirmation email: "Your password has been changed" from
        // no-reply@zenvevet.com
        if (recipientEmail != null && !recipientEmail.isBlank()) {
            emailService.sendPasswordChangedSuccessEmail(recipientEmail, userName);
        }

        String token = (savedDoctor != null)
                ? tokenService.generateToken(savedDoctor.getId(), savedDoctor.getName(), savedDoctor.getEmail())
                : "";

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message",
                "Your password has been changed successfully! A confirmation notice has been sent to your email from no-reply@zenvevet.com.",
                "sender", "no-reply@zenvevet.com",
                "token", token));
    }

    @PostMapping("/send-login-otp")
    public ResponseEntity<?> sendLoginOtp(@RequestBody SendLoginOtpRequest req) {
        String rawPhone = req.effectivePhone();
        if (rawPhone.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Please enter your registered mobile number."));
        }

        String cleanPhone = rawPhone.replaceAll("[^0-9]", "");
        if (cleanPhone.length() < 8) {
            return ResponseEntity.badRequest().body(Map.of("message", "Please enter a valid mobile number."));
        }
        String last10 = cleanPhone.length() >= 10 ? cleanPhone.substring(cleanPhone.length() - 10) : cleanPhone;
        String e164 = TwilioVerifyService.toE164(rawPhone);

        Optional<DoctorProfile> docOpt = doctorRepo.findAll().stream()
                .filter(d -> d.getPhone() != null &&
                        (d.getPhone().replaceAll("[^0-9]", "").endsWith(last10) ||
                         (e164 != null && e164.equals(TwilioVerifyService.toE164(d.getPhone())))))
                .findFirst();

        if (docOpt.isEmpty() && !req.effectiveEmail().isBlank()) {
            docOpt = doctorRepo.findByEmailIgnoreCase(req.effectiveEmail().toLowerCase().trim());
        }

        if (docOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "No registered doctor account found with mobile ending in "
                            + last10.substring(Math.max(0, last10.length() - 4)) + ". Please check your number or register."));
        }

        DoctorProfile doc = docOpt.get();

        // 1. Send OTP to registered email if doctor has an email
        boolean emailSent = false;
        String emailOtpCode = null;
        if (doc.getEmail() != null && !doc.getEmail().isBlank()) {
            int randomCode = 100000 + new SecureRandom().nextInt(900000);
            emailOtpCode = String.valueOf(randomCode);
            String lowerEmail = doc.getEmail().toLowerCase().trim();

            ResetCodeInfo codeInfo = new ResetCodeInfo(emailOtpCode, LocalDateTime.now().plusMinutes(10), doc.getId());
            loginOtpCodes.put(lowerEmail, codeInfo);
            loginOtpCodes.put(cleanPhone, codeInfo);
            if (cleanPhone.length() >= 10) {
                loginOtpCodes.put(cleanPhone.substring(cleanPhone.length() - 10), codeInfo);
            }
            if (e164 != null) {
                loginOtpCodes.put(e164, codeInfo);
            }

            // Persist in otpRepo
            List<PasswordResetOtp> existingOtps = otpRepo.findAllByEmailIgnoreCase(lowerEmail);
            for (PasswordResetOtp otp : existingOtps) {
                if (!otp.isUsed()) {
                    otp.setUsed(true);
                }
            }
            otpRepo.saveAll(existingOtps);
            otpRepo.save(new PasswordResetOtp(lowerEmail, emailOtpCode, LocalDateTime.now().plusMinutes(10)));

            // Dispatch email
            emailService.sendLoginOtpEmail(lowerEmail, doc.getName(), emailOtpCode, 10);
            emailSent = true;
        }

        // 2. Send SMS via Twilio Verify
        TwilioVerifyService.SendOtpResult result = twilioVerifyService.sendOtp(rawPhone);
        if (!result.success() && !emailSent) {
            int status = "rate_limited".equals(result.status()) ? 429 : 400;
            return ResponseEntity.status(status).body(Map.of(
                    "success", false,
                    "message", result.message(),
                    "status", result.status(),
                    "retryAfterSeconds", result.retryAfterSeconds()
            ));
        }

        String phoneVal = result.phone() != null ? result.phone() : (e164 != null ? e164 : rawPhone);
        String maskedPhone = TwilioVerifyService.maskPhoneNumber(phoneVal);
        String maskedEmail = (doc.getEmail() != null && !doc.getEmail().isBlank()) ? maskEmail(doc.getEmail()) : "";

        StringBuilder msg = new StringBuilder();
        msg.append("A 6-digit login verification code has been dispatched via SMS to ").append(maskedPhone);
        if (emailSent && !maskedEmail.isBlank()) {
            msg.append(" and to your registered email ").append(maskedEmail);
        }

        Map<String, Object> responseMap = new java.util.LinkedHashMap<>();
        responseMap.put("success", true);
        responseMap.put("message", msg.toString());
        responseMap.put("doctorName", doc.getName());
        responseMap.put("phone", phoneVal);
        responseMap.put("registeredPhoneMasked", maskedPhone);
        responseMap.put("maskedPhone", maskedPhone);
        responseMap.put("smsSent", result.success());
        responseMap.put("emailSent", emailSent);
        responseMap.put("expiresInMinutes", 10);
        if (doc.getEmail() != null && !doc.getEmail().isBlank()) {
            responseMap.put("email", doc.getEmail());
            responseMap.put("maskedEmail", maskedEmail);
        }

        return ResponseEntity.ok(responseMap);
    }

    @PostMapping("/login-with-otp")
    public ResponseEntity<?> loginWithOtp(@RequestBody LoginWithOtpRequest req,
            jakarta.servlet.http.HttpServletRequest request) {
        if (req.phone() == null || req.code() == null || req.code().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Mobile number and 6-digit OTP code are required."));
        }

        String rawPhone = req.phone().trim();
        String cleanCode = req.code().trim();

        boolean verified = false;
        TwilioVerifyService.VerifyOtpResult verifyResult = twilioVerifyService.verifyOtp(rawPhone, cleanCode);
        if (verifyResult.success() && verifyResult.valid()) {
            verified = true;
        }

        if (!verified) {
            verified = checkEmailOrMemoryOtp(rawPhone, "", cleanCode);
        }

        if (!verified) {
            String errMessage = (verifyResult != null && !verifyResult.message().isBlank())
                    ? verifyResult.message()
                    : "Invalid or expired verification code. Please check your SMS or email and try again.";
            return ResponseEntity.badRequest()
                    .body(Map.of("message", errMessage, "status", "failed"));
        }

        String cleanPhone = rawPhone.replaceAll("[^0-9]", "");
        String last10 = cleanPhone.length() >= 10 ? cleanPhone.substring(cleanPhone.length() - 10) : cleanPhone;
        String e164 = TwilioVerifyService.toE164(rawPhone);

        Optional<DoctorProfile> profileOpt = doctorRepo.findAll().stream()
                .filter(d -> d.getPhone() != null &&
                        (d.getPhone().replaceAll("[^0-9]", "").endsWith(last10) ||
                         (e164 != null && e164.equals(TwilioVerifyService.toE164(d.getPhone())))))
                .findFirst();

        if (profileOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Doctor account not found for this mobile number."));
        }

        DoctorProfile profile = profileOpt.get();
        profile.setActive(true);
        DoctorProfile saved = doctorRepo.save(profile);

        String token = tokenService.generateToken(saved.getId(), saved.getName(), saved.getEmail());

        if (saved.getEmail() != null && !saved.getEmail().isBlank()) {
            deviceSecurityService.checkAndRecordDevice(saved.getEmail(), saved.getName(), "DOCTOR", saved.getId(),
                    request);
        }

        return ResponseEntity.ok(toAuthResponse(token, saved));
    }

    @PostMapping("/test-welcome-email")
    public ResponseEntity<?> testWelcomeEmail(
            @RequestParam(name = "to", defaultValue = "test@zenvevet.com") String to,
            @RequestParam(name = "name", defaultValue = "Dr. Partner") String name) {
        emailService.sendDoctorWelcomeEmail(to, name, "Veterinary Medicine");
        return ResponseEntity.ok(Map.of(
                "status", "DISPATCHED",
                "recipient", to,
                "sender", "no-reply@zenvevet.com",
                "message", "Welcome email queued for " + to + " from no-reply@zenvevet.com"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> getMe(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Missing authentication token"));
        }

        String token = authHeader.substring(7).trim();
        Long doctorId = tokenService.getDoctorIdFromToken(token);
        if (doctorId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "invalid token"));
        }

        Optional<DoctorProfile> profileOpt = doctorRepo.findById(doctorId);
        if (profileOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", "Doctor account not found"));
        }

        DoctorProfile profile = profileOpt.get();
        return ResponseEntity.ok(toAuthResponse(token, profile));
    }

    private AuthResponse toAuthResponse(String token, DoctorProfile p) {
        String refreshToken = tokenService.generateRefreshToken(p.getId(), "DOCTOR");
        return new AuthResponse(
                token,
                p.getId(),
                p.getName(),
                p.getEmail() != null ? p.getEmail() : "",
                p.getSpecialty() != null ? p.getSpecialty() : "",
                p.getQualification() != null ? p.getQualification() : "",
                p.getClinic() != null ? p.getClinic() : "",
                p.getCity() != null ? p.getCity() : "",
                p.getState() != null ? p.getState() : "",
                p.getAvatar() != null ? p.getAvatar() : "",
                p.getCoverImage() != null ? p.getCoverImage() : "",
                p.getBio() != null ? p.getBio() : "",
                p.getHeadline() != null ? p.getHeadline() : "",
                p.getPhone() != null ? p.getPhone() : "",
                p.getLicenseNumber() != null ? p.getLicenseNumber() : "",
                p.getExperienceYears(),
                p.isVerified(),
                p.getConnectionsCount(),
                p.getCasesCount(),
                p.isActive(),
                refreshToken);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            Long doctorId = tokenService.getDoctorIdFromToken(token);
            if (doctorId != null) {
                doctorRepo.findById(doctorId).ifPresent(doc -> {
                    doc.setActive(false);
                    doctorRepo.save(doc);
                });
                if (auditLogger != null) {
                    auditLogger.logSecurityEvent(
                            com.doctorvet.security.logging.SecurityAuditLogger.EventType.TOKEN_REVOKED,
                            "DOCTOR_" + doctorId, null, "Single device logout");
                }
            }
            tokenService.invalidateToken(token);
        }
        return ResponseEntity.ok(Map.of("message", "Successfully signed out"));
    }

    @PostMapping("/logout-all")
    public ResponseEntity<?> logoutAll(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            Long doctorId = tokenService.getDoctorIdFromToken(token);
            if (doctorId != null) {
                tokenService.invalidateAllForDoctor(doctorId);
                doctorRepo.findById(doctorId).ifPresent(doc -> {
                    doc.setActive(false);
                    doctorRepo.save(doc);
                });
                if (auditLogger != null) {
                    auditLogger.logSecurityEvent(
                            com.doctorvet.security.logging.SecurityAuditLogger.EventType.TOKEN_REVOKED,
                            "DOCTOR_" + doctorId, null, "All devices logout");
                }
            }
        }
        return ResponseEntity.ok(Map.of("message", "Successfully signed out of all devices"));
    }

    public record RefreshTokenRequest(String refreshToken) {
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refreshToken(@RequestBody RefreshTokenRequest req) {
        if (req == null || req.refreshToken() == null || req.refreshToken().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Bad Request", "message", "Refresh token is required"));
        }
        TokenService.RotationResult result = tokenService.rotateRefreshToken(req.refreshToken(), "", "");
        if (!result.success()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized", "message", result.errorMessage()));
        }
        return ResponseEntity.ok(Map.of(
                "token", result.newAccessToken(),
                "refreshToken", result.newRefreshToken(),
                "doctorId", result.doctorId(),
                "role", result.role()));
    }

    private String maskEmail(String email) {
        if (email == null || !email.contains("@"))
            return email;
        String[] parts = email.split("@");
        String name = parts[0];
        String domain = parts[1];
        if (name.length() <= 2) {
            return name.charAt(0) + "***@" + domain;
        }
        return name.charAt(0) + "***" + name.charAt(name.length() - 1) + "@" + domain;
    }

    private String maskPhoneNumber(String phone) {
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() < 4)
            return digits;
        String last4 = digits.substring(digits.length() - 4);
        return "+91 ******" + last4;
    }
}
