package com.photonicomega.facilities.ai.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Persisted AI provider registry entry. API keys are NEVER stored in plaintext:
 * {@code encryptedApiKey} holds the AES-256-GCM sealed value (base64(iv):base64(ciphertext))
 * produced by {@code ApiKeyEncryptionService}. The id is the same string provider id
 * used by the in-memory registry and referenced by {@code ai_module_config.provider_id}.
 */
@Entity
@Table(name = "ai_providers")
@Getter
@Setter
@NoArgsConstructor
public class AiProvider {

    @Id
    @Column(name = "id", length = 100)
    private String id;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "provider_type", nullable = false, length = 50)
    private String providerType;

    @Column(name = "default_model", length = 200)
    private String defaultModel;

    @Column(name = "encrypted_api_key", columnDefinition = "TEXT")
    private String encryptedApiKey;

    @Column(name = "base_url", length = 500)
    private String baseUrl;

    @Column(name = "endpoint", length = 500)
    private String endpoint;

    @Column(name = "capabilities", columnDefinition = "TEXT")
    private String capabilities;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "CONNECTED";

    @Column(name = "is_default", nullable = false)
    private boolean isDefault = false;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "is_deleted", nullable = false)
    private boolean deleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;
}