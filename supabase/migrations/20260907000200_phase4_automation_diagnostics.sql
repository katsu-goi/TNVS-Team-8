-- Service-only diagnostics for business-critical Phase 4 automation.

create or replace function public.phase4_automation_diagnostics()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select jsonb_build_object(
    'cronJob', coalesce((
      select jsonb_build_object(
        'jobName', jobname,
        'schedule', schedule,
        'active', active,
        'command', command
      )
      from cron.job
      where jobname = 'phase4-lifecycle-daily'
      limit 1
    ), 'null'::jsonb),
    'lastRun', coalesce((
      select to_jsonb(run_row)
      from (
        select job_name, status, as_of_date, started_at, completed_at,
               processed_count, generated_alerts, generated_notifications,
               error_summary
        from public.lifecycle_automation_runs
        where job_name = 'phase4-lifecycle-daily'
        order by started_at desc
        limit 1
      ) run_row
    ), 'null'::jsonb),
    'privileges', jsonb_build_object(
      'anonCanRun', has_function_privilege('anon', 'public.run_phase4_lifecycle_automation(date)', 'EXECUTE'),
      'authenticatedCanRun', has_function_privilege('authenticated', 'public.run_phase4_lifecycle_automation(date)', 'EXECUTE'),
      'serviceRoleCanRun', has_function_privilege('service_role', 'public.run_phase4_lifecycle_automation(date)', 'EXECUTE')
    ),
    'rls', (
      select jsonb_object_agg(c.relname, c.relrowsecurity)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'documents', 'retention_policies', 'compliance_alerts',
          'disposal_requests', 'document_legal_holds',
          'document_retention_assignments', 'contract_obligations',
          'lifecycle_automation_runs'
        )
    )
  );
$$;

revoke all on function public.phase4_automation_diagnostics() from public, anon, authenticated;
grant execute on function public.phase4_automation_diagnostics() to postgres, service_role;

comment on function public.phase4_automation_diagnostics() is
  'Service-only cron, privilege, RLS, and last-run health snapshot without business content or secrets.';
