-- Supabase mirror of the Spring/Flyway RBAC3 schema and policy seed.

alter table public.roles
  add column if not exists dashboard_key varchar(50);

create table if not exists public.role_hierarchy (
  senior_role_id uuid not null references public.roles(id) on delete cascade,
  junior_role_id uuid not null references public.roles(id) on delete cascade,
  primary key (senior_role_id, junior_role_id),
  constraint chk_role_hierarchy_no_self check (senior_role_id <> junior_role_id)
);

create index if not exists idx_role_hierarchy_junior
  on public.role_hierarchy(junior_role_id);

create table if not exists public.role_conflicts (
  id uuid primary key default gen_random_uuid(),
  first_role_id uuid not null references public.roles(id) on delete cascade,
  second_role_id uuid not null references public.roles(id) on delete cascade,
  code varchar(100) not null unique,
  description varchar(500),
  active boolean not null default true,
  is_deleted boolean not null default false,
  deleted_at timestamp,
  deleted_by varchar(255),
  created_at timestamp not null default now(),
  updated_at timestamp,
  created_by varchar(255),
  updated_by varchar(255),
  constraint chk_role_conflicts_no_self check (first_role_id <> second_role_id),
  constraint uq_role_conflict_pair unique (first_role_id, second_role_id)
);

create index if not exists idx_role_conflicts_active
  on public.role_conflicts(active, is_deleted);

create unique index if not exists uq_role_conflict_unordered_pair
  on public.role_conflicts (
    (least(first_role_id, second_role_id)),
    (greatest(first_role_id, second_role_id))
  )
  where is_deleted = false;

insert into public.roles (name, display_name, description, dashboard_key, is_system_role, created_at)
values
  ('SUPER_ADMIN', 'Super Administrator', 'Administers users, roles, permissions, hierarchy, and constraints.', 'admin', true, now()),
  ('FACILITIES_MANAGER', 'Facilities Manager', 'Manages facilities and inherits facilities officer capabilities.', 'facilities', true, now()),
  ('FACILITIES_OFFICER', 'Facilities Officer', 'Handles day-to-day facilities operations.', 'facilities-officer', true, now()),
  ('COMPLIANCE_OFFICER', 'Compliance Officer', 'Manages compliance and records operations.', 'compliance', true, now()),
  ('LEGAL_OFFICER', 'Legal Officer', 'Manages legal operations and reviews.', 'legal', true, now()),
  ('CONTRACT_OFFICER', 'Contract Officer', 'Manages contracts and procurement.', 'procurement', true, now()),
  ('EMPLOYEE', 'Employee', 'Uses employee self-service features.', 'employee', true, now()),
  ('DATA_PROTECTION_OFFICER', 'Data Protection Officer', 'Oversees privacy, data protection, and compliance.', 'privacy', true, now()),
  ('LEGAL_COUNSEL', 'Legal Counsel', 'Provides legal advice and inherits legal officer capabilities.', 'counsel', true, now()),
  ('RECORDS_OFFICER', 'Records Officer', 'Manages records, retention, and controlled disposal.', 'records', true, now()),
  ('DEPARTMENT_HEAD', 'Department Head', 'Reviews departmental activity and approvals.', 'department', true, now()),
  ('SECURITY_OFFICER', 'Security Officer', 'Monitors physical and operational security.', 'security', true, now()),
  ('INFOSEC_OFFICER', 'Information Security Officer', 'Oversees information-security risk and controls.', 'infosec', true, now())
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  dashboard_key = excluded.dashboard_key,
  is_system_role = true,
  updated_at = now();

insert into public.permissions (name, display_name, description, module, resource, action, created_at)
values
  ('RBAC_ADMINISTER', 'Administer RBAC', 'Assign and revoke roles and permissions, hierarchy, and SoD constraints.', 'SYSTEM', 'RBAC', 'MANAGE', now()),
  ('PRIVACY_OVERSIGHT', 'Privacy Oversight', 'Review privacy, data-protection, and compliance controls.', 'PRIVACY', '*', 'MANAGE', now()),
  ('LEGAL_COUNSEL_OPERATIONS', 'Legal Counsel Operations', 'Review legal matters and provide counsel.', 'LEGAL', 'COUNSEL', 'MANAGE', now()),
  ('RECORDS_MANAGE', 'Records Management', 'Manage records, retention, and disposal workflows.', 'RECORDS', '*', 'MANAGE', now()),
  ('DEPARTMENT_APPROVE', 'Department Approval', 'Review and approve department-level requests.', 'DEPARTMENT', '*', 'APPROVE', now()),
  ('SECURITY_MONITOR', 'Security Monitoring', 'Read security events, sessions, and alerts.', 'SECURITY', '*', 'READ', now()),
  ('INFOSEC_MANAGE', 'Information Security Management', 'Manage information-security risks and controls.', 'SECURITY', 'INFOSEC', 'MANAGE', now())
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select role_row.id, permission_row.id
from (values
  ('SUPER_ADMIN', 'RBAC_ADMINISTER'),
  ('DATA_PROTECTION_OFFICER', 'PRIVACY_OVERSIGHT'),
  ('LEGAL_COUNSEL', 'LEGAL_COUNSEL_OPERATIONS'),
  ('RECORDS_OFFICER', 'RECORDS_MANAGE'),
  ('DEPARTMENT_HEAD', 'DEPARTMENT_APPROVE'),
  ('SECURITY_OFFICER', 'SECURITY_MONITOR'),
  ('INFOSEC_OFFICER', 'SECURITY_MONITOR'),
  ('INFOSEC_OFFICER', 'INFOSEC_MANAGE')
) as grant_row(role_name, permission_name)
join public.roles role_row on role_row.name = grant_row.role_name
join public.permissions permission_row on permission_row.name = grant_row.permission_name
on conflict do nothing;

insert into public.role_hierarchy (senior_role_id, junior_role_id)
select senior.id, junior.id
from (values
  ('FACILITIES_MANAGER', 'FACILITIES_OFFICER'),
  ('DATA_PROTECTION_OFFICER', 'COMPLIANCE_OFFICER'),
  ('LEGAL_COUNSEL', 'LEGAL_OFFICER'),
  ('RECORDS_OFFICER', 'COMPLIANCE_OFFICER'),
  ('DEPARTMENT_HEAD', 'EMPLOYEE'),
  ('SECURITY_OFFICER', 'EMPLOYEE'),
  ('INFOSEC_OFFICER', 'EMPLOYEE')
) as hierarchy_row(senior_name, junior_name)
join public.roles senior on senior.name = hierarchy_row.senior_name
join public.roles junior on junior.name = hierarchy_row.junior_name
on conflict do nothing;

insert into public.role_conflicts (first_role_id, second_role_id, code, description, active, created_at)
select first_role.id, second_role.id, conflict_row.code, conflict_row.description, true, now()
from (values
  ('DATA_PROTECTION_OFFICER', 'SECURITY_OFFICER', 'SOD_PRIVACY_SECURITY', 'Privacy oversight and operational security must be assigned to different users.'),
  ('LEGAL_COUNSEL', 'RECORDS_OFFICER', 'SOD_LEGAL_RECORDS', 'Legal counsel and records custody must be assigned to different users.'),
  ('SECURITY_OFFICER', 'INFOSEC_OFFICER', 'SOD_PHYSICAL_INFOSEC', 'Physical security and information-security oversight must be assigned to different users.')
) as conflict_row(first_name, second_name, code, description)
join public.roles first_role on first_role.name = conflict_row.first_name
join public.roles second_role on second_role.name = conflict_row.second_name
on conflict (code) do update set
  first_role_id = excluded.first_role_id,
  second_role_id = excluded.second_role_id,
  description = excluded.description,
  active = true,
  is_deleted = false,
  updated_at = now();

alter table public.role_hierarchy enable row level security;
alter table public.role_conflicts enable row level security;
