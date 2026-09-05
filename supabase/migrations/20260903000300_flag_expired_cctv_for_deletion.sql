create extension if not exists pg_cron;
alter table public.facility_data_logs
  add column if not exists retention_status text not null default 'NOT_DUE',
  add column if not exists retention_hold boolean not null default false,
  add column if not exists retention_hold_reason text,
  add column if not exists retention_flagged_at timestamptz,
  add column if not exists retention_flagged_by text,
  add column if not exists retention_flag_reason text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_data_logs'::regclass
      and conname = 'chk_facility_data_retention_status'
  ) then
    alter table public.facility_data_logs
      add constraint chk_facility_data_retention_status
      check (retention_status in ('NOT_DUE', 'PENDING_DELETION', 'ON_HOLD', 'DISPOSED', 'CANCELLED'));
  end if;
end $$;
create table if not exists public.retention_disposal_queue (
  id uuid primary key default gen_random_uuid(),
  source_table text not null default 'facility_data_logs',
  source_record_id uuid not null,
  retention_policy_id uuid not null references public.retention_policies(id) on delete restrict,
  status text not null default 'PENDING_DELETION',
  flagged_at timestamptz not null default now(),
  flagged_by text not null default 'pg_cron:flag-expired-cctv',
  reason text not null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  notes text,
  constraint chk_retention_queue_source_table check (source_table = 'facility_data_logs'),
  constraint chk_retention_queue_status check (
    status in ('PENDING_DELETION', 'ON_HOLD', 'DISPOSED', 'CANCELLED')
  ),
  constraint uq_retention_queue_source_record unique (source_table, source_record_id)
);
create index if not exists idx_facility_data_cctv_retention_due
  on public.facility_data_logs (data_category, created_at)
  where status = 'ACTIVE'
    and data_category = 'CCTV_FOOTAGE'
    and retention_status = 'NOT_DUE'
    and retention_hold = false;
create index if not exists idx_retention_disposal_queue_status
  on public.retention_disposal_queue (status, flagged_at);
alter table public.retention_disposal_queue enable row level security;
revoke all privileges on table public.retention_disposal_queue from anon, authenticated;
create or replace function public.flag_expired_cctv_for_deletion()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  flagged_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('tnvs:cctv-retention', 0));

  with candidates as (
    select
      log.id as source_record_id,
      policy.id as retention_policy_id,
      format(
        'CCTV retention policy %s exceeded; captured at %s. Manual deletion review required.',
        policy.name,
        log.created_at
      ) as reason
    from public.facility_data_logs log
    join public.retention_policies policy
      on policy.name = 'CCTV_FOOTAGE'
     and policy.active = true
     and policy.is_deleted = false
     and policy.action_on_expiry = 'PERMANENT_DELETE'
    where log.data_category = policy.name
      and log.status = 'ACTIVE'
      and log.retention_status = 'NOT_DUE'
      and log.retention_hold = false
      and log.created_at < (
        current_timestamp - make_interval(days => policy.retention_period_days)
      )::timestamp
      and not exists (
        select 1
        from public.retention_disposal_queue queue_row
        where queue_row.source_table = 'facility_data_logs'
          and queue_row.source_record_id = log.id
      )
  ), queued as (
    insert into public.retention_disposal_queue (
      source_record_id,
      retention_policy_id,
      status,
      flagged_at,
      flagged_by,
      reason
    )
    select
      source_record_id,
      retention_policy_id,
      'PENDING_DELETION',
      current_timestamp,
      'pg_cron:flag-expired-cctv',
      reason
    from candidates
    on conflict (source_table, source_record_id) do nothing
    returning source_record_id
  )
  update public.facility_data_logs log
  set retention_status = 'PENDING_DELETION',
      retention_flagged_at = coalesce(log.retention_flagged_at, current_timestamp),
      retention_flagged_by = 'pg_cron:flag-expired-cctv',
      retention_flag_reason = 'CCTV_FOOTAGE retention period exceeded; disposal review required.'
  from queued
  where log.id = queued.source_record_id
    and log.retention_status = 'NOT_DUE';

  get diagnostics flagged_count = row_count;
  return flagged_count;
end;
$$;
revoke all on function public.flag_expired_cctv_for_deletion() from public;
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'flag-expired-cctv-for-deletion'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'flag-expired-cctv-for-deletion',
    '15 2 * * *',
    'select public.flag_expired_cctv_for_deletion();'
  );
end $$;
