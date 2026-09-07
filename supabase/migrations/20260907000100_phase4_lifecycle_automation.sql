-- Phase 4: records retention, compliance, and contract deadline automation.

create extension if not exists pg_cron;

alter table public.retention_policies
  add column if not exists policy_version integer not null default 1,
  add column if not exists classification_name text,
  add column if not exists applicable_department text,
  add column if not exists trigger_basis text not null default 'FINAL_APPROVAL',
  add column if not exists alert_windows_days integer[] not null default array[90, 30, 7],
  add column if not exists effective_from date not null default current_date,
  add column if not exists effective_to date;

alter table public.retention_policies drop constraint if exists chk_retention_trigger_basis;
alter table public.retention_policies add constraint chk_retention_trigger_basis check (
  trigger_basis in ('CREATION', 'FINAL_APPROVAL', 'CONTRACT_EXPIRATION', 'FISCAL_YEAR_END')
);
alter table public.retention_policies drop constraint if exists chk_retention_policy_version;
alter table public.retention_policies add constraint chk_retention_policy_version check (policy_version > 0);

alter table public.documents
  add column if not exists retention_policy_version integer,
  add column if not exists retention_assigned_at timestamptz,
  add column if not exists retention_assignment_source text,
  add column if not exists retention_calculation_basis text,
  add column if not exists retention_trigger_at date,
  add column if not exists retention_status text not null default 'UNASSIGNED',
  add column if not exists disposition_at timestamptz,
  add column if not exists disposition_by varchar(255),
  add column if not exists physical_disposition_status text not null default 'NOT_REQUESTED',
  add column if not exists physical_disposed_at timestamptz;

alter table public.documents drop constraint if exists chk_document_retention_status;
alter table public.documents add constraint chk_document_retention_status check (
  retention_status in (
    'UNASSIGNED', 'RETENTION_POLICY_REQUIRED', 'SCHEDULED', 'EXPIRING',
    'ELIGIBLE_FOR_DISPOSAL', 'LEGAL_HOLD', 'DISPOSED', 'EXTENDED'
  )
);
alter table public.documents drop constraint if exists chk_document_physical_disposition_status;
alter table public.documents add constraint chk_document_physical_disposition_status check (
  physical_disposition_status in ('NOT_REQUESTED', 'PENDING', 'DELETED', 'RETAINED', 'FAILED')
);

alter table public.disposal_requests
  add column if not exists policy_action text,
  add column if not exists physical_disposition_status text not null default 'NOT_REQUESTED',
  add column if not exists physical_disposed_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.compliance_alerts
  add column if not exists deadline_date date,
  add column if not exists alert_window_days integer;

alter table public.employee_notifications
  add column if not exists dedup_key varchar(500);

create unique index if not exists uq_employee_notifications_dedup
  on public.employee_notifications(recipient_id, dedup_key)
  where dedup_key is not null;

create table if not exists public.retention_policy_versions (
  id uuid primary key default gen_random_uuid(),
  retention_policy_id uuid not null references public.retention_policies(id) on delete restrict,
  policy_version integer not null,
  name text not null,
  description text,
  classification_name text,
  applicable_department text,
  trigger_basis text not null,
  retention_period_days integer not null,
  action_on_expiry text not null,
  alert_windows_days integer[] not null,
  effective_from date not null,
  effective_to date,
  captured_at timestamptz not null default now(),
  captured_by varchar(255) not null default 'SYSTEM',
  unique(retention_policy_id, policy_version)
);

create table if not exists public.document_retention_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  retention_policy_id uuid not null references public.retention_policies(id) on delete restrict,
  policy_version integer not null,
  trigger_basis text not null,
  trigger_date date not null,
  retention_period_days integer not null,
  retention_expires_at date not null,
  assignment_source text not null,
  assigned_by varchar(255) not null,
  assigned_at timestamptz not null default now(),
  superseded_at timestamptz,
  reason text
);

create unique index if not exists uq_document_active_retention_assignment
  on public.document_retention_assignments(document_id)
  where superseded_at is null;

create table if not exists public.document_legal_holds (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  reason text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RELEASED')),
  issued_by uuid references public.users(id) on delete set null,
  issued_by_email varchar(255) not null,
  started_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.users(id) on delete set null,
  released_by_email varchar(255),
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_document_active_legal_hold
  on public.document_legal_holds(document_id)
  where status = 'ACTIVE';

create table if not exists public.lifecycle_alert_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  window_days integer not null check (window_days >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(event_type, window_days)
);

insert into public.lifecycle_alert_rules(event_type, window_days)
select event_type, window_days
from (values
  ('RETENTION', 90), ('RETENTION', 30), ('RETENTION', 7),
  ('CONTRACT_EXPIRY', 90), ('CONTRACT_EXPIRY', 60), ('CONTRACT_EXPIRY', 30), ('CONTRACT_EXPIRY', 7),
  ('CONTRACT_RENEWAL', 90), ('CONTRACT_RENEWAL', 60), ('CONTRACT_RENEWAL', 30), ('CONTRACT_RENEWAL', 7),
  ('OBLIGATION', 30), ('OBLIGATION', 7), ('OBLIGATION', 0)
) seed(event_type, window_days)
on conflict do nothing;

create table if not exists public.lifecycle_automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  as_of_date date not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  processed_count integer not null default 0,
  generated_alerts integer not null default 0,
  generated_notifications integer not null default 0,
  error_summary varchar(1000)
);

create index if not exists idx_documents_retention_monitor
  on public.documents(retention_status, retention_expires_at)
  where is_deleted = false;
create index if not exists idx_retention_policy_match
  on public.retention_policies(classification_name, applicable_department, effective_from)
  where active = true and is_deleted = false;
create index if not exists idx_contract_deadline_monitor
  on public.contracts(status, end_date, renewal_notice_date)
  where is_deleted = false;
create index if not exists idx_obligation_deadline_monitor
  on public.contract_obligations(status, due_date)
  where due_date is not null;
create index if not exists idx_lifecycle_runs_job_started
  on public.lifecycle_automation_runs(job_name, started_at desc);

alter table public.retention_policy_versions enable row level security;
alter table public.document_retention_assignments enable row level security;
alter table public.document_legal_holds enable row level security;
alter table public.lifecycle_alert_rules enable row level security;
alter table public.lifecycle_automation_runs enable row level security;

revoke all privileges on table public.retention_policy_versions from anon, authenticated;
revoke all privileges on table public.document_retention_assignments from anon, authenticated;
revoke all privileges on table public.document_legal_holds from anon, authenticated;
revoke all privileges on table public.lifecycle_alert_rules from anon, authenticated;
revoke all privileges on table public.lifecycle_automation_runs from anon, authenticated;

insert into public.retention_policy_versions (
  retention_policy_id, policy_version, name, description, classification_name,
  applicable_department, trigger_basis, retention_period_days, action_on_expiry,
  alert_windows_days, effective_from, effective_to, captured_by
)
select id, policy_version, name, description, classification_name,
       applicable_department, trigger_basis, retention_period_days, action_on_expiry,
       alert_windows_days, effective_from, effective_to, 'PHASE4_MIGRATION'
from public.retention_policies
on conflict do nothing;

create or replace function public.capture_retention_policy_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if row(
    new.name, new.description, new.classification_name, new.applicable_department,
    new.trigger_basis, new.retention_period_days, new.action_on_expiry,
    new.alert_windows_days, new.effective_from, new.effective_to
  ) is distinct from row(
    old.name, old.description, old.classification_name, old.applicable_department,
    old.trigger_basis, old.retention_period_days, old.action_on_expiry,
    old.alert_windows_days, old.effective_from, old.effective_to
  ) then
    new.policy_version := old.policy_version + 1;
  end if;
  return new;
end;
$$;

create or replace function public.persist_retention_policy_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.retention_policy_versions (
    retention_policy_id, policy_version, name, description, classification_name,
    applicable_department, trigger_basis, retention_period_days, action_on_expiry,
    alert_windows_days, effective_from, effective_to, captured_by
  ) values (
    new.id, new.policy_version, new.name, new.description, new.classification_name,
    new.applicable_department, new.trigger_basis, new.retention_period_days,
    new.action_on_expiry, new.alert_windows_days, new.effective_from,
    new.effective_to, coalesce(new.updated_by, new.created_by, 'SYSTEM')
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists retention_policy_increment_version on public.retention_policies;
create trigger retention_policy_increment_version
before update on public.retention_policies
for each row execute function public.capture_retention_policy_version();

drop trigger if exists retention_policy_persist_version on public.retention_policies;
create trigger retention_policy_persist_version
after insert or update on public.retention_policies
for each row execute function public.persist_retention_policy_version();

create or replace function public.phase4_notify_roles(
  p_dedup_key text,
  p_roles text[],
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.employee_notifications (
    recipient_id, title, message, type, related_entity_type, related_entity_id,
    dedup_key, is_read, is_deleted, created_at, created_by
  )
  select distinct u.id, left(p_title, 255), p_message, p_type,
         p_entity_type, p_entity_id, left(p_dedup_key || ':' || u.id::text, 500),
         false, false, timezone('UTC', now()), 'LIFECYCLE_AUTOMATION'
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  where r.name = any(p_roles)
    and u.status = 'ACTIVE'
    and u.is_deleted = false
  on conflict (recipient_id, dedup_key) where dedup_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
    v_notifications := public.phase4_notify_roles(
      p_dedup_key, p_roles, p_title, p_message, p_type, p_entity_type, p_entity_id
    );
  end if;
  return jsonb_build_object('alerts', v_alerts, 'notifications', v_notifications);
end;
$$;

create or replace function public.assign_document_retention(
  p_document_id uuid,
  p_as_of date default (timezone('Asia/Manila', now()))::date,
  p_source text default 'AUTOMATION'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.documents%rowtype;
  v_policy public.retention_policies%rowtype;
  v_trigger date;
  v_expires date;
  v_contract_end date;
  v_event jsonb;
begin
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_doc.is_deleted or v_doc.status not in ('APPROVED', 'ARCHIVED')
     or v_doc.classification_review_status not in ('APPROVED', 'CORRECTED')
     or nullif(trim(v_doc.final_classification), '') is null then
    return jsonb_build_object('assigned', false, 'reason', 'DOCUMENT_NOT_FINALIZED');
  end if;
  if v_doc.retention_policy_id is not null and v_doc.retention_expires_at is not null then
    return jsonb_build_object('assigned', false, 'reason', 'ALREADY_ASSIGNED');
  end if;

  select p.* into v_policy
  from public.retention_policies p
  where p.active = true and p.is_deleted = false
    and upper(p.classification_name) = upper(v_doc.final_classification)
    and (p.applicable_department is null or upper(p.applicable_department) = upper(coalesce(v_doc.department, '')))
    and p.effective_from <= p_as_of
    and (p.effective_to is null or p.effective_to >= p_as_of)
  order by (p.applicable_department is not null) desc, p.policy_version desc, p.effective_from desc
  limit 1;

  if not found then
    update public.documents set retention_status = 'RETENTION_POLICY_REQUIRED',
      updated_at = timezone('UTC', now()), updated_by = 'LIFECYCLE_AUTOMATION'
    where id = p_document_id;
    v_event := public.phase4_emit_alert(
      'RETENTION_POLICY_REQUIRED:' || p_document_id::text,
      'RETENTION_POLICY_REQUIRED', 'WARNING',
      'Retention policy assignment required',
      'A finalized document has no matching active retention policy.',
      'Document', p_document_id::text, null, null,
      array['COMPLIANCE_OFFICER']
    );
    return jsonb_build_object('assigned', false, 'reason', 'RETENTION_POLICY_REQUIRED', 'event', v_event);
  end if;

  if v_policy.trigger_basis = 'CREATION' then
    v_trigger := (v_doc.created_at at time zone 'Asia/Manila')::date;
  elsif v_policy.trigger_basis = 'FINAL_APPROVAL' then
    v_trigger := coalesce((v_doc.classification_reviewed_at at time zone 'Asia/Manila')::date,
                          (v_doc.created_at at time zone 'Asia/Manila')::date);
  elsif v_policy.trigger_basis = 'FISCAL_YEAR_END' then
    v_trigger := make_date(extract(year from coalesce(v_doc.classification_reviewed_at, v_doc.created_at))::integer, 12, 31);
  elsif v_policy.trigger_basis = 'CONTRACT_EXPIRATION' then
    select c.end_date into v_contract_end from public.contracts c
    where c.document_id = p_document_id and c.is_deleted = false
      and c.ai_analysis_review_status in ('APPROVED', 'CORRECTED')
    order by c.end_date desc nulls last limit 1;
    if v_contract_end is null then
      update public.documents set retention_status = 'RETENTION_POLICY_REQUIRED',
        updated_at = timezone('UTC', now()), updated_by = 'LIFECYCLE_AUTOMATION'
      where id = p_document_id;
      v_event := public.phase4_emit_alert(
        'RETENTION_TRIGGER_REQUIRED:' || p_document_id::text,
        'RETENTION_TRIGGER_REQUIRED', 'WARNING',
        'Retention trigger review required',
        'The assigned policy requires an authoritative contract expiration date.',
        'Document', p_document_id::text, null, null, array['COMPLIANCE_OFFICER']
      );
      return jsonb_build_object('assigned', false, 'reason', 'RETENTION_TRIGGER_REQUIRED', 'event', v_event);
    end if;
    v_trigger := v_contract_end;
  end if;

  v_expires := v_trigger + v_policy.retention_period_days;
  update public.document_retention_assignments
  set superseded_at = now(), reason = 'SUPERSEDED_BY_NEW_ASSIGNMENT'
  where document_id = p_document_id and superseded_at is null;
  insert into public.document_retention_assignments (
    document_id, retention_policy_id, policy_version, trigger_basis, trigger_date,
    retention_period_days, retention_expires_at, assignment_source, assigned_by
  ) values (
    p_document_id, v_policy.id, v_policy.policy_version, v_policy.trigger_basis,
    v_trigger, v_policy.retention_period_days, v_expires, p_source, 'LIFECYCLE_AUTOMATION'
  );
  update public.documents set
    retention_policy_id = v_policy.id,
    retention_policy_version = v_policy.policy_version,
    retention_assigned_at = now(),
    retention_assignment_source = p_source,
    retention_calculation_basis = v_policy.trigger_basis,
    retention_trigger_at = v_trigger,
    retention_expires_at = v_expires::timestamp,
    retention_status = case when v_expires <= p_as_of then 'ELIGIBLE_FOR_DISPOSAL' else 'SCHEDULED' end,
    updated_at = timezone('UTC', now()), updated_by = 'LIFECYCLE_AUTOMATION'
  where id = p_document_id;
  return jsonb_build_object(
    'assigned', true, 'policyId', v_policy.id, 'policyVersion', v_policy.policy_version,
    'triggerBasis', v_policy.trigger_basis, 'triggerDate', v_trigger, 'expirationDate', v_expires
  );
end;
$$;

create or replace function public.assign_retention_after_finalization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('APPROVED', 'ARCHIVED')
     and new.classification_review_status in ('APPROVED', 'CORRECTED')
     and new.final_classification is not null
     and (new.retention_policy_id is null or new.retention_expires_at is null)
     and (tg_op = 'INSERT' or old.status is distinct from new.status
          or old.final_classification is distinct from new.final_classification) then
    perform public.assign_document_retention(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists assign_retention_after_finalization on public.documents;
create trigger assign_retention_after_finalization
after insert or update of status, classification_review_status, final_classification on public.documents
for each row execute function public.assign_retention_after_finalization();

create or replace function public.run_phase4_lifecycle_automation(
  p_as_of date default (timezone('Asia/Manila', now()))::date
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_doc record;
  v_contract record;
  v_obligation record;
  v_assignment jsonb;
  v_event jsonb;
  v_window integer;
  v_processed integer := 0;
  v_alerts integer := 0;
  v_notifications integer := 0;
  v_active_hold boolean;
begin
  insert into public.lifecycle_automation_runs(job_name, status, as_of_date)
  values ('phase4-lifecycle-daily', 'RUNNING', p_as_of) returning id into v_run_id;

  begin
    for v_doc in
      select id from public.documents
      where is_deleted = false and status in ('APPROVED', 'ARCHIVED')
        and classification_review_status in ('APPROVED', 'CORRECTED')
        and final_classification is not null
        and (retention_policy_id is null or retention_expires_at is null)
    loop
      v_assignment := public.assign_document_retention(v_doc.id, p_as_of, 'SCHEDULED_AUTOMATION');
      v_processed := v_processed + 1;
      if v_assignment->'event' is not null then
        v_alerts := v_alerts + coalesce((v_assignment->'event'->>'alerts')::integer, 0);
        v_notifications := v_notifications + coalesce((v_assignment->'event'->>'notifications')::integer, 0);
      end if;
    end loop;

    for v_doc in
      select d.id, d.title, d.retention_expires_at::date as deadline
      from public.documents d
      where d.is_deleted = false and d.retention_expires_at is not null
        and d.retention_status not in ('DISPOSED')
    loop
      select exists(select 1 from public.document_legal_holds h where h.document_id = v_doc.id and h.status = 'ACTIVE')
      into v_active_hold;
      v_processed := v_processed + 1;
      if v_active_hold then
        update public.documents set retention_status = 'LEGAL_HOLD', updated_at = timezone('UTC', now()), updated_by = 'LIFECYCLE_AUTOMATION'
        where id = v_doc.id and retention_status <> 'LEGAL_HOLD';
        if v_doc.deadline <= p_as_of then
          v_event := public.phase4_emit_alert(
            'RETENTION_HOLD:' || v_doc.id::text || ':' || v_doc.deadline::text,
            'RETENTION_LEGAL_HOLD', 'WARNING', 'Expired record protected by legal hold',
            'Retention has expired, but an active legal hold blocks disposal.',
            'Document', v_doc.id::text, v_doc.deadline, null,
            array['COMPLIANCE_OFFICER', 'LEGAL_OFFICER', 'LEGAL_COUNSEL']
          );
        else
          continue;
        end if;
      elsif v_doc.deadline <= p_as_of then
        update public.documents set retention_status = 'ELIGIBLE_FOR_DISPOSAL', updated_at = timezone('UTC', now()), updated_by = 'LIFECYCLE_AUTOMATION'
        where id = v_doc.id and retention_status not in ('ELIGIBLE_FOR_DISPOSAL', 'DISPOSED');
        v_event := public.phase4_emit_alert(
          'RETENTION_EXPIRED:' || v_doc.id::text || ':' || v_doc.deadline::text,
          'RETENTION_EXPIRED', 'CRITICAL', 'Retention expired; disposal review required',
          'A retained record is eligible for an authorized disposition review.',
          'Document', v_doc.id::text, v_doc.deadline, 0, array['COMPLIANCE_OFFICER']
        );
      else
        select min(window_days) into v_window from public.lifecycle_alert_rules
        where event_type = 'RETENTION' and enabled = true
          and (v_doc.deadline - p_as_of) <= window_days;
        update public.documents set retention_status = case when v_window is null then 'SCHEDULED' else 'EXPIRING' end,
          updated_at = timezone('UTC', now()), updated_by = 'LIFECYCLE_AUTOMATION'
        where id = v_doc.id and retention_status <> case when v_window is null then 'SCHEDULED' else 'EXPIRING' end;
        if v_window is not null then
          v_event := public.phase4_emit_alert(
            'RETENTION_UPCOMING:' || v_doc.id::text || ':' || v_doc.deadline::text || ':' || v_window::text,
            'RETENTION_EXPIRING', 'WARNING', 'Retention deadline approaching',
            'A retained record is approaching its retention deadline.',
            'Document', v_doc.id::text, v_doc.deadline, v_window, array['COMPLIANCE_OFFICER']
          );
        else
          continue;
        end if;
      end if;
      v_alerts := v_alerts + coalesce((v_event->>'alerts')::integer, 0);
      v_notifications := v_notifications + coalesce((v_event->>'notifications')::integer, 0);
    end loop;

    for v_contract in
      select c.id, c.end_date, c.renewal_notice_date
      from public.contracts c
      where c.is_deleted = false and c.status = 'ACTIVE'
        and c.ai_analysis_review_status in ('APPROVED', 'CORRECTED')
    loop
      v_processed := v_processed + 1;
      if v_contract.end_date is not null and v_contract.end_date < p_as_of then
        update public.contracts set status = 'EXPIRED', updated_at = timezone('UTC', now()), updated_by = 'LIFECYCLE_AUTOMATION'
        where id = v_contract.id and status = 'ACTIVE';
        v_event := public.phase4_emit_alert(
          'CONTRACT_EXPIRED:' || v_contract.id::text || ':' || v_contract.end_date::text,
          'CONTRACT_EXPIRED', 'CRITICAL', 'Contract expired',
          'An active, human-reviewed contract passed its expiration date and is now expired.',
          'Contract', v_contract.id::text, v_contract.end_date, 0,
          array['CONTRACT_OFFICER', 'LEGAL_OFFICER', 'LEGAL_COUNSEL']
        );
        v_alerts := v_alerts + coalesce((v_event->>'alerts')::integer, 0);
        v_notifications := v_notifications + coalesce((v_event->>'notifications')::integer, 0);
      elsif v_contract.end_date is not null then
        select min(window_days) into v_window from public.lifecycle_alert_rules
        where event_type = 'CONTRACT_EXPIRY' and enabled = true and (v_contract.end_date - p_as_of) <= window_days;
        if v_window is not null then
          v_event := public.phase4_emit_alert(
            'CONTRACT_EXPIRY:' || v_contract.id::text || ':' || v_contract.end_date::text || ':' || v_window::text,
            'CONTRACT_EXPIRING', 'WARNING', 'Contract expiration approaching',
            'A human-reviewed active contract is approaching expiration.',
            'Contract', v_contract.id::text, v_contract.end_date, v_window,
            array['CONTRACT_OFFICER', 'LEGAL_OFFICER', 'LEGAL_COUNSEL']
          );
          v_alerts := v_alerts + coalesce((v_event->>'alerts')::integer, 0);
          v_notifications := v_notifications + coalesce((v_event->>'notifications')::integer, 0);
        end if;
      end if;

      if v_contract.renewal_notice_date is not null then
        if v_contract.renewal_notice_date <= p_as_of then v_window := 0;
        else
          select min(window_days) into v_window from public.lifecycle_alert_rules
          where event_type = 'CONTRACT_RENEWAL' and enabled = true
            and (v_contract.renewal_notice_date - p_as_of) <= window_days;
        end if;
        if v_window is not null then
          v_event := public.phase4_emit_alert(
            'CONTRACT_RENEWAL:' || v_contract.id::text || ':' || v_contract.renewal_notice_date::text || ':' || v_window::text,
            case when v_contract.renewal_notice_date < p_as_of then 'RENEWAL_NOTICE_OVERDUE' else 'RENEWAL_NOTICE_APPROACHING' end,
            case when v_contract.renewal_notice_date < p_as_of then 'CRITICAL' else 'WARNING' end,
            'Contract renewal/termination notice requires review',
            'A reviewed contract has an automatic-renewal or notice deadline requiring a human decision.',
            'Contract', v_contract.id::text, v_contract.renewal_notice_date, v_window,
            array['CONTRACT_OFFICER', 'LEGAL_OFFICER', 'LEGAL_COUNSEL']
          );
          v_alerts := v_alerts + coalesce((v_event->>'alerts')::integer, 0);
          v_notifications := v_notifications + coalesce((v_event->>'notifications')::integer, 0);
        end if;
      end if;
    end loop;

    for v_obligation in
      select o.id, o.contract_id, o.due_date, o.status
      from public.contract_obligations o
      join public.contract_ai_analyses a on a.id = o.source_analysis_id
      join public.contracts c on c.id = o.contract_id
      where o.due_date is not null and o.status not in ('COMPLETED', 'WAIVED')
        and a.review_status in ('APPROVED', 'CORRECTED') and c.is_deleted = false
    loop
      v_processed := v_processed + 1;
      if v_obligation.due_date < p_as_of then
        update public.contract_obligations set status = 'OVERDUE', updated_at = now()
        where id = v_obligation.id and status <> 'OVERDUE';
        v_window := 0;
      else
        select min(window_days) into v_window from public.lifecycle_alert_rules
        where event_type = 'OBLIGATION' and enabled = true and (v_obligation.due_date - p_as_of) <= window_days;
      end if;
      if v_window is not null then
        v_event := public.phase4_emit_alert(
          'OBLIGATION:' || v_obligation.id::text || ':' || v_obligation.due_date::text || ':' || v_window::text,
          case when v_obligation.due_date < p_as_of then 'OBLIGATION_OVERDUE'
               when v_obligation.due_date = p_as_of then 'OBLIGATION_DUE' else 'OBLIGATION_UPCOMING' end,
          case when v_obligation.due_date < p_as_of then 'CRITICAL' else 'WARNING' end,
          'Contract obligation deadline requires attention',
          'An approved contract obligation is due soon or overdue.',
          'ContractObligation', v_obligation.id::text, v_obligation.due_date, v_window,
          array['CONTRACT_OFFICER']
        );
        v_alerts := v_alerts + coalesce((v_event->>'alerts')::integer, 0);
        v_notifications := v_notifications + coalesce((v_event->>'notifications')::integer, 0);
      end if;
    end loop;

    update public.lifecycle_automation_runs set status = 'SUCCEEDED', completed_at = now(),
      processed_count = v_processed, generated_alerts = v_alerts,
      generated_notifications = v_notifications
    where id = v_run_id;
  exception when others then
    update public.lifecycle_automation_runs set status = 'FAILED', completed_at = now(),
      processed_count = 0, generated_alerts = 0, generated_notifications = 0,
      error_summary = left(sqlstate || ': ' || sqlerrm, 1000)
    where id = v_run_id;
    return jsonb_build_object('runId', v_run_id, 'status', 'FAILED', 'error', left(sqlstate || ': ' || sqlerrm, 1000));
  end;

  return jsonb_build_object('runId', v_run_id, 'status', 'SUCCEEDED',
    'processed', v_processed, 'alerts', v_alerts, 'notifications', v_notifications,
    'asOfDate', p_as_of);
end;
$$;

revoke all on function public.capture_retention_policy_version() from public, anon, authenticated;
revoke all on function public.persist_retention_policy_version() from public, anon, authenticated;
revoke all on function public.phase4_notify_roles(text, text[], text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.phase4_emit_alert(text, text, text, text, text, text, text, date, integer, text[]) from public, anon, authenticated;
revoke all on function public.assign_document_retention(uuid, date, text) from public, anon, authenticated;
revoke all on function public.assign_retention_after_finalization() from public, anon, authenticated;
revoke all on function public.run_phase4_lifecycle_automation(date) from public, anon, authenticated;
grant execute on function public.capture_retention_policy_version() to postgres, service_role;
grant execute on function public.persist_retention_policy_version() to postgres, service_role;
grant execute on function public.phase4_notify_roles(text, text[], text, text, text, text, text) to postgres, service_role;
grant execute on function public.phase4_emit_alert(text, text, text, text, text, text, text, date, integer, text[]) to postgres, service_role;
grant execute on function public.assign_document_retention(uuid, date, text) to postgres, service_role;
grant execute on function public.assign_retention_after_finalization() to postgres, service_role;
grant execute on function public.run_phase4_lifecycle_automation(date) to postgres, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'compliance_alerts', 'disposal_requests', 'document_legal_holds',
    'contract_obligations', 'lifecycle_automation_runs'
  ] loop
    execute format('drop trigger if exists emit_realtime_event on public.%I', v_table);
    execute format(
      'create trigger emit_realtime_event after insert or update or delete on public.%I for each row execute function public.emit_realtime_event()',
      v_table
    );
  end loop;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'phase4-lifecycle-daily';

select cron.schedule(
  'phase4-lifecycle-daily',
  '0 16 * * *',
  'select public.run_phase4_lifecycle_automation((timezone(''Asia/Manila'', now()))::date);'
);

comment on function public.run_phase4_lifecycle_automation(date) is
  'Idempotent daily lifecycle monitor. pg_cron 16:00 UTC equals 00:00 Asia/Manila.';
comment on table public.document_retention_assignments is
  'Immutable retention assignment snapshots preserving applied policy version and calculation basis.';
comment on table public.document_legal_holds is
  'Explicit legal holds. Only an authorized human action may release an active hold.';
