-- PDF P0 RBAC parity: split Super/System administration, add Compliance Manager,
-- repair role hierarchy, and enforce the required static separation of duties.

INSERT INTO roles (name, display_name, description, dashboard_key, is_system_role, created_at)
VALUES
    ('SYSTEM_ADMIN', 'System Administrator',
     'Administers system health, backups, integrations, AI configuration, and platform operations.',
     'system-admin', TRUE, NOW()),
    ('COMPLIANCE_MANAGER', 'Compliance Manager',
     'Oversees compliance operations, subordinate review, and management approvals.',
     'compliance-manager', TRUE, NOW())
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    dashboard_key = EXCLUDED.dashboard_key,
    is_system_role = TRUE,
    updated_at = NOW();

UPDATE roles
SET description = 'Handles day-to-day compliance monitoring and evidence workflows.',
    dashboard_key = 'compliance',
    updated_at = NOW()
WHERE name = 'COMPLIANCE_OFFICER';

INSERT INTO permissions (name, display_name, description, module, resource, action, created_at)
VALUES
    ('SYSTEM_ADMINISTER', 'Administer System Operations',
     'Manage platform health, backups, integrations, AI configuration, and system operations.',
     'SYSTEM', 'OPERATIONS', 'MANAGE', NOW()),
    ('USER_OVERSIGHT', 'User Oversight',
     'Review users and start audited read-only impersonation sessions.',
     'SYSTEM', 'USERS', 'MANAGE', NOW()),
    ('COMPLIANCE_OVERSIGHT', 'Compliance Oversight',
     'Review compliance and records activity through audited read-only shadow sessions.',
     'COMPLIANCE', 'OVERSIGHT', 'READ', NOW())
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    updated_at = NOW();

INSERT INTO role_permissions (role_id, permission_id)
SELECT role_row.id, permission_row.id
FROM (VALUES
    ('SYSTEM_ADMIN', 'SYSTEM_ADMINISTER'),
    ('SUPER_ADMIN', 'USER_OVERSIGHT'),
    ('COMPLIANCE_MANAGER', 'COMPLIANCE_OVERSIGHT')
) AS grant_row(role_name, permission_name)
JOIN roles role_row ON role_row.name = grant_row.role_name
JOIN permissions permission_row ON permission_row.name = grant_row.permission_name
ON CONFLICT DO NOTHING;

DELETE FROM role_hierarchy hierarchy
USING roles senior, roles junior
WHERE hierarchy.senior_role_id = senior.id
  AND hierarchy.junior_role_id = junior.id
  AND (
      (senior.name = 'DATA_PROTECTION_OFFICER' AND junior.name = 'COMPLIANCE_OFFICER')
      OR
      (senior.name = 'RECORDS_OFFICER' AND junior.name = 'COMPLIANCE_OFFICER')
  );

INSERT INTO role_conflicts (
    first_role_id,
    second_role_id,
    code,
    description,
    active,
    is_deleted,
    created_at
)
SELECT first_role.id,
       second_role.id,
       conflict_row.code,
       conflict_row.description,
       TRUE,
       FALSE,
       NOW()
FROM (VALUES
    ('DATA_PROTECTION_OFFICER', 'SECURITY_OFFICER', 'SOD_PRIVACY_SECURITY',
     'Privacy oversight and operational security must be assigned to different users.'),
    ('DATA_PROTECTION_OFFICER', 'COMPLIANCE_OFFICER', 'SOD_PRIVACY_COMPLIANCE',
     'Privacy oversight and compliance execution must be assigned to different users.'),
    ('RECORDS_OFFICER', 'COMPLIANCE_OFFICER', 'SOD_RECORDS_COMPLIANCE',
     'Records custody and compliance execution must be assigned to different users.'),
    ('LEGAL_COUNSEL', 'RECORDS_OFFICER', 'SOD_LEGAL_RECORDS',
     'Legal counsel and records custody must be assigned to different users.'),
    ('SECURITY_OFFICER', 'INFOSEC_OFFICER', 'SOD_PHYSICAL_INFOSEC',
     'Physical security and information-security oversight must be assigned to different users.')
) AS conflict_row(first_name, second_name, code, description)
JOIN roles first_role ON first_role.name = conflict_row.first_name
JOIN roles second_role ON second_role.name = conflict_row.second_name
ON CONFLICT (code) DO UPDATE SET
    first_role_id = EXCLUDED.first_role_id,
    second_role_id = EXCLUDED.second_role_id,
    description = EXCLUDED.description,
    active = TRUE,
    is_deleted = FALSE,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW();

DELETE FROM user_roles assignment
USING users user_row, roles role_row
WHERE assignment.user_id = user_row.id
  AND assignment.role_id = role_row.id
  AND LOWER(user_row.email) = 'admin@photonicomega.com'
  AND role_row.name = 'SUPER_ADMIN';

INSERT INTO user_roles (user_id, role_id)
SELECT user_row.id, role_row.id
FROM users user_row
JOIN roles role_row ON role_row.name = 'SYSTEM_ADMIN'
WHERE LOWER(user_row.email) = 'admin@photonicomega.com'
  AND user_row.is_deleted = FALSE
ON CONFLICT DO NOTHING;
