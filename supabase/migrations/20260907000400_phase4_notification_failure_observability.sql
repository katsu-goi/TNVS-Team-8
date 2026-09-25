-- Notification delivery is secondary to the durable business alert. Record a
-- sanitized retryable failure without exposing record content.

create table if not exists public.lifecycle_notification_failures (
  id uuid primary key default gen_random_uuid(),
  event_dedup_key varchar(255) not null unique,
  error_code varchar(20),
  error_summary varchar(500),
  status text not null default 'PENDING' check (status in ('PENDING', 'RESOLVED')),
  attempt_count integer not null default 1,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_lifecycle_notification_failures_status
  on public.lifecycle_notification_failures(status, last_failed_at desc);
alter table public.lifecycle_notification_failures enable row level security;
revoke all privileges on table public.lifecycle_notification_failures from anon, authenticated;

create or replace function public.phase4_emit_alert(
  p_dedup_key text,
  p_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id text,
  p_deadline date,
  p_window integer,
  p_roles text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alerts integer := 0;
  v_notifications integer := 0;
  v_notification_failed boolean := false;
  v_error_code text;
  v_error_summary text;
begin
  insert into public.compliance_alerts (
    type, severity, title, message, entity_type, entity_id, status, dedup_key,
    deadline_date, alert_window_days, created_at, updated_at, created_by, updated_by, is_deleted
  ) values (
    p_type, p_severity, left(p_title, 255), p_message, p_entity_type, p_entity_id,
    'OPEN', left(p_dedup_key, 255), p_deadline, p_window,
    timezone('UTC', now()), timezone('UTC', now()), 'LIFECYCLE_AUTOMATION', 'LIFECYCLE_AUTOMATION', false
  ) on conflict (dedup_key) do nothing;
  get diagnostics v_alerts = row_count;

  if v_alerts > 0 then
    begin
      v_notifications := public.phase4_notify_roles(
        p_dedup_key, p_roles, p_title, p_message, p_type, p_entity_type, p_entity_id
      );
    exception when others then
      v_notifications := 0;
      v_notification_failed := true;
      v_error_code := sqlstate;
      v_error_summary := left(sqlerrm, 500);
      begin
        insert into public.lifecycle_notification_failures(
          event_dedup_key, error_code, error_summary
        ) values (
          left(p_dedup_key, 255), v_error_code, v_error_summary
        ) on conflict (event_dedup_key) do update set
          error_code = excluded.error_code,
          error_summary = excluded.error_summary,
          attempt_count = public.lifecycle_notification_failures.attempt_count + 1,
          last_failed_at = now(),
          status = 'PENDING',
          resolved_at = null;
      exception when others then
        null;
      end;
    end;
  end if;
  return jsonb_build_object(
    'alerts', v_alerts,
    'notifications', v_notifications,
    'notificationFailed', v_notification_failed
  );
end;
$$;

create or replace function public.phase4_automation_diagnostics()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select jsonb_build_object(
    'cronJob', coalesce((
      select jsonb_build_object('jobName', jobname, 'schedule', schedule, 'active', active, 'command', command)
      from cron.job where jobname = 'phase4-lifecycle-daily' limit 1
    ), 'null'::jsonb),
    'lastRun', coalesce((
      select to_jsonb(run_row) from (
        select job_name, status, as_of_date, started_at, completed_at,
               processed_count, generated_alerts, generated_notifications, error_summary
        from public.lifecycle_automation_runs where job_name = 'phase4-lifecycle-daily'
        order by started_at desc limit 1
      ) run_row
    ), 'null'::jsonb),
    'pendingNotificationFailures', (
      select count(*) from public.lifecycle_notification_failures where status = 'PENDING'
    ),
    'privileges', jsonb_build_object(
      'anonCanRun', has_function_privilege('anon', 'public.run_phase4_lifecycle_automation(date)', 'EXECUTE'),
      'authenticatedCanRun', has_function_privilege('authenticated', 'public.run_phase4_lifecycle_automation(date)', 'EXECUTE'),
      'serviceRoleCanRun', has_function_privilege('service_role', 'public.run_phase4_lifecycle_automation(date)', 'EXECUTE')
    ),
    'rls', (
      select jsonb_object_agg(c.relname, c.relrowsecurity)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (
        'documents', 'retention_policies', 'compliance_alerts', 'disposal_requests',
        'document_legal_holds', 'document_retention_assignments', 'contract_obligations',
        'lifecycle_automation_runs', 'lifecycle_notification_failures'
      )
    )
  );
$$;

revoke all on function public.phase4_emit_alert(text, text, text, text, text, text, text, date, integer, text[])
  from public, anon, authenticated;
grant execute on function public.phase4_emit_alert(text, text, text, text, text, text, text, date, integer, text[])
  to postgres, service_role;
revoke all on function public.phase4_automation_diagnostics() from public, anon, authenticated;
grant execute on function public.phase4_automation_diagnostics() to postgres, service_role;

comment on table public.lifecycle_notification_failures is
  'Sanitized retry queue/health evidence for notification delivery failures; contains no record content.';
