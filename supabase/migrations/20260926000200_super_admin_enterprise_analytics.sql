-- Phase 9 Super Administrator enterprise analytics.
--
-- The Edge Function authorizes SUPER_ADMIN before invoking this service-only
-- aggregate. The function returns counts and chart-ready summaries only: it
-- never returns raw visitor identities, document contents, legal narratives,
-- contract text, credentials, or unrestricted audit rows.

create index if not exists idx_audit_logs_enterprise_created_module
  on public.audit_logs(created_at, module);
create index if not exists idx_legal_cases_enterprise_created_status
  on public.legal_cases(created_at, status)
  where is_deleted = false;
create index if not exists idx_users_enterprise_status
  on public.users(status)
  where is_deleted = false;

create or replace function public.phase9_super_admin_enterprise_analytics(
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
  v_today date;
  v_utilization jsonb;
  v_facilities jsonb;
  v_visitors jsonb;
  v_documents jsonb;
  v_records_compliance jsonb;
  v_legal jsonb;
  v_contracts jsonb;
  v_users_governance jsonb;
  v_module_activity jsonb;
  v_activity_total bigint;
begin
  if p_user_id is null or nullif(trim(coalesce(p_user_email, '')), '') is null then
    raise exception 'Authenticated enterprise analytics identity is required';
  end if;
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'Invalid enterprise analytics range';
  end if;
  if p_to - p_from > interval '366 days' then
    raise exception 'Enterprise analytics range exceeds 366 days';
  end if;
  if p_timezone <> 'Asia/Manila' then
    raise exception 'Unsupported analytics timezone';
  end if;

  v_today := (now() at time zone p_timezone)::date;
  v_utilization := public.phase6_facility_utilization(p_from, p_to, p_timezone);

  v_facilities := jsonb_build_object(
    'currentState', jsonb_build_object(
      'totalFacilities', (select count(*) from public.facilities where is_deleted = false),
      'activeFacilities', (select count(*) from public.facilities where is_deleted = false and active = true),
      'totalRooms', (select count(*) from public.rooms where is_deleted = false),
      'availableRooms', (select count(*) from public.rooms where is_deleted = false and active = true and is_available = true),
      'availableCapacity', (select coalesce(sum(capacity), 0) from public.rooms where is_deleted = false and active = true),
      'activeMaintenance', (select count(*) from public.maintenance_schedules where is_deleted = false and status in ('SCHEDULED', 'IN_PROGRESS') and start_time < now() and end_time > now())
    ),
    'selectedPeriod', jsonb_build_object(
      'reservations', (select count(*) from public.reservations where is_deleted = false and created_at >= p_from and created_at < p_to),
      'approvedReservations', (select count(*) from public.reservations where is_deleted = false and created_at >= p_from and created_at < p_to and status in ('APPROVED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')),
      'pendingReservations', (select count(*) from public.reservations where is_deleted = false and created_at >= p_from and created_at < p_to and status in ('PENDING', 'PENDING_MANAGER_APPROVAL')),
      'maintenanceActivities', (select count(*) from public.maintenance_schedules where is_deleted = false and created_at >= p_from and created_at < p_to),
      'occupiedMinutes', coalesce((v_utilization->>'occupiedMinutes')::numeric, 0),
      'availableOperatingMinutes', coalesce((v_utilization->>'availableOperatingMinutes')::numeric, 0),
      'utilizationPercent', (v_utilization->>'utilizationPercent')::numeric
    ),
    'facilityStatusDistribution', jsonb_build_object(
      'ACTIVE', (select count(*) from public.facilities where is_deleted = false and active = true),
      'INACTIVE', (select count(*) from public.facilities where is_deleted = false and active = false)
    ),
    'reservationStatusDistribution', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (
      select coalesce(status, 'UNSPECIFIED') status, count(*) total
      from public.reservations
      where is_deleted = false and created_at >= p_from and created_at < p_to
      group by coalesce(status, 'UNSPECIFIED')
    ) x),
    'reservationTrend', (select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'value', x.total) order by x.day), '[]'::jsonb) from (
      select gs::date as day, count(r.id) as total
      from generate_series((p_from at time zone p_timezone)::date, ((p_to - interval '1 microsecond') at time zone p_timezone)::date, interval '1 day') gs
      left join public.reservations r on r.is_deleted = false and (r.created_at at time zone p_timezone)::date = gs::date
      group by gs::date
    ) x)
  );

  v_visitors := jsonb_build_object(
    'currentState', jsonb_build_object(
      'currentlyCheckedIn', (select count(*) from public.visitors where is_deleted = false and actual_arrival is not null and actual_departure is null)
    ),
    'selectedPeriod', jsonb_build_object(
      'registeredVisitors', (select count(*) from public.visitors where is_deleted = false and created_at >= p_from and created_at < p_to),
      'expectedVisitors', (select count(*) from public.visitors where is_deleted = false and expected_arrival >= p_from and expected_arrival < p_to),
      'checkedInVisitors', (select count(*) from public.visitors where is_deleted = false and actual_arrival >= p_from and actual_arrival < p_to),
      'completedVisits', (select count(*) from public.visitors where is_deleted = false and actual_departure >= p_from and actual_departure < p_to),
      'cancelledOrRejected', (select count(*) from public.visitors where is_deleted = false and expected_arrival >= p_from and expected_arrival < p_to and status in ('CANCELLED', 'REJECTED', 'DENIED', 'BLOCKED', 'NO_SHOW'))
    ),
    'statusDistribution', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (
      select coalesce(status, 'UNSPECIFIED') status, count(*) total
      from public.visitors
      where is_deleted = false and created_at >= p_from and created_at < p_to
      group by coalesce(status, 'UNSPECIFIED')
    ) x),
    'visitorTrend', (select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'value', x.total) order by x.day), '[]'::jsonb) from (
      select gs::date as day, count(v.id) as total
      from generate_series((p_from at time zone p_timezone)::date, ((p_to - interval '1 microsecond') at time zone p_timezone)::date, interval '1 day') gs
      left join public.visitors v on v.is_deleted = false and (v.created_at at time zone p_timezone)::date = gs::date
      group by gs::date
    ) x)
  );

  v_documents := jsonb_build_object(
    'currentState', jsonb_build_object(
      'totalDocuments', (select count(*) from public.documents where is_deleted = false),
      'archivedDocuments', (select count(*) from public.documents where is_deleted = false and status = 'ARCHIVED'),
      'retentionDue', (select count(*) from public.documents where is_deleted = false and retention_status = 'EXPIRING'),
      'retentionOverdue', (select count(*) from public.documents where is_deleted = false and retention_status = 'ELIGIBLE_FOR_DISPOSAL'),
      'aiPendingReview', (select count(*) from public.document_ai_classifications where review_status = 'PENDING')
    ),
    'selectedPeriod', jsonb_build_object(
      'uploadedDocuments', (select count(*) from public.documents where is_deleted = false and created_at >= p_from and created_at < p_to),
      'aiClassifications', (select count(*) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to)
    ),
    'classificationDistribution', (select coalesce(jsonb_object_agg(x.classification, x.total), '{}'::jsonb) from (
      select coalesce(classification_level, 'UNSPECIFIED') classification, count(*) total
      from public.documents where is_deleted = false
      group by coalesce(classification_level, 'UNSPECIFIED')
    ) x),
    'statusDistribution', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (
      select coalesce(status, 'UNSPECIFIED') status, count(*) total
      from public.documents where is_deleted = false
      group by coalesce(status, 'UNSPECIFIED')
    ) x),
    'uploadTrend', (select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'value', x.total) order by x.day), '[]'::jsonb) from (
      select gs::date as day, count(d.id) as total
      from generate_series((p_from at time zone p_timezone)::date, ((p_to - interval '1 microsecond') at time zone p_timezone)::date, interval '1 day') gs
      left join public.documents d on d.is_deleted = false and (d.created_at at time zone p_timezone)::date = gs::date
      group by gs::date
    ) x)
  );

  v_records_compliance := jsonb_build_object(
    'currentState', jsonb_build_object(
      'totalManagedRecords', (select count(*) from public.documents where is_deleted = false),
      'retentionDue', (select count(*) from public.documents where is_deleted = false and retention_status = 'EXPIRING'),
      'retentionOverdue', (select count(*) from public.documents where is_deleted = false and retention_status = 'ELIGIBLE_FOR_DISPOSAL'),
      'pendingDisposition', (select count(*) from public.disposal_requests where is_deleted = false and status in ('PENDING', 'PENDING_APPROVAL')),
      'openComplianceIssues', (select count(*) from public.compliance_alerts where is_deleted = false and status in ('OPEN', 'ACKNOWLEDGED')),
      'activeLegalHolds', (select count(*) from public.document_legal_holds where status = 'ACTIVE')
    ),
    'selectedPeriod', jsonb_build_object(
      'complianceItems', (select count(*) from public.compliance_alerts where is_deleted = false and created_at >= p_from and created_at < p_to),
      'dispositionRequests', (select count(*) from public.disposal_requests where is_deleted = false and created_at >= p_from and created_at < p_to)
    ),
    'recordsByStatus', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (
      select coalesce(retention_status, 'UNASSIGNED') status, count(*) total
      from public.documents where is_deleted = false
      group by coalesce(retention_status, 'UNASSIGNED')
    ) x),
    'complianceStatusDistribution', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (
      select coalesce(status, 'UNSPECIFIED') status, count(*) total
      from public.compliance_alerts where is_deleted = false
      group by coalesce(status, 'UNSPECIFIED')
    ) x),
    'complianceTrend', (select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'value', x.total) order by x.day), '[]'::jsonb) from (
      select gs::date as day, count(a.id) as total
      from generate_series((p_from at time zone p_timezone)::date, ((p_to - interval '1 microsecond') at time zone p_timezone)::date, interval '1 day') gs
      left join public.compliance_alerts a on a.is_deleted = false and (a.created_at at time zone p_timezone)::date = gs::date
      group by gs::date
    ) x)
  );

  v_legal := jsonb_build_object(
    'currentState', jsonb_build_object(
      'openLegalMatters', (select count(*) from public.legal_cases where is_deleted = false and coalesce(status, 'OPEN') not in ('CLOSED', 'RESOLVED', 'DISMISSED')),
      'closedLegalMatters', (select count(*) from public.legal_cases where is_deleted = false and status in ('CLOSED', 'RESOLVED', 'DISMISSED')),
      'upcomingDeadlines', (select count(*) from public.legal_cases where is_deleted = false and coalesce(status, 'OPEN') not in ('CLOSED', 'RESOLVED', 'DISMISSED') and coalesce(next_hearing_date, expected_resolution_date) >= v_today and coalesce(next_hearing_date, expected_resolution_date) < v_today + 30),
      'overdueDeadlines', (select count(*) from public.legal_cases where is_deleted = false and coalesce(status, 'OPEN') not in ('CLOSED', 'RESOLVED', 'DISMISSED') and coalesce(next_hearing_date, expected_resolution_date) < v_today)
    ),
    'selectedPeriod', jsonb_build_object(
      'newLegalMatters', (select count(*) from public.legal_cases where is_deleted = false and created_at >= p_from and created_at < p_to),
      'closedMatters', (select count(*) from public.legal_cases where is_deleted = false and closed_date >= (p_from at time zone p_timezone)::date and closed_date < (p_to at time zone p_timezone)::date),
      'legalRequests', (select count(*) from public.employee_requests where is_deleted = false and type = 'LEGAL' and created_at >= p_from and created_at < p_to)
    ),
    'statusDistribution', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (
      select coalesce(status, 'UNSPECIFIED') status, count(*) total
      from public.legal_cases where is_deleted = false
      group by coalesce(status, 'UNSPECIFIED')
    ) x),
    'categoryDistribution', (select coalesce(jsonb_object_agg(x.category, x.total), '{}'::jsonb) from (
      select coalesce(case_type, 'UNSPECIFIED') category, count(*) total
      from public.legal_cases where is_deleted = false
      group by coalesce(case_type, 'UNSPECIFIED')
    ) x)
  );

  v_contracts := jsonb_build_object(
    'currentState', jsonb_build_object(
      'activeContracts', (select count(*) from public.contracts where is_deleted = false and status = 'ACTIVE'),
      'expiringWithin90Days', (select count(*) from public.contracts where is_deleted = false and status = 'ACTIVE' and end_date >= v_today and end_date < v_today + 90),
      'expiredContracts', (select count(*) from public.contracts where is_deleted = false and (status = 'EXPIRED' or end_date < v_today)),
      'pendingReview', (select count(*) from public.contracts where is_deleted = false and (status in ('DRAFT', 'PENDING', 'PENDING_REVIEW', 'SUBMITTED') or ai_analysis_review_status = 'PENDING')),
      'renewalsDue', (select count(*) from public.contracts where is_deleted = false and renewal_notice_date >= v_today and renewal_notice_date < v_today + 90),
      'aiPendingReview', (select count(*) from public.contract_ai_analyses where review_status = 'PENDING')
    ),
    'selectedPeriod', jsonb_build_object(
      'newContracts', (select count(*) from public.contracts where is_deleted = false and created_at >= p_from and created_at < p_to),
      'aiAnalyses', (select count(*) from public.contract_ai_analyses where analyzed_at >= p_from and analyzed_at < p_to)
    ),
    'statusDistribution', (select coalesce(jsonb_object_agg(x.status, x.total), '{}'::jsonb) from (
      select coalesce(status, 'UNSPECIFIED') status, count(*) total
      from public.contracts where is_deleted = false
      group by coalesce(status, 'UNSPECIFIED')
    ) x),
    'typeDistribution', (select coalesce(jsonb_object_agg(x.type, x.total), '{}'::jsonb) from (
      select coalesce(type, 'UNSPECIFIED') type, count(*) total
      from public.contracts where is_deleted = false
      group by coalesce(type, 'UNSPECIFIED')
    ) x)
  );

  v_users_governance := jsonb_build_object(
    'currentState', jsonb_build_object(
      'totalUsers', (select count(*) from public.users where is_deleted = false),
      'activeUsers', (select count(*) from public.users where is_deleted = false and status = 'ACTIVE'),
      'inactiveUsers', (select count(*) from public.users where is_deleted = false and status <> 'ACTIVE'),
      'lockedAccounts', (select count(*) from public.users where is_deleted = false and (status = 'LOCKED' or locked_until > now())),
      'multiRoleUsers', (select count(*) from (select ur.user_id from public.user_roles ur join public.users u on u.id = ur.user_id and u.is_deleted = false group by ur.user_id having count(*) > 1) x),
      'roleAssignments', (select count(*) from public.user_roles ur join public.users u on u.id = ur.user_id where u.is_deleted = false),
      'privilegedRoleAssignments', (select count(*) from public.user_roles ur join public.users u on u.id = ur.user_id join public.roles r on r.id = ur.role_id where u.is_deleted = false and r.is_deleted = false and r.name in ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'SECURITY_OFFICER', 'INFOSEC_OFFICER'))
    ),
    'selectedPeriod', jsonb_build_object(
      'accountsCreated', (select count(*) from public.users where is_deleted = false and created_at >= p_from and created_at < p_to),
      'auditEvents',
        (select count(*) from public.audit_logs where created_at >= p_from and created_at < p_to)
        + (select count(*) from public.security_logs where coalesce(timestamp, created_at) >= p_from and coalesce(timestamp, created_at) < p_to)
        + (select count(*) from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to),
      'administrativeActions',
        (select count(*) from public.audit_logs where created_at >= p_from and created_at < p_to and upper(coalesce(module, '')) in ('ADMIN', 'AUTH', 'RBAC', 'SECURITY'))
        + (select count(*) from public.security_logs where coalesce(timestamp, created_at) >= p_from and coalesce(timestamp, created_at) < p_to and upper(coalesce(module, '')) in ('ADMIN', 'AUTH', 'RBAC', 'SECURITY'))
        + (select count(*) from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to),
      'rolePermissionChanges',
        (select count(*) from public.audit_logs where created_at >= p_from and created_at < p_to and (upper(action) like '%ROLE%' or upper(action) like '%PERMISSION%'))
        + (select count(*) from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to and (upper(action) like '%ROLE%' or upper(action) like '%PERMISSION%')),
      'passwordResetActivity',
        (select count(*) from public.audit_logs where created_at >= p_from and created_at < p_to and upper(action) like '%PASSWORD%RESET%')
        + (select count(*) from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to and upper(action) like '%PASSWORD%RESET%'),
      'sessionRevocations',
        (select count(*) from public.audit_logs where created_at >= p_from and created_at < p_to and upper(action) like '%SESSION%REVOK%')
        + (select count(*) from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to and upper(action) like '%SESSION%REVOK%'),
      'highRiskSecurityEvents', (select count(*) from public.security_logs where coalesce(timestamp, created_at) >= p_from and coalesce(timestamp, created_at) < p_to and risk_level in ('HIGH', 'CRITICAL'))
    ),
    'usersByRole', (select coalesce(jsonb_agg(jsonb_build_object('label', x.name, 'value', x.total) order by x.total desc, x.name), '[]'::jsonb) from (
      select r.name, count(distinct u.id) total
      from public.roles r
      left join public.user_roles ur on ur.role_id = r.id
      left join public.users u on u.id = ur.user_id and u.is_deleted = false
      where r.is_deleted = false
      group by r.name
    ) x),
    'auditByModule', (select coalesce(jsonb_agg(jsonb_build_object('label', x.module, 'value', x.total) order by x.total desc, x.module), '[]'::jsonb) from (
      select module, count(*) total from (
        select coalesce(module, 'UNSPECIFIED') module from public.audit_logs where created_at >= p_from and created_at < p_to
        union all
        select coalesce(module, 'SECURITY') module from public.security_logs where coalesce(timestamp, created_at) >= p_from and coalesce(timestamp, created_at) < p_to
        union all
        select 'ADMIN' module from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to
      ) authorized_audit_modules
      group by module order by total desc limit 15
    ) x),
    'actionsByAdministrator', (select coalesce(jsonb_agg(jsonb_build_object('label', x.actor, 'value', x.total) order by x.total desc, x.actor), '[]'::jsonb) from (
      select actor, count(*) total from (
        select coalesce(nullif(al.user_full_name, ''), nullif(al.user_email, ''), 'System') actor
        from public.audit_logs al
        where al.created_at >= p_from and al.created_at < p_to
          and exists (
            select 1 from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.is_deleted = false
            where ur.user_id = al.user_id and r.name in ('SUPER_ADMIN', 'SYSTEM_ADMIN')
          )
        union all
        select coalesce(nullif(full_name, ''), 'System') actor
        from public.security_logs
        where coalesce(timestamp, created_at) >= p_from and coalesce(timestamp, created_at) < p_to
          and upper(coalesce(role, '')) in ('SUPER_ADMIN', 'SYSTEM_ADMIN')
        union all
        select coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), nullif(u.email, ''), 'System') actor
        from public.admin_audit_logs aa
        left join public.users u on u.id = aa.actor_user_id
        where aa.occurred_at >= p_from and aa.occurred_at < p_to
      ) authorized_audit_actors
      group by actor order by total desc limit 10
    ) x),
    'auditTrend', (select coalesce(jsonb_agg(jsonb_build_object('date', x.day, 'value', x.total) order by x.day), '[]'::jsonb) from (
      select gs::date as day, count(a.occurred_at) as total
      from generate_series((p_from at time zone p_timezone)::date, ((p_to - interval '1 microsecond') at time zone p_timezone)::date, interval '1 day') gs
      left join (
        select created_at occurred_at from public.audit_logs where created_at >= p_from and created_at < p_to
        union all
        select coalesce(timestamp, created_at) occurred_at from public.security_logs where coalesce(timestamp, created_at) >= p_from and coalesce(timestamp, created_at) < p_to
        union all
        select occurred_at from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to
      ) a on (a.occurred_at at time zone p_timezone)::date = gs::date
      group by gs::date
    ) x)
  );

  v_module_activity := jsonb_build_array(
    jsonb_build_object('module', 'Facilities', 'count', (select count(*) from public.reservations where is_deleted = false and created_at >= p_from and created_at < p_to) + (select count(*) from public.maintenance_schedules where is_deleted = false and created_at >= p_from and created_at < p_to), 'basis', 'Reservations and maintenance records created'),
    jsonb_build_object('module', 'Visitors', 'count', (select count(*) from public.visitors where is_deleted = false and created_at >= p_from and created_at < p_to) + (select count(*) from public.visitor_workflow_events where occurred_at >= p_from and occurred_at < p_to), 'basis', 'Visitor registrations and workflow events'),
    jsonb_build_object('module', 'Documents', 'count', (select count(*) from public.documents where is_deleted = false and created_at >= p_from and created_at < p_to) + (select count(*) from public.document_ai_classifications where processed_at >= p_from and processed_at < p_to), 'basis', 'Document uploads and stored classification results'),
    jsonb_build_object('module', 'Records & Compliance', 'count', (select count(*) from public.compliance_alerts where is_deleted = false and created_at >= p_from and created_at < p_to) + (select count(*) from public.disposal_requests where is_deleted = false and created_at >= p_from and created_at < p_to), 'basis', 'Compliance alerts and disposition requests'),
    jsonb_build_object('module', 'Legal', 'count', (select count(*) from public.legal_cases where is_deleted = false and created_at >= p_from and created_at < p_to) + (select count(*) from public.employee_requests where is_deleted = false and type = 'LEGAL' and created_at >= p_from and created_at < p_to), 'basis', 'Legal matters and legal requests created'),
    jsonb_build_object('module', 'Contracts', 'count', (select count(*) from public.contracts where is_deleted = false and created_at >= p_from and created_at < p_to) + (select count(*) from public.contract_ai_analyses where analyzed_at >= p_from and analyzed_at < p_to), 'basis', 'Contracts created and stored contract analyses'),
    jsonb_build_object('module', 'Users & Governance', 'count',
      (select count(*) from public.users where is_deleted = false and created_at >= p_from and created_at < p_to)
      + (select count(*) from public.audit_logs where created_at >= p_from and created_at < p_to)
      + (select count(*) from public.security_logs where coalesce(timestamp, created_at) >= p_from and coalesce(timestamp, created_at) < p_to)
      + (select count(*) from public.admin_audit_logs where occurred_at >= p_from and occurred_at < p_to),
      'basis', 'Accounts created and authorized application, security, and administrative audit events recorded')
  );
  select coalesce(sum((item->>'count')::bigint), 0) into v_activity_total
  from jsonb_array_elements(v_module_activity) item;

  return jsonb_build_object(
    'scope', 'SUPER_ADMIN',
    'timezone', p_timezone,
    'period', jsonb_build_object('from', p_from, 'toExclusive', p_to),
    'generatedAt', now(),
    'enterprise', jsonb_build_object(
      'overview', jsonb_build_object(
        'currentState', jsonb_build_object(
          'activeUsers', v_users_governance#>'{currentState,activeUsers}',
          'openRequests', (select count(*) from public.employee_requests where is_deleted = false and status in ('PENDING', 'PENDING_APPROVAL')),
          'facilities', v_facilities#>'{currentState,totalFacilities}',
          'documents', v_documents#>'{currentState,totalDocuments}',
          'activeContracts', v_contracts#>'{currentState,activeContracts}',
          'openLegalMatters', v_legal#>'{currentState,openLegalMatters}',
          'openComplianceIssues', v_records_compliance#>'{currentState,openComplianceIssues}'
        ),
        'selectedPeriod', jsonb_build_object(
          'recordedActivity', v_activity_total,
          'auditEvents', v_users_governance#>'{selectedPeriod,auditEvents}',
          'visitors', v_visitors#>'{selectedPeriod,registeredVisitors}',
          'documentsUploaded', v_documents#>'{selectedPeriod,uploadedDocuments}'
        ),
        'moduleActivity', v_module_activity
      ),
      'facilities', v_facilities,
      'visitors', v_visitors,
      'documents', v_documents,
      'recordsCompliance', v_records_compliance,
      'legal', v_legal,
      'contracts', v_contracts,
      'usersGovernance', v_users_governance
    )
  );
end;
$$;

revoke all on function public.phase9_super_admin_enterprise_analytics(uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.phase9_super_admin_enterprise_analytics(uuid, text, timestamptz, timestamptz, text) to postgres, service_role;

comment on function public.phase9_super_admin_enterprise_analytics(uuid, text, timestamptz, timestamptz, text) is
  'Service-only Super Administrator aggregate. Authorization occurs before aggregation in the analytics Edge Function; output contains summaries only.';
