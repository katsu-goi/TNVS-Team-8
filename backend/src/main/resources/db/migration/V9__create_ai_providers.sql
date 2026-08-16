-- V9: AI provider registry with encrypted API keys
-- Persists the AI provider registry (previously in-memory in AiStateManagementService)
-- so providers survive restarts. API keys are NEVER stored in plaintext:
-- encrypted_api_key holds a sealed AES-256-GCM value (base64(iv):base64(ciphertext))
-- produced by ApiKeyEncryptionService. The decryption key is supplied at runtime via
-- AI_API_KEY_ENCRYPTION_KEY and is never committed to source.
--
-- id is the same string provider id used by the in-memory registry and referenced by
-- ai_module_config.provider_id.

CREATE TABLE IF NOT EXISTS ai_providers (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    default_model VARCHAR(200),
    encrypted_api_key TEXT,
    base_url VARCHAR(500),
    endpoint VARCHAR(500),
    capabilities TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'CONNECTED',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_is_default
    ON ai_providers(is_default);