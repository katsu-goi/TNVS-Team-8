-- V8: Per-module AI configuration
-- Persists the AI model assignment for each AI module (module key -> provider/model),
-- execution mode, enabled features, and fallback model. Providers themselves remain
-- in-memory in AiStateManagementService; this table stores only the per-module binding
-- so the DB is the source of truth for which model each module executes with.

CREATE TABLE IF NOT EXISTS ai_module_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key VARCHAR(100) NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    provider_id VARCHAR(100),
    model VARCHAR(200),
    fallback_model VARCHAR(200),
    execution_mode VARCHAR(20) NOT NULL DEFAULT 'REALTIME',
    features TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_ai_module_config_module_key
    ON ai_module_config(module_key);