package com.photonicomega.facilities.ai;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.Set;

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

    /**
     * The keys that are committed to this repository, and are therefore public.
     *
     * <p>One belongs to the {@code test} profile and one to {@code dev}. Both exist so
     * that the suite and a fresh clone need no environment variables, and neither
     * protects anything: the value is in version control, in a public-shaped string
     * that reads exactly like a real key. The realistic accident is not that somebody
     * ships {@code application.yml} to production - it is that somebody setting up a
     * deployment needs a value for {@code AI_API_KEY_ENCRYPTION_KEY}, finds one in the
     * repo, and uses it. A length check cannot catch that, because these are perfectly
     * valid 256-bit keys. Listing them here is what turns "convenient in development"
     * back into "impossible in production".
     */
    private static final Set<String> PUBLISHED_KEYS = Set.of(
            "u7C3tz495/FDo8wghmVAvVZKBPzWFIlejhyXfGa06qg=",  // test profile
            "0tJRq8HSlEH5Ddjv5Y+bjObw/AWl9DTY0yjyoFiNrYw="); // dev profile

    /** Profiles that are allowed to use a {@link #PUBLISHED_KEYS} value. */
    private static final Set<String> DEVELOPMENT_PROFILES = Set.of("dev", "test");

    private final SecretKeySpec key;

    /** Pure crypto constructor: takes the key it is told to use and asks no questions. */
    public ApiKeyEncryptionService(String base64Key) {
        byte[] decoded = decodeKey(base64Key);
        if (decoded.length != 32) {
            throw new IllegalStateException(
                    "app.ai.encryption-key (AI_API_KEY_ENCRYPTION_KEY) must be a base64-encoded 256-bit key (32 bytes), got " + decoded.length + " bytes");
        }
        this.key = new SecretKeySpec(decoded, "AES");
    }

    /**
     * The constructor Spring uses. Adds the one question the pure one cannot ask:
     * whether this key is allowed to be in use under the profiles that are active.
     */
    @Autowired
    public ApiKeyEncryptionService(@Value("${app.ai.encryption-key:}") String base64Key, Environment environment) {
        this(refusePublishedKeyOutsideDevelopment(base64Key, environment));
    }

    private static String refusePublishedKeyOutsideDevelopment(String base64Key, Environment environment) {
        if (base64Key == null || !PUBLISHED_KEYS.contains(base64Key.trim())) {
            return base64Key;
        }
        Set<String> active = new LinkedHashSet<>(Arrays.asList(environment.getActiveProfiles()));
        // No active profile is treated as not-development on purpose. `application.yml`
        // defaults SPRING_PROFILES_ACTIVE to `dev`, so the empty case is not something a
        // developer runs into; it is what a stripped-down or programmatic context looks
        // like, and guessing "probably development" there is the wrong way to be wrong.
        if (active.stream().anyMatch(DEVELOPMENT_PROFILES::contains)) {
            return base64Key;
        }
        throw new IllegalStateException(
                "app.ai.encryption-key is one of the published keys committed to this repository "
                        + "for the dev and test profiles, and the active profile"
                        + (active.isEmpty() ? " set is empty" : "s are " + active)
                        + " - so this is a deployment. A published key means every stored AI provider "
                        + "API key can be decrypted by anyone who can read the source. Generate a new "
                        + "one and supply it as AI_API_KEY_ENCRYPTION_KEY: "
                        + "openssl rand -base64 32");
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