-- V4: Module Admin Scopes
-- Adds user_module_scopes join table for MODULE_ADMIN role

CREATE TABLE IF NOT EXISTS user_module_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_scopes_user_id ON user_module_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_scopes_module ON user_module_scopes(module);

-- Seed standard roles if they don't exist
INSERT INTO roles (name, display_name, description, is_system_role, created_at)
SELECT 'ADMIN', 'Administrator', 'System administrator with full access', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ADMIN');

INSERT INTO roles (name, display_name, description, is_system_role, created_at)
SELECT 'MODULE_ADMIN', 'Module Administrator', 'Administrator scoped to specific modules', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'MODULE_ADMIN');

INSERT INTO roles (name, display_name, description, is_system_role, created_at)
SELECT 'FACILITIES_STAFF', 'Facilities Staff', 'Facilities operations staff', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'FACILITIES_STAFF');

INSERT INTO roles (name, display_name, description, is_system_role, created_at)
SELECT 'FRONT_DESK', 'Front Desk', 'Front desk personnel', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'FRONT_DESK');

INSERT INTO roles (name, display_name, description, is_system_role, created_at)
SELECT 'RECORDS_OFFICER', 'Records Officer', 'Records and retention officer', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'RECORDS_OFFICER');

INSERT INTO roles (name, display_name, description, is_system_role, created_at)
SELECT 'LEGAL_OFFICER', 'Legal Officer', 'Legal management officer', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'LEGAL_OFFICER');

INSERT INTO roles (name, display_name, description, is_system_role, created_at)
SELECT 'EMPLOYEE', 'Employee', 'Standard employee', TRUE, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'EMPLOYEE');