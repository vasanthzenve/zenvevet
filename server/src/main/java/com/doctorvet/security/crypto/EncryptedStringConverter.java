package com.doctorvet.security.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * JPA Attribute Converter for AES-256-GCM Envelope Encryption at Rest.
 * Automatically encrypts sensitive strings before persisting to MySQL database,
 * and decrypts upon retrieval into memory.
 */
@Converter
@Component
public class EncryptedStringConverter implements AttributeConverter<String, String> {

    private static KeyEncryptionService staticKeyEncryptionService;

    @Autowired
    public void setKeyEncryptionService(KeyEncryptionService service) {
        staticKeyEncryptionService = service;
    }

    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return attribute;
        }
        if (staticKeyEncryptionService != null) {
            return staticKeyEncryptionService.encryptEnvelope(attribute);
        }
        return attribute;
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isEmpty()) {
            return dbData;
        }
        if (staticKeyEncryptionService != null && dbData.startsWith("$env$v1$")) {
            return staticKeyEncryptionService.decryptEnvelope(dbData);
        }
        return dbData;
    }
}

