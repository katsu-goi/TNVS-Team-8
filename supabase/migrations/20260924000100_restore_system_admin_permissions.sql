-- Restore the two SYSTEM_ADMIN permission mappings defined by
-- 00011_role_separation_and_oversight.sql and removed during the later
-- administrator-role consolidation. No other role or permission is changed.

do $$
declare
  system_admin_role_id uuid;
  system_administer_permission_id uuid;
  security_monitor_permission_id uuid;
begin
  select id
    into system_admin_role_id
  from public.roles
  where name = 'SYSTEM_ADMIN'
    and is_deleted = false;

  if system_admin_role_id is null then
    raise exception 'Required active role SYSTEM_ADMIN does not exist';
  end if;

  select id
    into system_administer_permission_id
  from public.permissions
  where name = 'SYSTEM_ADMINISTER'
    and is_deleted = false;

  if system_administer_permission_id is null then
    raise exception 'Required active permission SYSTEM_ADMINISTER does not exist';
  end if;

  select id
    into security_monitor_permission_id
  from public.permissions
  where name = 'SECURITY_MONITOR'
    and is_deleted = false;

  if security_monitor_permission_id is null then
    raise exception 'Required active permission SECURITY_MONITOR does not exist';
  end if;

  insert into public.role_permissions (role_id, permission_id)
  values
    (system_admin_role_id, system_administer_permission_id),
    (system_admin_role_id, security_monitor_permission_id)
  on conflict (role_id, permission_id) do nothing;

  if (
    select count(*)
    from public.role_permissions
    where role_id = system_admin_role_id
      and permission_id in (
        system_administer_permission_id,
        security_monitor_permission_id
      )
  ) <> 2 then
    raise exception 'SYSTEM_ADMIN permission repair did not produce exactly two intended mappings';
  end if;
end $$;
