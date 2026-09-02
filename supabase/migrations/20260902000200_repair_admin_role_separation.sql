-- Repair the canonical administrator accounts after role bootstrap drift.
-- The account identities are intentionally exclusive: systemadmin is never a
-- SUPER_ADMIN and superadmin is never a SYSTEM_ADMIN.

insert into public.roles (
  name, display_name, description, dashboard_key, is_system_role, created_at
)
values (
  'SYSTEM_ADMIN',
  'System Administrator',
  'Operates infrastructure health, backups, integrations, AI services, and system configuration.',
  'system-admin',
  true,
  now()
)
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  dashboard_key = excluded.dashboard_key,
  is_system_role = true,
  is_deleted = false,
  updated_at = now();

do $$
declare
  system_admin_id uuid;
  legacy_admin_id uuid;
begin
  select id
    into system_admin_id
  from public.users
  where lower(email) = 'systemadmin@photonicomega.com'
    and is_deleted = false
  order by created_at
  limit 1;

  select id
    into legacy_admin_id
  from public.users
  where lower(email) = 'admin@photonicomega.com'
    and is_deleted = false
  order by created_at
  limit 1;

  if system_admin_id is null and legacy_admin_id is not null then
    update public.users
    set email = 'systemadmin@photonicomega.com',
        first_name = 'System',
        last_name = 'Administrator',
        department = 'Information Technology',
        position = 'System Administrator',
        updated_at = now()
    where id = legacy_admin_id;
    system_admin_id := legacy_admin_id;
  end if;

  if legacy_admin_id is not null and legacy_admin_id <> system_admin_id then
    update public.users
    set status = 'INACTIVE',
        is_deleted = true,
        deleted_at = now(),
        deleted_by = '20260902000200_repair_admin_role_separation',
        updated_at = now()
    where id = legacy_admin_id;
  end if;

  if system_admin_id is not null then
    update public.users
    set first_name = 'System',
        last_name = 'Administrator',
        department = 'Information Technology',
        position = 'System Administrator',
        status = 'ACTIVE',
        is_deleted = false,
        deleted_at = null,
        deleted_by = null,
        failed_login_attempts = 0,
        locked_until = null,
        updated_at = now()
    where id = system_admin_id;

    delete from public.user_roles
    where user_id = system_admin_id;

    insert into public.user_roles (user_id, role_id)
    select system_admin_id, role_row.id
    from public.roles role_row
    where role_row.name = 'SYSTEM_ADMIN'
    on conflict do nothing;

    delete from public.refresh_tokens
    where user_id = system_admin_id;

    if to_regclass('public.active_sessions') is not null then
      delete from public.active_sessions
      where user_id = system_admin_id::text;
    end if;
  end if;
end $$;

do $$
declare
  super_admin_id uuid;
begin
  select id
    into super_admin_id
  from public.users
  where lower(email) = 'superadmin@photonicomega.com'
    and is_deleted = false
  order by created_at
  limit 1;

  if super_admin_id is not null then
    delete from public.user_roles
    where user_id = super_admin_id;

    insert into public.user_roles (user_id, role_id)
    select super_admin_id, role_row.id
    from public.roles role_row
    where role_row.name = 'SUPER_ADMIN'
    on conflict do nothing;

    delete from public.refresh_tokens
    where user_id = super_admin_id;

    if to_regclass('public.active_sessions') is not null then
      delete from public.active_sessions
      where user_id = super_admin_id::text;
    end if;
  end if;
end $$;
