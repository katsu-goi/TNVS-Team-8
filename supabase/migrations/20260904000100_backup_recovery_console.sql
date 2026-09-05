alter table public.backup_records
  add column if not exists file_url text,
  add column if not exists checksum text,
  add column if not exists created_by uuid,
  add column if not exists created_by_email text,
  add column if not exists module_scope text[] not null default '{}'::text[],
  add column if not exists export_format text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'backup_records_created_by_fkey'
      and conrelid = 'public.backup_records'::regclass
  ) then
    alter table public.backup_records
      add constraint backup_records_created_by_fkey
      foreign key (created_by) references public.users(id) on delete set null;
  end if;
end $$;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'backup_records_type_check'
      and conrelid = 'public.backup_records'::regclass
  ) then
    alter table public.backup_records
      add constraint backup_records_type_check
      check (backup_type in ('FULL', 'INCREMENTAL', 'FULL_SQL', 'GRANULAR_EXPORT'));
  end if;
end $$;
create index if not exists idx_backup_records_status_created_at
  on public.backup_records(status, created_at desc);
create index if not exists idx_backup_records_created_by_created_at
  on public.backup_records(created_by, created_at desc);
create table if not exists public.backup_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_key text not null unique,
  cron_expression text not null,
  enabled boolean not null default false,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backup_schedules_key_check check (schedule_key = 'BACKUP_DAILY'),
  constraint backup_schedules_cron_check check (cron_expression in ('0 0 * * *', '0 0 * * 0'))
);
insert into public.backup_schedules(schedule_key, cron_expression, enabled)
values ('BACKUP_DAILY', '0 0 * * *', false)
on conflict (schedule_key) do nothing;
alter table public.backup_records enable row level security;
alter table public.backup_schedules enable row level security;
revoke all privileges on table public.backup_records from anon, authenticated;
revoke all privileges on table public.backup_schedules from anon, authenticated;
create or replace function public.log_backup_record_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(
    user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    module,
    description,
    severity,
    status,
    created_at
  )
  values (
    new.created_by,
    coalesce(new.created_by_email, new.triggered_by, 'system'),
    'BACKUP_REQUESTED',
    'BackupRecord',
    new.id::text,
    'ADMIN',
    format('Backup request queued: %s', new.backup_type),
    'INFO',
    'SUCCESS',
    now()::timestamp
  );
  return new;
end;
$$;
revoke all on function public.log_backup_record_created() from public, anon, authenticated;
grant execute on function public.log_backup_record_created() to postgres, service_role;
drop trigger if exists backup_record_created_audit on public.backup_records;
create trigger backup_record_created_audit
after insert on public.backup_records
for each row execute function public.log_backup_record_created();
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
set search_path = public
as $$
declare
  target public.backup_records%rowtype;
begin
  select * into target
  from public.backup_records
  where id = p_backup_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Backup record not found';
  end if;

  if target.file_url is null or target.file_url = '' then
    raise exception using errcode = 'P0001', message = 'Backup file is not available';
  end if;

  insert into public.audit_logs(
    user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    module,
    description,
    ip_address,
    user_agent,
    severity,
    status,
    created_at
  )
  values (
    p_user_id,
    p_user_email,
    'BACKUP_DOWNLOADED',
    'BackupRecord',
    target.id::text,
    'ADMIN',
    format('Backup downloaded: %s', target.backup_type),
    p_ip_address,
    p_user_agent,
    'INFO',
    'SUCCESS',
    now()::timestamp
  );

  return query select target.file_url, target.id;
end;
$$;
revoke all on function public.record_backup_download(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_backup_download(uuid, uuid, text, text, text) to service_role;
create or replace function public.queue_scheduled_backup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.backup_schedules
    where schedule_key = 'BACKUP_DAILY'
      and enabled = true
      and (
        cron_expression = '0 0 * * *'
        or (cron_expression = '0 0 * * 0' and extract(dow from now()) = 0)
      )
  ) then
    return;
  end if;

  insert into public.backup_records(
    backup_type,
    status,
    started_at,
    triggered_by,
    created_by_email,
    notes
  )
  values (
    'FULL_SQL',
    'QUEUED',
    now(),
    'pg_cron',
    'pg_cron',
    'Daily automated backup event queued for the configured backup worker.'
  );
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
    perform cron.schedule(
      'daily-backup-event',
      '0 0 * * *',
      'select public.queue_scheduled_backup();'
    );
  end if;
end $$;
do $$
begin
  if to_regprocedure('public.emit_realtime_event()') is not null then
    execute 'drop trigger if exists emit_realtime_event on public.backup_records';
    execute 'create trigger emit_realtime_event after insert or update or delete on public.backup_records for each row execute function public.emit_realtime_event()';
    execute 'drop trigger if exists emit_realtime_event on public.backup_schedules';
    execute 'create trigger emit_realtime_event after insert or update or delete on public.backup_schedules for each row execute function public.emit_realtime_event()';
  end if;
end $$;
