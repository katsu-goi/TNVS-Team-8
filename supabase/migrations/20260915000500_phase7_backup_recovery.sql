-- Phase 7: truthful backup lifecycle, private artifact verification, retention,
-- scheduler dispatch, and an isolated restore-verification schema.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

alter table public.backup_records
  add column if not exists verification_state text not null default 'NOT_VERIFIED',
  add column if not exists verified_at timestamptz,
  add column if not exists retention_expires_at timestamptz,
  add column if not exists is_protected boolean not null default false,
  add column if not exists protected_at timestamptz,
  add column if not exists protected_by uuid references public.users(id) on delete set null,
  add column if not exists source_environment text not null default 'production',
  add column if not exists schema_version text,
  add column if not exists manifest_version integer not null default 1,
  add column if not exists manifest_path text,
  add column if not exists data_artifact_path text,
  add column if not exists restore_artifact_path text,
  add column if not exists artifact_objects jsonb not null default '[]'::jsonb,
  add column if not exists table_count integer,
  add column if not exists row_count bigint,
  add column if not exists storage_object_count integer,
  add column if not exists failure_reason text,
  add column if not exists restore_test_status text not null default 'NOT_TESTED',
  add column if not exists last_restore_test_at timestamptz,
  add column if not exists artifact_deleted_at timestamptz,
  add column if not exists cleanup_status text not null default 'RETAINED';

update public.backup_records
set verification_state = case when integrity_check = 'PASSED' then 'INTEGRITY_VERIFIED' else 'NOT_VERIFIED' end,
    verified_at = case when integrity_check = 'PASSED' then completed_at end,
    retention_expires_at = coalesce(retention_expires_at, completed_at, started_at, created_at) + interval '30 days',
    manifest_path = coalesce(manifest_path, file_path),
    cleanup_status = case when artifact_deleted_at is null then 'RETAINED' else 'DELETED' end
where verification_state = 'NOT_VERIFIED'
   or retention_expires_at is null
   or manifest_path is null;

alter table public.backup_records
  drop constraint if exists backup_records_status_phase7_check,
  add constraint backup_records_status_phase7_check
    check (status in ('QUEUED', 'REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED')),
  drop constraint if exists backup_records_verification_phase7_check,
  add constraint backup_records_verification_phase7_check
    check (verification_state in ('NOT_VERIFIED', 'INTEGRITY_VERIFIED', 'RESTORE_VERIFIED', 'FAILED')),
  drop constraint if exists backup_records_restore_phase7_check,
  add constraint backup_records_restore_phase7_check
    check (restore_test_status in ('NOT_TESTED', 'RUNNING', 'VERIFIED', 'FAILED')),
  drop constraint if exists backup_records_cleanup_phase7_check,
  add constraint backup_records_cleanup_phase7_check
    check (cleanup_status in ('RETAINED', 'DELETE_RUNNING', 'DELETED', 'DELETE_FAILED'));

create unique index if not exists uq_backup_records_one_active
  on public.backup_records ((1))
  where status in ('REQUESTED', 'RUNNING');
create index if not exists idx_backup_records_retention
  on public.backup_records(retention_expires_at)
  where is_protected = false and cleanup_status <> 'DELETED';
create index if not exists idx_backup_records_verification
  on public.backup_records(verification_state, completed_at desc);

alter table public.backup_schedules
  add column if not exists scheduler_token_hash text,
  add column if not exists last_dispatched_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0;

create table if not exists public.backup_restore_tests (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid not null references public.backup_records(id) on delete cascade,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'VERIFIED', 'FAILED', 'FAILED_EXPECTED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  checksum_verified boolean not null default false,
  restored_record_count integer not null default 0,
  relationships_verified boolean not null default false,
  storage_verified boolean not null default false,
  original_sha256 text,
  restored_sha256 text,
  failure_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_by_email text
);

alter table public.backup_restore_tests enable row level security;
revoke all on table public.backup_restore_tests from public, anon, authenticated;
grant all on table public.backup_restore_tests to service_role;
create index if not exists idx_backup_restore_tests_backup_started
  on public.backup_restore_tests(backup_id, started_at desc);

create schema if not exists phase7_recovery_sandbox;
revoke all on schema phase7_recovery_sandbox from public, anon, authenticated;
grant usage on schema phase7_recovery_sandbox to postgres, service_role;

create table if not exists phase7_recovery_sandbox.facilities (
  run_id uuid not null,
  id uuid not null,
  name text not null,
  code text,
  active boolean,
  primary key (run_id, id)
);
create table if not exists phase7_recovery_sandbox.rooms (
  run_id uuid not null,
  id uuid not null,
  facility_id uuid not null,
  name text not null,
  room_number text not null,
  status text,
  primary key (run_id, id),
  foreign key (run_id, facility_id)
    references phase7_recovery_sandbox.facilities(run_id, id) on delete cascade
);
create table if not exists phase7_recovery_sandbox.reservations (
  run_id uuid not null,
  id uuid not null,
  room_id uuid not null,
  title text not null,
  status text not null,
  start_time timestamptz,
  end_time timestamptz,
  primary key (run_id, id),
  foreign key (run_id, room_id)
    references phase7_recovery_sandbox.rooms(run_id, id) on delete cascade
);
create table if not exists phase7_recovery_sandbox.visitors (
  run_id uuid not null,
  id uuid not null,
  full_name text not null,
  purpose_of_visit text not null,
  status text not null,
  primary key (run_id, id)
);
create table if not exists phase7_recovery_sandbox.documents (
  run_id uuid not null,
  id uuid not null,
  title text not null,
  status text not null,
  file_path text,
  primary key (run_id, id)
);
create table if not exists phase7_recovery_sandbox.contracts (
  run_id uuid not null,
  id uuid not null,
  document_id uuid,
  title text not null,
  status text not null,
  primary key (run_id, id),
  foreign key (run_id, document_id)
    references phase7_recovery_sandbox.documents(run_id, id) on delete set null
);
create index if not exists idx_phase7_sandbox_rooms_facility
  on phase7_recovery_sandbox.rooms(run_id, facility_id);
create index if not exists idx_phase7_sandbox_reservations_room
  on phase7_recovery_sandbox.reservations(run_id, room_id);
create index if not exists idx_phase7_sandbox_contracts_document
  on phase7_recovery_sandbox.contracts(run_id, document_id);

revoke all on all tables in schema phase7_recovery_sandbox from public, anon, authenticated;
grant all on all tables in schema phase7_recovery_sandbox to service_role;

create or replace function public.phase7_schema_inventory()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'capturedAt', now(),
    'schemaVersion', coalesce((select max(version) from supabase_migrations.schema_migrations), 'unknown'),
    'tables', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
    'views', (select count(*) from information_schema.views where table_schema = 'public'),
    'constraints', (select count(*) from pg_constraint where connamespace = 'public'::regnamespace),
    'indexes', (select count(*) from pg_indexes where schemaname = 'public'),
    'functions', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace),
    'triggers', (select count(*) from information_schema.triggers where trigger_schema = 'public'),
    'rlsTables', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity),
    'policies', (select count(*) from pg_policies where schemaname = 'public'),
    'realtimeTables', (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
    'cronJobs', case when to_regnamespace('cron') is null then 0 else (select count(*) from cron.job) end
  );
$$;
revoke all on function public.phase7_schema_inventory() from public, anon, authenticated;
grant execute on function public.phase7_schema_inventory() to service_role;

create or replace function public.phase7_storage_inventory()
returns table(bucket_id text, object_name text, object_size bigint)
language sql
security definer
set search_path = public, storage, pg_temp
as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  join storage.buckets b on b.id = o.bucket_id
  where b.public = false
    and o.bucket_id = 'documents'
  order by o.bucket_id, o.name;
$$;
revoke all on function public.phase7_storage_inventory() from public, anon, authenticated;
grant execute on function public.phase7_storage_inventory() to service_role;

create or replace function public.phase7_restore_fixture(p_run_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, phase7_recovery_sandbox, pg_temp
as $$
declare
  f jsonb := p_payload->'facility';
  r jsonb := p_payload->'room';
  res jsonb := p_payload->'reservation';
  v jsonb := p_payload->'visitor';
  d jsonb := p_payload->'document';
  c jsonb := p_payload->'contract';
begin
  if p_run_id is null or f is null or r is null or res is null or v is null or d is null or c is null then
    raise exception using errcode = '22023', message = 'RESTORE_FIXTURE_INCOMPLETE';
  end if;

  delete from phase7_recovery_sandbox.facilities where run_id = p_run_id;

  insert into phase7_recovery_sandbox.facilities(run_id, id, name, code, active)
  values (p_run_id, (f->>'id')::uuid, f->>'name', f->>'code', (f->>'active')::boolean);
  insert into phase7_recovery_sandbox.rooms(run_id, id, facility_id, name, room_number, status)
  values (p_run_id, (r->>'id')::uuid, (r->>'facility_id')::uuid, r->>'name', r->>'room_number', r->>'status');
  insert into phase7_recovery_sandbox.reservations(run_id, id, room_id, title, status, start_time, end_time)
  values (p_run_id, (res->>'id')::uuid, (res->>'room_id')::uuid, res->>'title', res->>'status', (res->>'start_time')::timestamptz, (res->>'end_time')::timestamptz);
  insert into phase7_recovery_sandbox.visitors(run_id, id, full_name, purpose_of_visit, status)
  values (p_run_id, (v->>'id')::uuid, v->>'full_name', v->>'purpose_of_visit', v->>'status');
  insert into phase7_recovery_sandbox.documents(run_id, id, title, status, file_path)
  values (p_run_id, (d->>'id')::uuid, d->>'title', d->>'status', d->>'file_path');
  insert into phase7_recovery_sandbox.contracts(run_id, id, document_id, title, status)
  values (p_run_id, (c->>'id')::uuid, nullif(c->>'document_id', '')::uuid, c->>'title', c->>'status');

  return jsonb_build_object(
    'runId', p_run_id,
    'recordCount', 6,
    'facilityRoomLinked', exists(
      select 1 from phase7_recovery_sandbox.rooms sr
      join phase7_recovery_sandbox.facilities sf on sf.run_id = sr.run_id and sf.id = sr.facility_id
      where sr.run_id = p_run_id
    ),
    'roomReservationLinked', exists(
      select 1 from phase7_recovery_sandbox.reservations rr
      join phase7_recovery_sandbox.rooms sr on sr.run_id = rr.run_id and sr.id = rr.room_id
      where rr.run_id = p_run_id
    ),
    'documentContractLinked', exists(
      select 1 from phase7_recovery_sandbox.contracts sc
      join phase7_recovery_sandbox.documents sd on sd.run_id = sc.run_id and sd.id = sc.document_id
      where sc.run_id = p_run_id
    ),
    'records', jsonb_build_object(
      'facility', f,
      'room', r,
      'reservation', res,
      'visitor', v,
      'document', d,
      'contract', c
    )
  );
end;
$$;
revoke all on function public.phase7_restore_fixture(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.phase7_restore_fixture(uuid, jsonb) to service_role;

create or replace function public.phase7_cleanup_restore_fixture(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, phase7_recovery_sandbox, pg_temp
as $$
declare
  removed integer;
begin
  delete from phase7_recovery_sandbox.facilities where run_id = p_run_id;
  get diagnostics removed = row_count;
  delete from phase7_recovery_sandbox.visitors where run_id = p_run_id;
  delete from phase7_recovery_sandbox.contracts where run_id = p_run_id;
  delete from phase7_recovery_sandbox.documents where run_id = p_run_id;
  return removed;
end;
$$;
revoke all on function public.phase7_cleanup_restore_fixture(uuid) from public, anon, authenticated;
grant execute on function public.phase7_cleanup_restore_fixture(uuid) to service_role;

create or replace function public.phase7_log_backup_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  action_name text;
begin
  if new.status is distinct from old.status then
    action_name := case new.status
      when 'RUNNING' then 'BACKUP_STARTED'
      when 'COMPLETED' then 'BACKUP_COMPLETED'
      when 'FAILED' then 'BACKUP_FAILED'
      else 'BACKUP_STATUS_CHANGED'
    end;
  elsif new.verification_state is distinct from old.verification_state then
    action_name := 'BACKUP_VERIFICATION_CHANGED';
  elsif new.is_protected is distinct from old.is_protected then
    action_name := case when new.is_protected then 'BACKUP_PROTECTED' else 'BACKUP_UNPROTECTED' end;
  elsif new.cleanup_status is distinct from old.cleanup_status then
    action_name := 'BACKUP_RETENTION_CHANGED';
  else
    return new;
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity_type, entity_id, module, description, severity, status, created_at)
  values (
    coalesce(new.protected_by, new.created_by),
    coalesce(new.created_by_email, new.triggered_by, 'system'),
    action_name,
    'BackupRecord',
    new.id::text,
    'ADMIN',
    format('Backup %s state=%s verification=%s cleanup=%s', new.backup_type, new.status, new.verification_state, new.cleanup_status),
    case when new.status = 'FAILED' or new.cleanup_status = 'DELETE_FAILED' then 'HIGH' else 'INFO' end,
    case when new.status = 'FAILED' or new.cleanup_status = 'DELETE_FAILED' then 'FAILED' else 'SUCCESS' end,
    now()
  );
  return new;
end;
$$;
revoke all on function public.phase7_log_backup_state() from public, anon, authenticated;
grant execute on function public.phase7_log_backup_state() to postgres, service_role;
drop trigger if exists phase7_backup_state_audit on public.backup_records;
create trigger phase7_backup_state_audit
after update on public.backup_records
for each row execute function public.phase7_log_backup_state();

do $$
declare
  token_value text;
begin
  if not exists (select 1 from vault.secrets where name = 'phase7_backup_scheduler_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'phase7_backup_scheduler_token', 'Dedicated Phase 7 pg_cron to Edge backup dispatcher token');
  end if;
  select decrypted_secret into token_value from vault.decrypted_secrets where name = 'phase7_backup_scheduler_token' limit 1;
  update public.backup_schedules
  set scheduler_token_hash = encode(extensions.digest(token_value, 'sha256'), 'hex'),
      updated_at = now()
  where schedule_key = 'BACKUP_DAILY';
end $$;

create or replace function public.phase7_dispatch_scheduled_backup(p_force boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  schedule_row public.backup_schedules%rowtype;
  token_value text;
  request_id bigint;
begin
  select * into schedule_row from public.backup_schedules
  where schedule_key = 'BACKUP_DAILY'
  for update;
  if not found or (not p_force and not schedule_row.enabled) then
    return null;
  end if;
  if not p_force and schedule_row.cron_expression = '0 0 * * 0' and extract(dow from now()) <> 0 then
    return null;
  end if;
  if not p_force and schedule_row.last_dispatched_at is not null
     and schedule_row.last_dispatched_at::date = now()::date then
    return null;
  end if;
  select decrypted_secret into token_value from vault.decrypted_secrets
  where name = 'phase7_backup_scheduler_token' limit 1;
  if token_value is null then
    raise exception using errcode = 'P0001', message = 'BACKUP_SCHEDULER_SECRET_MISSING';
  end if;

  select net.http_post(
    url := 'https://dunijfrvfozwlykpkfhy.supabase.co/functions/v1/admin/admin/backups/scheduled',
    headers := jsonb_build_object('content-type', 'application/json', 'x-backup-scheduler-token', token_value),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into request_id;
  update public.backup_schedules set last_dispatched_at = now(), updated_at = now()
  where id = schedule_row.id;
  return request_id;
end;
$$;
revoke all on function public.phase7_dispatch_scheduled_backup(boolean) from public, anon, authenticated;
grant execute on function public.phase7_dispatch_scheduled_backup(boolean) to postgres, service_role;

create or replace function public.queue_scheduled_backup()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.phase7_dispatch_scheduled_backup(false);
end;
$$;
revoke all on function public.queue_scheduled_backup() from public, anon, authenticated;
grant execute on function public.queue_scheduled_backup() to postgres, service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from cron.job where jobname = 'daily-backup-event') then
      perform cron.unschedule('daily-backup-event');
    end if;
    if exists (select 1 from cron.job where jobname = 'phase7-backup-dispatch') then
      perform cron.unschedule('phase7-backup-dispatch');
    end if;
    perform cron.schedule('phase7-backup-dispatch', '0 0 * * *', 'select public.phase7_dispatch_scheduled_backup(false);');
  end if;
end $$;

insert into storage.buckets(id, name, public)
values ('backup-archives', 'backup-archives', false)
on conflict (id) do update set public = false;

alter table public.backup_records enable row level security;
alter table public.backup_schedules enable row level security;
revoke all on table public.backup_records from public, anon, authenticated;
revoke all on table public.backup_schedules from public, anon, authenticated;
grant all on table public.backup_records to service_role;
grant all on table public.backup_schedules to service_role;

create or replace function public.record_backup_download(
  p_backup_id uuid,
  p_user_id uuid,
  p_user_email text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns table(file_url text, backup_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.backup_records%rowtype;
begin
  select * into target from public.backup_records where id = p_backup_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Backup record not found';
  end if;
  if target.status <> 'COMPLETED'
     or target.verification_state not in ('INTEGRITY_VERIFIED', 'RESTORE_VERIFIED')
     or target.data_artifact_path is null then
    raise exception using errcode = 'P0001', message = 'Verified backup artifact is not available';
  end if;
  insert into public.audit_logs(
    user_id, user_email, action, entity_type, entity_id, module,
    description, ip_address, user_agent, severity, status, created_at
  ) values (
    p_user_id, p_user_email, 'BACKUP_DOWNLOADED', 'BackupRecord', target.id::text, 'ADMIN',
    format('Authorized time-limited download for verified %s backup.', target.backup_type),
    p_ip_address, p_user_agent, 'INFO', 'SUCCESS', now()
  );
  return query select null::text, target.id;
end;
$$;
revoke all on function public.record_backup_download(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_backup_download(uuid, uuid, text, text, text) to service_role;

comment on schema phase7_recovery_sandbox is
  'Isolated, service-only Phase 7 recovery verification target. Never used for production restoration.';
comment on function public.phase7_schema_inventory() is
  'Service-only schema/control inventory captured in each backup manifest; versioned migrations remain the authoritative schema recovery source.';
comment on function public.phase7_dispatch_scheduled_backup(boolean) is
  'Vault-authenticated pg_cron dispatcher for the same real Edge backup engine used by manual requests.';
