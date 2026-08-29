-- RBAC3: role hierarchy, symmetric administration metadata, and static SoD.

ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS dashboard_key VARCHAR(50);

CREATE TABLE IF NOT EXISTS role_hierarchy (
    senior_role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    junior_role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (senior_role_id, junior_role_id),
    CONSTRAINT chk_role_hierarchy_no_self CHECK (senior_role_id <> junior_role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_hierarchy_junior
    ON role_hierarchy(junior_role_id);

CREATE TABLE IF NOT EXISTS role_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    second_role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    CONSTRAINT chk_role_conflicts_no_self CHECK (first_role_id <> second_role_id),
    CONSTRAINT uq_role_conflict_pair UNIQUE (first_role_id, second_role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_conflicts_active
    ON role_conflicts(active, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_conflict_unordered_pair
    ON role_conflicts (
        (LEAST(first_role_id, second_role_id)),
        (GREATEST(first_role_id, second_role_id))
    )
    WHERE is_deleted = FALSE;
