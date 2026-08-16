package com.photonicomega.facilities.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Encrypts AI provider API keys before they are persisted to Supabase.
 * <p>
 * Uses AES-256-GCM with a fresh 12-byte random IV per encryption and a 128-bit
 * authentication tag. The sealed value is stored as {@code base64(iv):base64(ciphertext)}
 * so the IV travels with the ciphertext and decryption never reuses an IV.
 * <p>
 * The 256-bit key is loaded from {@code app.ai.encryption-key}
 * ({@code AI_API_KEY_ENCRYPTION_KEY} env var) and is never hardcoded. Construction
 * fails fast when the key is missing or not a valid base64-encoded 32-byte key so a
 * misconfigured deployment cannot silently store keys in a way it cannot read back.
 */
@Service
public class ApiKeyEncryptionService {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;

    public ApiKeyEncryptionService(@Value("${app.ai.encryption-key:}") String base64Key) {
        byte[] decoded = decodeKey(base64Key);
        if (decoded.length != 32) {
            throw new IllegalStateException(
                    "app.ai.encryption-key (AI_API_KEY_ENCRYPTION_KEY) must be a base64-encoded 256-bit key (32 bytes), got " + decoded.length + " bytes");
        }
        this.key = new SecretKeySpec(decoded, "AES");
    }

    private static byte[] decodeKey(String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            throw new IllegalStateException(
                    "app.ai.encryption-key (AI_API_KEY_ENCRYPTION_KEY) is not configured. "
                            + "Set it to a base64-encoded 256-bit key before enabling AI provider persistence.");
        }
        try {
            return Base64.getDecoder().decode(base64Key.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("app.ai.encryption-key is not valid base64: " + e.getMessage(), e);
        }
    }

    /**
     * Encrypts a plaintext API key into {@code base64(iv):base64(ciphertext)}.
     * Returns {@code null} when the plaintext is null or blank (local engines
     * without keys are stored without encryption).
     */
    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(iv) + ":" + Base64.getEncoder().encodeToString(ciphertext);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt AI provider API key", e);
        }
    }

    /**
     * Decrypts a sealed value produced by {@link #encrypt(String)}. Throws on any
     * integrity violation (tampered ciphertext, wrong key, or malformed input).
     */
    public String decrypt(String sealed) {
        if (sealed == null || sealed.isBlank()) {
            return null;
        }
        try {
            String[] parts = sealed.split(":", 2);
            if (parts.length != 2) {
                throw new IllegalArgumentException("Malformed sealed API key (missing iv:ciphertext separator)");
            }
            byte[] iv = Base64.getDecoder().decode(parts[0]);
            byte[] ciphertext = Base64.getDecoder().decode(parts[1]);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt AI provider API key", e);
        }
    }
}