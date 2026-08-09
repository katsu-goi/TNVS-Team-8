-- V6: Document access security
-- Owner/department attribution for access control, plus the explicit
-- document_grants sharing table. Mirrors the JPA entity model so Flyway
-- (default profile) and Hibernate ddl-auto (test/supabase/local) stay in sync.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS department VARCHAR(100);

CREATE TABLE IF NOT EXISTS document_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    grantee_type VARCHAR(20) NOT NULL,
    grantee_key VARCHAR(100) NOT NULL,
    access_level VARCHAR(20) NOT NULL,
    reason VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    CONSTRAINT uk_document_grants_doc_grantee
        UNIQUE (document_id, grantee_type, grantee_key)
);

CREATE INDEX IF NOT EXISTS idx_document_grants_document ON document_grants(document_id);
