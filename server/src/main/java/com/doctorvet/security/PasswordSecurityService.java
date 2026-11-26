package com.doctorvet.security;

import com.doctorvet.security.crypto.Argon2SecurityService;
import org.springframework.stereotype.Service;

// Enterprise Password Security Service
// Integrates Argon2id memory-hard password hashing with legacy PBKDF2 compatibility,
// constant-time verification, and strict password complexity rules.
@Service
public class PasswordSecurityService {

    private final Argon2SecurityService argon2SecurityService;

    public PasswordSecurityService(Argon2SecurityService argon2SecurityService) {
        this.argon2SecurityService = argon2SecurityService;
    }

    // Hash a plaintext password using Argon2id format with 128-bit cryptographically secure salt.
    public String hashPassword(String password) {
        return argon2SecurityService.hashPassword(password);
    }

    // Verify a plaintext password against a stored hash using constant-time comparison.
    public boolean verifyPassword(String password, String storedHash) {
        return argon2SecurityService.verifyPassword(password, storedHash);
    }

    // Validate password complexity requirements: Minimum 8 chars, uppercase, lowercase, digit/symbol.
    public boolean isStrongPassword(String password) {
        if (password == null || password.length() < 8) {
            return false;
        }
        boolean hasUpper = false;
        boolean hasLower = false;
        boolean hasDigitOrSymbol = false;

        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) {
                hasUpper = true;
            } else if (Character.isLowerCase(c)) {
                hasLower = true;
            } else {
                hasDigitOrSymbol = true;
            }
        }
        return hasUpper && hasLower && hasDigitOrSymbol;
    }
}
