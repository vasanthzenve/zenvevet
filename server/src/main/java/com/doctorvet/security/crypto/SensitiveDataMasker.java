package com.doctorvet.security.crypto;

/**
 * Enterprise Sensitive Data Masker
 * Masks API keys, JWT tokens, passwords, credit card numbers, and PII in application logs and responses.
 */
public final class SensitiveDataMasker {

    private SensitiveDataMasker() {}

    /**
     * Mask an API key (e.g. "zenve_adv_live_1234567890abcdef" -> "zenve_adv_***_cdef")
     */
    public static String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) return "[EMPTY]";
        if (apiKey.length() <= 8) return "***";
        String prefix = apiKey.substring(0, Math.min(10, apiKey.length() - 4));
        String suffix = apiKey.substring(apiKey.length() - 4);
        return prefix + "***" + suffix;
    }

    /**
     * Mask a Bearer token (e.g. "zenve_eyJhbGci...abcd" -> "zenve_***_abcd")
     */
    public static String maskToken(String token) {
        if (token == null || token.isBlank()) return "[EMPTY]";
        if (token.length() <= 8) return "***";
        return token.substring(0, 6) + "***" + token.substring(token.length() - 4);
    }

    /**
     * Mask an email address (e.g. "vasanth.doctor@zenvevet.com" -> "v***r@zenvevet.com")
     */
    public static String maskEmail(String email) {
        if (email == null || email.isBlank() || !email.contains("@")) return "[INVALID_EMAIL]";
        int atIndex = email.indexOf('@');
        String local = email.substring(0, atIndex);
        String domain = email.substring(atIndex);
        if (local.length() <= 2) {
            return local.charAt(0) + "***" + domain;
        }
        return local.charAt(0) + "***" + local.charAt(local.length() - 1) + domain;
    }

    /**
     * Mask a phone number (e.g. "+919876543210" -> "+91******3210")
     */
    public static String maskPhone(String phone) {
        if (phone == null || phone.isBlank()) return "[EMPTY]";
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() < 4) return "***";
        String lastFour = digits.substring(digits.length() - 4);
        return "******" + lastFour;
    }

    /**
     * Mask a credit card or account number (e.g. "4111111111111234" -> "************1234")
     */
    public static String maskCardNumber(String cardNumber) {
        if (cardNumber == null || cardNumber.isBlank()) return "[EMPTY]";
        String digits = cardNumber.replaceAll("[^0-9]", "");
        if (digits.length() < 4) return "****";
        return "****-****-****-" + digits.substring(digits.length() - 4);
    }
}

