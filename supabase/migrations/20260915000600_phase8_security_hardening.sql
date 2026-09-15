-- Phase 8: centralized session revocation, least-privilege database access,
-- refresh-token at-rest protection, and sanitized-only Realtime publication.

create extension if not exists pgcrypto with schema extensions;

alter table public.users
  add column if not exists auth_version integer not null default 1;

alter table public.users
  drop constraint if exists users_auth_version_positive;
alter table public.users
  add constraint users_auth_version_positive check (auth_version > 0);

create or replace function public.bump_user_auth_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.password_hash is distinct from new.password_hash
     or old.status is distinct from new.status
     or old.is_deleted is distinct from new.is_deleted then
    new.auth_version := old.auth_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists bump_user_auth_version on public.users;
create trigger bump_user_auth_version
before update of password_hash, status, is_deleted on public.users
for each row execute function public.bump_user_auth_version();

-- Existing sessions are deliberately expired during the one-time transition.
-- New refresh-token values are stored only as SHA-256 lookup digests.
update public.refresh_tokens
set token = encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex'),
    is_revoked = true,
    revoked_at = coalesce(revoked_at, localtimestamp)
where length(token) <> 64
   or token !~ '^[0-9a-f]{64}$';

create index if not exists refresh_tokens_user_active_idx
  on public.refresh_tokens (user_id, expires_at)
  where is_revoked = false;

-- The custom-auth browser never queries business tables directly. Edge
-- Functions use service_role and remain the authoritative mediation layer.
do $$
declare
  table_row record;
begin
  for table_row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> 'realtime_events'
  loop
    execute format('alter table %I.%I enable row level security', table_row.schemaname, table_row.tablename);
    execute format('revoke all on table %I.%I from anon, authenticated', table_row.schemaname, table_row.tablename);
  end loop;
end;
$$;

-- Realtime carries only table/operation/timestamp invalidation markers. Raw
-- business tables are removed from the publication even if an old migration
-- or environment had published them directly.
do $$
declare
  published record;
begin
  for published in
    select schemaname, tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename <> 'realtime_events'
  loop
    execute format('alter publication supabase_realtime drop table %I.%I', published.schemaname, published.tablename);
  end loop;
end;
$$;

alter table public.realtime_events enable row level security;
revoke all on public.realtime_events from anon, authenticated;
grant select on public.realtime_events to anon, authenticated;
drop policy if exists "anon_select_realtime_events" on public.realtime_events;
create policy "sanitized_marker_read"
  on public.realtime_events
  for select
  to anon, authenticated
  using (true);

-- Application routines are callable only by the database owner and the Edge
-- Function service role. SECURITY DEFINER and invoker RPCs alike are withheld
-- from browser roles so clients cannot bypass Edge authorization.
do $$
declare
  routine record;
begin
  for routine in
    select n.nspname as schema_name,
           p.proname as routine_name,
           pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      routine.schema_name,
      routine.routine_name,
      routine.identity_arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      routine.schema_name,
      routine.routine_name,
      routine.identity_arguments
    );
  end loop;
end;
$$;

revoke all on function public.bump_user_auth_version() from public, anon, authenticated;
grant execute on function public.bump_user_auth_version() to service_role;

comment on column public.users.auth_version is
  'Monotonic session generation embedded in access/refresh JWTs; account-security changes invalidate older tokens.';
