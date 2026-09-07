-- Preserve the business alert if recipient notification delivery fails, and
-- honor the alert windows captured on the assigned retention policy.

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
    end;
  end if;
  return jsonb_build_object(
    'alerts', v_alerts,
    'notifications', v_notifications,
    'notificationFailed', v_notification_failed
  );
end;
$$;

do $migration$
declare
  v_definition text;
  v_old text := $old$select min(window_days) into v_window from public.lifecycle_alert_rules
        where event_type = 'RETENTION' and enabled = true
          and (v_doc.deadline - p_as_of) <= window_days;$old$;
  v_new text := $new$select min(policy_window) into v_window
        from public.documents assigned_document
        join public.retention_policies assigned_policy
          on assigned_policy.id = assigned_document.retention_policy_id
        cross join lateral unnest(assigned_policy.alert_windows_days) policy_window
        where assigned_document.id = v_doc.id
          and (v_doc.deadline - p_as_of) <= policy_window;$new$;
begin
  select pg_get_functiondef('public.run_phase4_lifecycle_automation(date)'::regprocedure)
  into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Phase 4 retention-window function body did not match the expected definition';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

revoke all on function public.phase4_emit_alert(text, text, text, text, text, text, text, date, integer, text[])
  from public, anon, authenticated;
grant execute on function public.phase4_emit_alert(text, text, text, text, text, text, text, date, integer, text[])
  to postgres, service_role;
revoke all on function public.run_phase4_lifecycle_automation(date)
  from public, anon, authenticated;
grant execute on function public.run_phase4_lifecycle_automation(date)
  to postgres, service_role;
