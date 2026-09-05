-- =============================================================
-- PDF role model foundation
-- =============================================================

insert into public.roles (name, display_name, description, dashboard_key, is_system_role, created_at)
values
  ('SYSTEM_ADMIN', 'System Administrator',
   'Administers infrastructure health, integrations, AI services, configuration, backups, and disaster recovery.',
   'system-admin', true, now()),
  ('COMPLIANCE_MANAGER', 'Compliance Manager',
   'Provides management oversight of compliance and records operations through audited read-only shadow sessions.',
   'compliance-manager', true, now())
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  dashboard_key = excluded.dashboard_key,
  is_system_role = true,
  is_deleted = false,
  updated_at = now();
insert into public.permissions (name, display_name, description, module, resource, action, created_at)
values
  ('USER_OVERSIGHT', 'User Oversight',
   'Review users and start audited read-only impersonation sessions.',
   'SYSTEM', 'USERS', 'MANAGE', now()),
  ('SYSTEM_ADMINISTER', 'Administer System Operations',
   'Manage infrastructure health, integrations, configuration, AI services, backups, and disaster recovery.',
   'SYSTEM', 'OPERATIONS', 'MANAGE', now()),
  ('COMPLIANCE_OVERSIGHT', 'Compliance Oversight',
   'Review compliance and records activity through audited read-only shadow sessions.',
   'COMPLIANCE', 'OVERSIGHT', 'READ', now())
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  is_deleted = false,
  updated_at = now();
insert into public.role_permissions (role_id, permission_id)
select role_row.id, permission_row.id
from (values
  ('SUPER_ADMIN', 'RBAC_ADMINISTER'),
  ('SUPER_ADMIN', 'USER_OVERSIGHT'),
  ('SYSTEM_ADMIN', 'SYSTEM_ADMINISTER'),
  ('SYSTEM_ADMIN', 'SECURITY_MONITOR'),
  ('COMPLIANCE_MANAGER', 'COMPLIANCE_OVERSIGHT')
) as grant_row(role_name, permission_name)
join public.roles role_row on role_row.name = grant_row.role_name
join public.permissions permission_row on permission_row.name = grant_row.permission_name
on conflict do nothing;
insert into public.role_conflicts (
  first_role_id, second_role_id, code, description, active, is_deleted, created_at
)
select first_role.id, second_role.id, conflict_row.code, conflict_row.description, true, false, now()
from (values
  ('DATA_PROTECTION_OFFICER', 'COMPLIANCE_OFFICER', 'SOD_PRIVACY_COMPLIANCE',
   'Privacy oversight and operational compliance approval must be assigned to different users.'),
  ('RECORDS_OFFICER', 'COMPLIANCE_OFFICER', 'SOD_RECORDS_COMPLIANCE',
   'Records custody and operational compliance approval must be assigned to different users.'),
  ('LEGAL_COUNSEL', 'RECORDS_OFFICER', 'SOD_LEGAL_RECORDS',
   'Legal approval and records custody must be assigned to different users.'),
  ('SECURITY_OFFICER', 'INFOSEC_OFFICER', 'SOD_PHYSICAL_INFOSEC',
   'Physical security and information-security oversight must be assigned to different users.'),
  ('DATA_PROTECTION_OFFICER', 'SECURITY_OFFICER', 'SOD_PRIVACY_SECURITY',
   'Privacy oversight and operational security must be assigned to different users.')
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
delete from public.user_roles user_role
using public.users app_user, public.roles role_row
where user_role.user_id = app_user.id
  and user_role.role_id = role_row.id
  and lower(app_user.email) = 'admin@photonicomega.com'
  and role_row.name = 'SUPER_ADMIN';
insert into public.user_roles (user_id, role_id)
select app_user.id, role_row.id
from public.users app_user
join public.roles role_row on role_row.name = 'SYSTEM_ADMIN'
where lower(app_user.email) = 'admin@photonicomega.com'
  and app_user.is_deleted = false
on conflict do nothing;
delete from public.user_roles user_role
using public.users app_user, public.roles role_row
where user_role.user_id = app_user.id
  and user_role.role_id = role_row.id
  and lower(app_user.email) = 'superadmin@photonicomega.com'
  and role_row.name = 'SYSTEM_ADMIN';
insert into public.user_roles (user_id, role_id)
select app_user.id, role_row.id
from public.users app_user
join public.roles role_row on role_row.name = 'SUPER_ADMIN'
where lower(app_user.email) = 'superadmin@photonicomega.com'
  and app_user.is_deleted = false
on conflict do nothing;
create table if not exists public.oversight_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users(id) on delete restrict,
  target_user_id uuid not null references public.users(id) on delete restrict,
  mode text not null,
  actor_role text not null,
  target_role_names text[] not null default '{}',
  justification text not null,
  read_only boolean not null default true,
  status text not null default 'ACTIVE',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_by uuid references public.users(id) on delete set null,
  source_ip varchar(45),
  user_agent varchar(500),
  constraint chk_oversight_distinct_users check (actor_user_id <> target_user_id),
  constraint chk_oversight_mode check (mode in ('IMPERSONATION', 'SHADOW')),
  constraint chk_oversight_status check (status in ('ACTIVE', 'ENDED', 'EXPIRED')),
  constraint chk_oversight_read_only check (read_only = true),
  constraint chk_oversight_duration check (
    expires_at > started_at and expires_at <= started_at + interval '30 minutes'
  ),
  constraint chk_oversight_justification check (length(btrim(justification)) >= 10)
);
create unique index if not exists uq_active_oversight_actor
  on public.oversight_sessions(actor_user_id)
  where status = 'ACTIVE';
create index if not exists idx_oversight_target_started
  on public.oversight_sessions(target_user_id, started_at desc);
create index if not exists idx_oversight_expiry
  on public.oversight_sessions(expires_at)
  where status = 'ACTIVE';
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  oversight_session_id uuid references public.oversight_sessions(id) on delete set null,
  action varchar(100) not null,
  entity_type varchar(100),
  entity_id varchar(100),
  details jsonb not null default '{}'::jsonb,
  source_ip varchar(45),
  user_agent varchar(500),
  occurred_at timestamptz not null default now()
);
create index if not exists idx_admin_audit_actor_time
  on public.admin_audit_logs(actor_user_id, occurred_at desc);
create index if not exists idx_admin_audit_target_time
  on public.admin_audit_logs(target_user_id, occurred_at desc);
create or replace function public.reject_immutable_audit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'admin audit logs are immutable';
end;
$$;
revoke all on function public.reject_immutable_audit_change() from public;
drop trigger if exists protect_admin_audit_logs on public.admin_audit_logs;
create trigger protect_admin_audit_logs
before update or delete on public.admin_audit_logs
for each row execute function public.reject_immutable_audit_change();
alter table public.oversight_sessions enable row level security;
alter table public.admin_audit_logs enable row level security;
do $$
declare
  table_name text;
  policy_row record;
begin
  foreach table_name in array array[
    'facilities', 'rooms', 'visitors', 'documents', 'contracts',
    'legal_cases', 'security_logs', 'active_sessions', 'blocked_ips',
    'security_alerts', 'ip_threats', 'maintenance_schedules',
    'reservations', 'users', 'roles', 'permissions', 'user_roles',
    'role_permissions', 'role_hierarchy', 'role_conflicts',
    'refresh_tokens', 'audit_logs', 'hr_assistance_requests',
    'oversight_sessions', 'admin_audit_logs'
  ] loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);

    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name);
    end loop;
  end loop;
end $$;
do $$
declare
  table_name text;
begin
  if to_regprocedure('public.emit_realtime_event()') is null then
    return;
  end if;

  foreach table_name in array array['oversight_sessions'] loop
    execute format('drop trigger if exists emit_realtime_event on public.%I', table_name);
    execute format(
      'create trigger emit_realtime_event after insert or update or delete on public.%I for each row execute function public.emit_realtime_event()',
      table_name
    );
  end loop;
end $$;
delete from public.role_hierarchy hierarchy
using public.roles senior, public.roles junior
where hierarchy.senior_role_id = senior.id
  and hierarchy.junior_role_id = junior.id
  and (senior.name, junior.name) in (
    ('DATA_PROTECTION_OFFICER', 'COMPLIANCE_OFFICER'),
    ('RECORDS_OFFICER', 'COMPLIANCE_OFFICER')
  );
insert into public.role_hierarchy (senior_role_id, junior_role_id)
select senior.id, junior.id
from (values
  ('FACILITIES_MANAGER', 'FACILITIES_OFFICER'),
  ('LEGAL_COUNSEL', 'LEGAL_OFFICER'),
  ('DEPARTMENT_HEAD', 'EMPLOYEE'),
  ('SECURITY_OFFICER', 'EMPLOYEE'),
  ('INFOSEC_OFFICER', 'EMPLOYEE')
) as hierarchy_row(senior_name, junior_name)
join public.roles senior on senior.name = hierarchy_row.senior_name
join public.roles junior on junior.name = hierarchy_row.junior_name
on conflict do nothing;
