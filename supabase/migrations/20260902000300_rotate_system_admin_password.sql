-- Rotate the canonical System Administrator password and invalidate prior access.
-- The password is represented only by its bcrypt hash in this migration.

do $$
declare
  system_admin_id uuid;
begin
  select id
    into system_admin_id
  from public.users
  where lower(email) = 'systemadmin@photonicomega.com'
    and is_deleted = false
  order by created_at
  limit 1;

  if system_admin_id is null then
    raise exception 'Canonical System Administrator account was not found';
  end if;

  update public.users
  set password_hash = '$2a$12$DPQYEW0HI2AtvtQtdNykuOWZgnQPYcKDjbZLJkbh2sSBl3dycLvvq',
      status = 'ACTIVE',
      failed_login_attempts = 0,
      locked_until = null,
      last_failed_attempt_at = null,
      password_reset_token = null,
      password_reset_expires_at = null,
      updated_at = now()
  where id = system_admin_id;

  delete from public.refresh_tokens
  where user_id = system_admin_id;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'active_sessions'
      and column_name = 'user_id'
  ) then
    execute 'delete from public.active_sessions where user_id = $1'
      using system_admin_id::text;
  end if;
end $$;
