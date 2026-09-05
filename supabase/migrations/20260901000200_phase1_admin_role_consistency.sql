-- Phase 1 authority decision:
--   machine role: SUPER_ADMIN
--   human-facing title: System Administrator
-- SYSTEM_ADMIN was never part of the authoritative role seed. If a historical
-- database contains it, consolidate assignments into SUPER_ADMIN and retire
-- the alias without deleting its audit history.

insert into public.roles (
  name, display_name, description, dashboard_key, is_system_role, created_at
)
values (
  'SUPER_ADMIN',
  'System Administrator',
  'Administers system accounts, RBAC, security monitoring, integrations, AI configuration, backup status, audit, and system health.',
  'admin',
  true,
  now()
)
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  dashboard_key = excluded.dashboard_key,
  is_system_role = true,
  is_deleted = false,
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

-- Revoke refresh sessions for users whose legacy role is being consolidated;
-- their next login issues a token containing the canonical authority.
update public.refresh_tokens token
set is_revoked = true,
    revoked_at = coalesce(token.revoked_at, now())
where token.is_revoked = false
  and token.user_id in (
    select user_role.user_id
    from public.user_roles user_role
    join public.roles legacy on legacy.id = user_role.role_id
    where legacy.name = 'SYSTEM_ADMIN'
  );

insert into public.user_roles (user_id, role_id)
select user_role.user_id, canonical.id
from public.user_roles user_role
join public.roles legacy on legacy.id = user_role.role_id
join public.roles canonical on canonical.name = 'SUPER_ADMIN'
where legacy.name = 'SYSTEM_ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select canonical.id, permission_link.permission_id
from public.role_permissions permission_link
join public.roles legacy on legacy.id = permission_link.role_id
join public.roles canonical on canonical.name = 'SUPER_ADMIN'
where legacy.name = 'SYSTEM_ADMIN'
on conflict do nothing;

with role_ids as (
  select legacy.id legacy_id, canonical.id canonical_id
  from public.roles legacy
  join public.roles canonical on canonical.name = 'SUPER_ADMIN'
  where legacy.name = 'SYSTEM_ADMIN'
), remapped as (
  select distinct
    case when hierarchy.senior_role_id = role_ids.legacy_id
      then role_ids.canonical_id else hierarchy.senior_role_id end senior_role_id,
    case when hierarchy.junior_role_id = role_ids.legacy_id
      then role_ids.canonical_id else hierarchy.junior_role_id end junior_role_id
  from public.role_hierarchy hierarchy
  cross join role_ids
  where hierarchy.senior_role_id = role_ids.legacy_id
     or hierarchy.junior_role_id = role_ids.legacy_id
)
insert into public.role_hierarchy (senior_role_id, junior_role_id)
select senior_role_id, junior_role_id
from remapped
where senior_role_id <> junior_role_id
on conflict do nothing;

delete from public.role_hierarchy hierarchy
using public.roles legacy
where legacy.name = 'SYSTEM_ADMIN'
  and (hierarchy.senior_role_id = legacy.id or hierarchy.junior_role_id = legacy.id);

delete from public.user_roles user_role
using public.roles legacy
where legacy.name = 'SYSTEM_ADMIN'
  and user_role.role_id = legacy.id;

delete from public.role_permissions permission_link
using public.roles legacy
where legacy.name = 'SYSTEM_ADMIN'
  and permission_link.role_id = legacy.id;

update public.role_conflicts conflict
set active = false,
    is_deleted = true,
    deleted_at = coalesce(conflict.deleted_at, now()),
    deleted_by = coalesce(conflict.deleted_by, 'PHASE1_ROLE_CONSOLIDATION'),
    updated_at = now()
from public.roles legacy
where legacy.name = 'SYSTEM_ADMIN'
  and (conflict.first_role_id = legacy.id or conflict.second_role_id = legacy.id);

update public.roles
set display_name = 'Retired SYSTEM_ADMIN alias',
    description = 'Retired by Phase 1 role consolidation; use SUPER_ADMIN.',
    dashboard_key = null,
    is_system_role = false,
    is_deleted = true,
    deleted_at = coalesce(deleted_at, now()),
    deleted_by = coalesce(deleted_by, 'PHASE1_ROLE_CONSOLIDATION'),
    updated_at = now()
where name = 'SYSTEM_ADMIN';
