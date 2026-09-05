-- Canonical role identities and assigned-role workspace boundaries.

insert into public.roles (name, display_name, description, dashboard_key, is_system_role, created_at)
values
  ('SYSTEM_ADMIN', 'System Administrator',
   'Operates infrastructure health, backups, integrations, AI services, and system configuration.',
   'system-admin', true, now()),
  ('COMPLIANCE_MANAGER', 'Compliance Manager',
   'Supervises compliance operations, management sign-offs, incidents, and audited subordinate shadow sessions.',
   'compliance-manager', true, now()),
  ('LEGAL_OFFICER', 'Legal Officer',
   'Drafts contracts, manages legal cases and notices, and submits work for Legal Counsel approval.',
   'legal', true, now())
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  dashboard_key = excluded.dashboard_key,
  is_system_role = true,
  is_deleted = false,
  updated_at = now();
do $$
declare
  legacy_admin_id uuid;
  canonical_admin_id uuid;
begin
  select id into legacy_admin_id
  from public.users
  where lower(email) = 'admin@photonicomega.com' and is_deleted = false
  limit 1;

  select id into canonical_admin_id
  from public.users
  where lower(email) = 'systemadmin@photonicomega.com' and is_deleted = false
  limit 1;

  if canonical_admin_id is null and legacy_admin_id is not null then
    update public.users
    set email = 'systemadmin@photonicomega.com',
        first_name = 'System',
        last_name = 'Administrator',
        department = 'Information Technology',
        position = 'System Administrator',
        updated_at = now()
    where id = legacy_admin_id;
    canonical_admin_id := legacy_admin_id;
  elsif canonical_admin_id is not null and legacy_admin_id is not null then
    update public.users
    set status = 'INACTIVE',
        is_deleted = true,
        deleted_at = now(),
        deleted_by = '00013_canonical_admin_and_role_accounts'
    where id = legacy_admin_id;
  end if;

  if canonical_admin_id is not null then
    delete from public.user_roles where user_id = canonical_admin_id;
    insert into public.user_roles (user_id, role_id)
    select canonical_admin_id, role_row.id
    from public.roles role_row
    where role_row.name = 'SYSTEM_ADMIN'
    on conflict do nothing;
  end if;
end $$;
insert into public.users (
  employee_id, first_name, last_name, email, password_hash,
  department, position, status, is_email_verified, is_deleted, created_at
)
values
  ('EMP-CM-001', 'Compliance', 'Manager', 'compliance.manager@photonicomega.com',
   '$2b$12$bdNOe1poWmhyyoMG1Mh6Geb.pD0dDcpMSEtiu1EPykKwel/pH82BG',
   'Compliance', 'Compliance Manager', 'ACTIVE', true, false, now()),
  ('EMP-LO-001', 'Legal', 'Officer', 'legal.officer@photonicomega.com',
   '$2b$12$tE5YQ1CqstUymMeFRf/l6u5QQByuJV3Qq7FznN.6Y8y6PyZ.Obkla',
   'Legal', 'Legal Officer', 'ACTIVE', true, false, now())
on conflict (email) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  password_hash = excluded.password_hash,
  department = excluded.department,
  position = excluded.position,
  status = 'ACTIVE',
  is_email_verified = true,
  is_deleted = false,
  deleted_at = null,
  deleted_by = null,
  failed_login_attempts = 0,
  locked_until = null,
  updated_at = now();
delete from public.user_roles user_role
using public.users app_user
where user_role.user_id = app_user.id
  and lower(app_user.email) in (
    'superadmin@photonicomega.com',
    'compliance.manager@photonicomega.com',
    'legal.officer@photonicomega.com'
  );
insert into public.user_roles (user_id, role_id)
select app_user.id, role_row.id
from (values
  ('superadmin@photonicomega.com', 'SUPER_ADMIN'),
  ('compliance.manager@photonicomega.com', 'COMPLIANCE_MANAGER'),
  ('legal.officer@photonicomega.com', 'LEGAL_OFFICER')
) as assignment(email, role_name)
join public.users app_user on lower(app_user.email) = assignment.email
join public.roles role_row on role_row.name = assignment.role_name
where app_user.is_deleted = false
on conflict do nothing;
insert into public.role_hierarchy (senior_role_id, junior_role_id)
select senior.id, junior.id
from public.roles senior
cross join public.roles junior
where senior.name = 'DEPARTMENT_HEAD'
  and junior.name = 'COMPLIANCE_MANAGER'
on conflict do nothing;
delete from public.refresh_tokens refresh_token
using public.users app_user
where refresh_token.user_id = app_user.id
  and lower(app_user.email) in (
    'systemadmin@photonicomega.com',
    'superadmin@photonicomega.com',
    'compliance.manager@photonicomega.com',
    'legal.officer@photonicomega.com'
  );
