-- Phase 6: authoritative, role-scoped analytics and report provenance.
-- All ranges use an inclusive lower bound and exclusive upper bound. Timestamps
-- remain UTC; calendar bucketing is explicitly Asia/Manila (or the validated
-- timezone supplied by the trusted Edge Function).

create table if not exists public.analytics_export_audit (
  id uuid primary key default gen_random_uuid(),
  generated_by uuid not null references public.users(id) on delete restrict,
  generated_by_email varchar(255) not null,
  generated_by_role varchar(100) not null,
  report_type varchar(100) not null,
  range_from timestamptz not null,
  range_to timestamptz not null,
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null check (row_count >= 0),
  generated_at timestamptz not null default now()
);

alter table public.analytics_export_audit enable row level security;
revoke all privileges on table public.analytics_export_audit from anon, authenticated;

create index if not exists idx_analytics_export_audit_actor_time
  on public.analytics_export_audit(generated_by, generated_at desc);
create index if not exists idx_reservations_phase6_created_status
  on public.reservations(created_at, status) where is_deleted = false;
create index if not exists idx_visitors_phase6_created_status
  on public.visitors(created_at, status) where is_deleted = false;
create index if not exists idx_documents_phase6_created_retention
  on public.documents(created_at, retention_status) where is_deleted = false;
create index if not exists idx_document_ai_phase6_processed_review
  on public.document_ai_classifications(processed_at, review_status);
create index if not exists idx_contracts_phase6_status_end
  on public.contracts(status, end_date) where is_deleted = false;
create index if not exists idx_contract_ai_phase6_analyzed_review_risk
  on public.contract_ai_analyses(analyzed_at, review_status, overall_risk);
create index if not exists idx_contract_obligations_phase6_due_status
  on public.contract_obligations(due_date, status);
create index if not exists idx_employee_notifications_phase6_unread
  on public.employee_notifications(recipient_id, created_at desc)
  where is_read = false and is_deleted = false;

create or replace function public.phase6_trend(p_current bigint, p_previous bigint)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_previous = 0 and p_current = 0 then
      jsonb_build_object('current', p_current, 'previous', p_previous, 'kind', 'N_A', 'percent', null)
    when p_previous = 0 then
      jsonb_build_object('current', p_current, 'previous', p_previous, 'kind', 'NEW', 'percent', null)
    else
      jsonb_build_object(
        'current', p_current,
        'previous', p_previous,
        'kind', case when p_current > p_previous then 'UP' when p_current < p_previous then 'DOWN' else 'FLAT' end,
        'percent', round(((p_current - p_previous)::numeric * 100) / p_previous, 1)
      )
  end;
$$;

create or replace function public.phase6_analytics_snapshot(
  p_role text,
  p_user_id uuid,
  p_user_email text,
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text default 'Asia/Manila'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := upper(trim(coalesce(p_role, '')));
  v_period interval;
  v_previous_from timestamptz;
  v_previous_to timestamptz;
  v_result jsonb;
  v_current bigint;
  v_previous bigint;
  v_occupied_minutes numeric;
  v_available_minutes numeric;
  v_today date;
begin
  if p_user_id is null or nullif(trim(coalesce(p_user_email, '')), '') is null then
    raise exception 'Authenticated analytics identity is required';
  end if;
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'Invalid analytics range';
  end if;
  if p_timezone <> 'Asia/Manila' then
    raise exception 'Unsupported analytics timezone';
  end if;

  v_period := p_to - p_from;
  v_previous_to := p_from;
  v_previous_from := p_from - v_period;
  v_today := (now() at time zone p_timezone)::date;
  v_result := jsonb_build_object(
    'scope', v_role,
    'timezone', p_timezone,
    'period', jsonb_build_object('from', p_from, 'toExclusive', p_to),
    'generatedAt', now()
  );

  if v_role in ('SYSTEM_ADMIN', 'SUPER_ADMIN') then
    select count(*) into v_current from public.security_logs
      where timestamp >= p_from and timestamp < p_to and status = 'FAILED';
    select count(*) into v_previous from public.security_logs
      where timestamp >= v_previous_from and timestamp < v_previous_to and status = 'FAILED';
    v_result := v_result || jsonb_build_object('operational', jsonb_build_object(
      'failedEvents', v_current,
      'failedEventsTrend', public.phase6_trend(v_current, v_previous),
      'activeSessions', (select count(*) from public.active_sessions where status = 'ACTIVE'),
      'automation', jsonb_build_object(
        'successfulRuns', (select count(*) from public.lifecycle_automation_runs where started_at >= p_from and started_at < p_to and status = 'SUCCEEDED'),
        'failedRuns', (select count(*) from public.lifecycle_automation_runs where started_at >= p_from and started_at < p_to and status = 'FAILED'),
        'lastRunAt', (select max(started_at) from public.lifecycle_automation_runs)
      ),
      'notificationDeliveryFailures', (select count(*) from public.lifecycle_notification_failures where status = 'PENDING'),
      'realtimeMarkers', (select count(*) from public.realtime_events where created_at >= p_from and created_at < p_to)
    ));
    return v_result;
  end if;

  if v_role in ('FACILITIES_MANAGER', 'FACILITIES_OFFICER') then
    select count(*) into v_current from public.reservations
      where is_deleted = false and created_at >= p_from and created_at < p_to;
    select count(*) into v_previous from public.reservations
      where is_deleted = false and created_at >= v_previous_from and created_at < v_previous_to;

    select coalesce(sum(extract(epoch from (least(r.end_time, p_to) - greatest(r.start_time, p_from))) / 60), 0)
      into v_occupied_minutes
    from public.reservations r
    where r.is_deleted = false
      and r.status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
      and r.start_time < p_to and r.end_time > p_from;

    select coalesce(
      (greatest(1, ((p_to at time zone p_timezone)::date - (p_from at time zone p_timezone)::date) + 1))
      * sum(extract(epoch from (r.close_time - r.open_time)) / 60), 0)
      into v_available_minutes
    from public.rooms r
    where r.is_deleted = false and r.active = true
      and r.open_time is not null and r.close_time is not null and r.close_time > r.open_time;

    v_result := v_result || jsonb_build_object('facilities', jsonb_build_object(
      'submitted', v_current,
      'submittedTrend', public.phase6_trend(v_current, v_previous),
      'officerReviewed', (select count(*) from public.reservations where is_deleted = false and officer_reviewed_at >= p_from and officer_reviewed_at < p_to),
      'managerApproved', (select count(*) from public.reservations where is_deleted = false and manager_decided_at >= p_from and manager_decided_at < p_to and status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')),
      'rejected', (select count(*) from public.reservations where is_deleted = false and manager_decided_at >= p_from and manager_decided_at < p_to and status = 'REJECTED'),
      'cancelled', (select count(*) from public.reservations where is_deleted = false and cancelled_at >= p_from and cancelled_at < p_to and status = 'CANCELLED'),
      'completed', (select count(*) from public.reservations where is_deleted = false and completed_at >= p_from and completed_at < p_to and status = 'COMPLETED'),
      'conflicts', (select count(*) from public.reservation_approvals where created_at >= p_from and created_at < p_to and upper(coalesce(action, '')) = 'CONFLICT'),
      'maintenanceRelatedRejections', (select count(*) from public.reservations where is_deleted = false and manager_decided_at >= p_from and manager_decided_at < p_to and status = 'REJECTED' and rejection_reason ilike '%maintenance%'),
      'occupiedMinutes', round(v_occupied_minutes, 1),
      'availableOperatingMinutes', round(v_available_minutes, 1),
      'utilizationPercent', case when v_available_minutes <= 0 then null else round(least(100, v_occupied_minutes * 100 / v_available_minutes), 1) end,
      'maintenanceRestrictions', (select count(*) from public.maintenance_schedules where is_deleted = false and status in ('SCHEDULED', 'IN_PROGRESS') and start_time < p_to and end_time > p_from),
      'dailySubmitted', (select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'value', d.value) order by d.day), '[]'::jsonb)
        from (
          select gs::date as day, count(r.id) as value
          from generate_series((p_from at time zone p_timezone)::date, ((p_to - interval '1 microsecond') at time zone p_timezone)::date, interval '1 day') gs
          left join public.reservations r on r.is_deleted = false and (r.created_at at time zone p_timezone)::date = gs::date
          group by gs::date
        ) d),
      'frequentlyUsedFacilities', (select coalesce(jsonb_agg(jsonb_build_object('facility', x.name, 'reservations', x.total, 'occupiedMinutes', round(x.minutes, 1)) order by x.total desc, x.name), '[]'::jsonb)
        from (
          select f.name, count(r.id) total,
                 coalesce(sum(extract(epoch from (least(r.end_time, p_to) - greatest(r.start_time, p_from))) / 60), 0) minutes
          from public.reservations r
          join public.rooms rm on rm.id = r.room_id
          join public.facilities f on f.id = rm.facility_id
          where r.is_deleted = false and r.status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
            and r.start_time < p_to and r.end_time > p_from
          group by f.id, f.name order by total desc limit 10
        ) x)
    ));
  end if;

  if v_role in ('FACILITIES_MANAGER', 'FACILITIES_OFFICER') then
    v_result := v_result || jsonb_build_object('visitors', jsonb_build_object(
      'registered', (select count(*) from public.visitors where is_deleted = false and created_at >= p_from and created_at < p_to),
      'clear', (select count(*) from public.visitor_verifications where is_deleted = false and created_at >= p_from and created_at < p_to and clearance_state = 'CLEAR'),
      'reviewRequired', (select count(*) from public.visitor_verifications where is_deleted = false and created_at >= p_from and created_at < p_to and clearance_state = 'REVIEW_REQUIRED'),
      'blocked', (select count(*) from public.visitor_verifications where is_deleted = false and created_at >= p_from and created_at < p_to and clearance_state = 'BLOCKED'),
      'checkedIn', (select count(*) from public.visitors where is_deleted = false and actual_arrival >= p_from and actual_arrival < p_to),
      'checkedOut', (select count(*) from public.visitors where is_deleted = false and actual_departure >= p_from and actual_departure < p_to),
      'noShow', (select count(*) from public.visitors where is_deleted = false and status = 'NO_SHOW' and expected_arrival >= p_from and expected_arrival < p_to),
      'averageVisitMinutes', (select round(avg(extract(epoch from (actual_departure - actual_arrival))) / 60, 1) from public.visitors where is_deleted = false and actual_arrival is not null and actual_departure is not null and actual_departure >= p_from and actual_departure < p_to)
    ));
  end if;

  if v_role in ('COMPLIANCE_OFFICER', 'COMPLIANCE_MANAGER', 'RECORDS_OFFICER') then
    v_result := v_result || jsonb_build_object('documents', jsonb_build_object(
      'uploaded', (select count(*) from public.documents where is_deleted = false and created_at >= p_from and created_at < p_to),
      'classifications', (select count(*) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to),
      'requiringReview', (select count(*) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to and review_required = true and review_status = 'PENDING'),
      'approved', (select count(*) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to and review_status = 'APPROVED'),
      'corrected', (select count(*) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to and review_status = 'CORRECTED'),
      'rejected', (select count(*) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to and review_status = 'REJECTED'),
      'humanCorrectionRate', (select case when count(*) filter (where review_status in ('APPROVED', 'CORRECTED', 'REJECTED')) = 0 then null else round(count(*) filter (where review_status = 'CORRECTED')::numeric * 100 / count(*) filter (where review_status in ('APPROVED', 'CORRECTED', 'REJECTED')), 1) end from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to),
      'averageCalibratedConfidence', (select round(avg(confidence), 4) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to),
      'byCategory', (select coalesce(jsonb_object_agg(x.predicted_category_name, x.total), '{}'::jsonb) from (select predicted_category_name, count(*) total from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to group by predicted_category_name) x),
      'byProviderModel', (select coalesce(jsonb_agg(jsonb_build_object('provider', provider_name, 'model', model, 'count', total) order by total desc), '[]'::jsonb) from (select provider_name, model, count(*) total from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to group by provider_name, model) x)
    ));
  end if;

  if v_role in ('LEGAL_OFFICER', 'LEGAL_COUNSEL', 'CONTRACT_OFFICER') then
    v_result := v_result || jsonb_build_object('contracts', jsonb_build_object(
      'totalAnalyzed', (select count(*) from public.contract_ai_analyses where analyzed_at >= p_from and analyzed_at < p_to),
      'pendingReview', (select count(*) from public.contract_ai_analyses where review_status = 'PENDING'),
      'active', (select count(*) from public.contracts where is_deleted = false and status = 'ACTIVE'),
      'expiringWithin30Days', (select count(*) from public.contracts where is_deleted = false and status = 'ACTIVE' and end_date >= v_today and end_date < v_today + 30),
      'expired', (select count(*) from public.contracts where is_deleted = false and (status = 'EXPIRED' or end_date < v_today)),
      'renewalsApproaching', (select count(*) from public.contracts where is_deleted = false and renewal_notice_date >= v_today and renewal_notice_date < v_today + 30),
      'overdueObligations', (select count(*) from public.contract_obligations where status = 'OVERDUE' or (status in ('PENDING', 'IN_PROGRESS') and due_date < v_today)),
      'reviewStates', (select coalesce(jsonb_object_agg(x.review_status, x.total), '{}'::jsonb) from (select review_status, count(*) total from public.contract_ai_analyses group by review_status) x),
      'riskDistribution', (select coalesce(jsonb_object_agg(x.overall_risk, x.total), '{}'::jsonb) from (select overall_risk, count(*) total from public.contract_ai_analyses group by overall_risk) x),
      'lifecycleStates', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (select status, count(*) total from public.contracts where is_deleted = false group by status) x)
    ));
    if v_role in ('LEGAL_OFFICER', 'LEGAL_COUNSEL') then
      v_result := v_result || jsonb_build_object('legal', jsonb_build_object(
        'activeDocumentLegalHolds', (select count(*) from public.document_legal_holds where status = 'ACTIVE')
      ));
    end if;
  end if;

  if v_role in ('COMPLIANCE_OFFICER', 'COMPLIANCE_MANAGER') then
    v_result := v_result || jsonb_build_object('compliance', jsonb_build_object(
      'expiringRetention', (select count(*) from public.documents where is_deleted = false and retention_status = 'EXPIRING'),
      'expiredRecords', (select count(*) from public.documents where is_deleted = false and retention_status = 'ELIGIBLE_FOR_DISPOSAL'),
      'missingPolicy', (select count(*) from public.documents where is_deleted = false and retention_status in ('UNASSIGNED', 'RETENTION_POLICY_REQUIRED')),
      'activeLegalHolds', (select count(*) from public.document_legal_holds where status = 'ACTIVE'),
      'eligibleDisposal', (select count(*) from public.documents where is_deleted = false and retention_status = 'ELIGIBLE_FOR_DISPOSAL'),
      'pendingDisposalApproval', (select count(*) from public.disposal_requests where is_deleted = false and status in ('PENDING', 'PENDING_APPROVAL')),
      'overdueObligations', (select count(*) from public.contract_obligations where status = 'OVERDUE' or (status in ('PENDING', 'IN_PROGRESS') and due_date < v_today)),
      'openAutomatedAlerts', (select count(*) from public.compliance_alerts where is_deleted = false and status in ('OPEN', 'ACKNOWLEDGED') and created_at >= p_from and created_at < p_to)
    ));
  end if;

  if v_role = 'EMPLOYEE' then
    v_result := v_result || jsonb_build_object('employee', jsonb_build_object(
      'ownReservations', (select count(*) from public.reservations where is_deleted = false and user_id = p_user_id and created_at >= p_from and created_at < p_to),
      'ownApprovedReservations', (select count(*) from public.reservations where is_deleted = false and user_id = p_user_id and status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED') and created_at >= p_from and created_at < p_to),
      'ownVisitors', (select count(*) from public.visitors where is_deleted = false and host_id = p_user_id and created_at >= p_from and created_at < p_to),
      'ownDocuments', (select count(*) from public.documents where is_deleted = false and lower(owner_email) = lower(p_user_email) and created_at >= p_from and created_at < p_to),
      'unreadNotifications', (select count(*) from public.employee_notifications where recipient_id = p_user_id and is_read = false and is_deleted = false)
    ));
  end if;

  if not (v_result ?| array['facilities', 'visitors', 'documents', 'contracts', 'legal', 'compliance', 'employee']) then
    raise exception 'Role % has no analytics scope', v_role;
  end if;
  return v_result;
end;
$$;

revoke all on function public.phase6_trend(bigint, bigint) from public, anon, authenticated;
revoke all on function public.phase6_analytics_snapshot(text, uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.phase6_trend(bigint, bigint) to postgres, service_role;
grant execute on function public.phase6_analytics_snapshot(text, uuid, text, timestamptz, timestamptz, text) to postgres, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'contract_ai_analyses', 'document_ai_classifications', 'contracts',
    'document_retention_assignments', 'analytics_export_audit'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists emit_realtime_event on public.%I', v_table);
      execute format(
        'create trigger emit_realtime_event after insert or update or delete on public.%I for each row execute function public.emit_realtime_event()',
        v_table
      );
    end if;
  end loop;
end;
$$;

comment on function public.phase6_analytics_snapshot(text, uuid, text, timestamptz, timestamptz, text) is
  'Role-scoped Phase 6 aggregate only; returns no raw document, contract, visitor identity, or watchlist reason content.';
comment on table public.analytics_export_audit is
  'Report provenance only. Exported report contents are never retained here.';
