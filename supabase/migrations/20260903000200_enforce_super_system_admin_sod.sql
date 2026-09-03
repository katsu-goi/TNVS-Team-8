do $$
begin
  if not exists (select 1 from public.roles where name = 'SUPER_ADMIN')
     or not exists (select 1 from public.roles where name = 'SYSTEM_ADMIN') then
    raise exception using
      errcode = 'undefined_object',
      message = 'SUPER_ADMIN and SYSTEM_ADMIN roles must exist before applying the SoD constraint.';
  end if;
end $$;

insert into public.role_conflicts (
  first_role_id,
  second_role_id,
  code,
  description,
  active,
  is_deleted,
  created_at,
  updated_at
)
select
  least(super_admin.id, system_admin.id),
  greatest(super_admin.id, system_admin.id),
  'SOD_SUPER_SYSTEM_ADMIN',
  'Super Admin and System Admin must be assigned to different users.',
  true,
  false,
  now(),
  now()
from public.roles super_admin
cross join public.roles system_admin
where super_admin.name = 'SUPER_ADMIN'
  and system_admin.name = 'SYSTEM_ADMIN'
on conflict (code) do update set
  first_role_id = excluded.first_role_id,
  second_role_id = excluded.second_role_id,
  description = excluded.description,
  active = true,
  is_deleted = false,
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

do $$
declare
  violating_users text;
begin
  select string_agg(user_row.email, ', ' order by user_row.email)
    into violating_users
  from public.users user_row
  join public.user_roles super_assignment
    on super_assignment.user_id = user_row.id
  join public.roles super_role
    on super_role.id = super_assignment.role_id
   and super_role.name = 'SUPER_ADMIN'
  join public.user_roles system_assignment
    on system_assignment.user_id = user_row.id
  join public.roles system_role
    on system_role.id = system_assignment.role_id
   and system_role.name = 'SYSTEM_ADMIN'
  where user_row.is_deleted = false;

  if violating_users is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'SOD_SUPER_SYSTEM_ADMIN violation already exists for: ' || violating_users,
      hint = 'Remove one of the two roles from each listed user before applying this migration.';
  end if;
end $$;

create or replace function public.enforce_super_system_admin_sod()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  conflicting_role text;
begin
  select role_row.name
    into conflicting_role
  from public.user_roles existing_assignment
  join public.roles role_row
    on role_row.id = existing_assignment.role_id
  where existing_assignment.user_id = new.user_id
    and existing_assignment.role_id <> new.role_id
    and role_row.name = case
      when exists (
        select 1
        from public.roles incoming_role
        where incoming_role.id = new.role_id
          and incoming_role.name = 'SUPER_ADMIN'
      ) then 'SYSTEM_ADMIN'
      when exists (
        select 1
        from public.roles incoming_role
        where incoming_role.id = new.role_id
          and incoming_role.name = 'SYSTEM_ADMIN'
      ) then 'SUPER_ADMIN'
      else ''
    end
  limit 1;

  if conflicting_role is not null then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'SOD_SUPER_SYSTEM_ADMIN violation: a user cannot hold both %s and %s.',
        conflicting_role,
        case when conflicting_role = 'SUPER_ADMIN' then 'SYSTEM_ADMIN' else 'SUPER_ADMIN' end
      ),
      detail = format('User id: %s', new.user_id),
      hint = 'Remove the conflicting role before assigning this role.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_super_system_admin_sod() from public;

drop trigger if exists enforce_super_system_admin_sod on public.user_roles;
create trigger enforce_super_system_admin_sod
before insert or update of user_id, role_id on public.user_roles
for each row
execute function public.enforce_super_system_admin_sod();
