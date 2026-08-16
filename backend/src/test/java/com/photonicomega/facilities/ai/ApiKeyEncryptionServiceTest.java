package com.photonicomega.facilities.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifies the AES-256-GCM API key encryption used before persisting AI provider
 * keys to Supabase: round-trip decrypt, unique IV per encryption, integrity
 * (tamper) detection, wrong-key rejection, and fail-fast on a missing/invalid key.
 */
class ApiKeyEncryptionServiceTest {

    private static final String KEY_A = "u7C3tz495/FDo8wghmVAvVZKBPzWFIlejhyXfGa06qg=";
    private static final String KEY_B = "0gJO/1CgH2x6PFDD+TKpAf0RNocLa+TFPT3LuIYWnyo=";

    @Test
    @DisplayName("Encrypted value decrypts back to the original plaintext")
    void roundTrip() {
        ApiKeyEncryptionService service = new ApiKeyEncryptionService(KEY_A);
        String plaintext = "sk-proj-abcdefghijklmnopqrstuvwxyz123456";
        String sealed = service.encrypt(plaintext);
        assertNotEquals(plaintext, sealed);
        assertEquals(plaintext, service.decrypt(sealed));
    }

    @Test
    @DisplayName("Same plaintext yields a different ciphertext each time (random IV)")
    void uniqueIvPerEncryption() {
        ApiKeyEncryptionService service = new ApiKeyEncryptionService(KEY_A);
        String plaintext = "sk-proj-repeat-me";
        assertNotEquals(service.encrypt(plaintext), service.encrypt(plaintext));
    }

    @Test
    @DisplayName("Tampered ciphertext fails decryption (GCM integrity check)")
    void tamperDetected() {
        ApiKeyEncryptionService service = new ApiKeyEncryptionService(KEY_A);
        String sealed = service.encrypt("sk-proj-tamper-me");
        String[] parts = sealed.split(":", 2);
        String iv = parts[0];
        String cipher = parts[1];
        String flipped = (cipher.charAt(0) == 'A' ? 'B' : 'A') + cipher.substring(1);
        assertThrows(RuntimeException.class, () -> service.decrypt(iv + ":" + flipped));
    }

    @Test
    @DisplayName("Decrypting with the wrong key fails")
    void wrongKeyRejected() {
        String sealed = new ApiKeyEncryptionService(KEY_A).encrypt("sk-proj-wrong-key");
        assertThrows(RuntimeException.class, () -> new ApiKeyEncryptionService(KEY_B).decrypt(sealed));
    }

    @Test
    @DisplayName("Missing or malformed encryption key fails fast at construction")
    void missingOrMalformedKeyRejected() {
        assertThrows(IllegalStateException.class, () -> new ApiKeyEncryptionService(""));
        assertThrows(IllegalStateException.class, () -> new ApiKeyEncryptionService("   "));
        // "QUJDRA==" decodes to 4 bytes, not 32 -> not AES-256.
        assertThrows(IllegalStateException.class, () -> new ApiKeyEncryptionService("QUJDRA=="));
        // Not valid base64 at all.
        assertThrows(IllegalStateException.class, () -> new ApiKeyEncryptionService("not-base64!!!"));
    }

    @Test
    @DisplayName("Null plaintext is returned as-is (no encryption attempt)")
    void nullPlaintextPassthrough() {
        ApiKeyEncryptionService service = new ApiKeyEncryptionService(KEY_A);
        assertNull(service.encrypt(null));
    }
}
