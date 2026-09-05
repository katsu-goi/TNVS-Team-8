-- =============================================================
-- Shared workflow primitives from the role specification PDFs.
-- =============================================================

alter table public.facilities
  add column if not exists hub_code text,
  add column if not exists region text,
  add column if not exists daily_driver_capacity integer,
  add column if not exists active_queue_count integer not null default 0;
create unique index if not exists uq_facilities_hub_code
  on public.facilities(hub_code)
  where hub_code is not null;
create table if not exists public.hub_inventory_assets (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  sku text not null,
  asset_name text not null,
  category text not null,
  current_stock integer not null default 0,
  low_stock_threshold integer not null default 0,
  unit text not null default 'item',
  status text generated always as (
    case when current_stock <= low_stock_threshold then 'CRITICAL_REORDER' else 'AVAILABLE' end
  ) stored,
  last_restocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_hub_inventory_stock check (current_stock >= 0),
  constraint chk_hub_inventory_threshold check (low_stock_threshold >= 0),
  constraint uq_hub_inventory_sku unique (facility_id, sku)
);
create index if not exists idx_hub_inventory_reorder
  on public.hub_inventory_assets(facility_id, current_stock, low_stock_threshold);
create table if not exists public.facility_compliance_documents (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  document_type text not null,
  permit_number text,
  review_status text not null default 'DRAFT',
  expires_on date,
  submitted_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  review_comments text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_facility_document_status check (
    review_status in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED')
  )
);
create index if not exists idx_facility_documents_review
  on public.facility_compliance_documents(review_status, expires_on);
create table if not exists public.legal_contract_workflows (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references public.contracts(id) on delete cascade,
  state text not null default 'DRAFT',
  locked boolean generated always as (
    state in ('PENDING_COUNSEL_REVIEW', 'COUNSEL_APPROVED')
  ) stored,
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  counsel_comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_legal_contract_state check (
    state in ('DRAFT', 'PENDING_COUNSEL_REVIEW', 'COUNSEL_APPROVED', 'REJECTED_REVISION')
  ),
  constraint chk_legal_rejection_comment check (
    state <> 'REJECTED_REVISION' or length(btrim(coalesce(counsel_comments, ''))) >= 5
  )
);
create index if not exists idx_legal_contract_workflow_state
  on public.legal_contract_workflows(state, submitted_at);
create table if not exists public.records_archives (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete restrict,
  retention_policy_id uuid references public.retention_policies(id) on delete set null,
  archive_status text not null default 'PENDING_VALIDATION',
  metadata jsonb not null default '{}'::jsonb,
  checksum text,
  custodian_user_id uuid references public.users(id) on delete set null,
  vaulted_at timestamptz,
  retention_expires_at timestamptz,
  disposal_authorized_by uuid references public.users(id) on delete set null,
  disposal_authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_records_archive_status check (
    archive_status in ('PENDING_VALIDATION', 'VAULTED', 'EXPIRED', 'DISPOSAL_AUTHORIZED', 'DISPOSED')
  )
);
create index if not exists idx_records_archives_status_expiry
  on public.records_archives(archive_status, retention_expires_at);
create table if not exists public.records_custody_events (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.records_archives(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  source_ip varchar(45),
  occurred_at timestamptz not null default now()
);
create index if not exists idx_records_custody_archive_time
  on public.records_custody_events(archive_id, occurred_at desc);
create table if not exists public.privacy_reveal_audits (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users(id) on delete restrict,
  subject_type text not null,
  subject_id text not null,
  fields_revealed text[] not null,
  justification text not null,
  source_ip varchar(45),
  occurred_at timestamptz not null default now(),
  constraint chk_privacy_reveal_justification check (length(btrim(justification)) >= 10)
);
create index if not exists idx_privacy_reveal_subject_time
  on public.privacy_reveal_audits(subject_type, subject_id, occurred_at desc);
create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  request_type text not null,
  requester_name text not null,
  requester_email text not null,
  status text not null default 'RECEIVED',
  assigned_to uuid references public.users(id) on delete set null,
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_dsr_type check (
    request_type in ('ACCESS', 'CORRECTION', 'DELETION', 'PORTABILITY', 'OBJECTION')
  ),
  constraint chk_dsr_status check (
    status in ('RECEIVED', 'IDENTITY_VERIFICATION', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')
  )
);
create index if not exists idx_dsr_status_due
  on public.data_subject_requests(status, due_at);
create table if not exists public.cctv_export_requests (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facilities(id) on delete set null,
  requested_by uuid not null references public.users(id) on delete restrict,
  privacy_approved_by uuid references public.users(id) on delete set null,
  custody_approved_by uuid references public.users(id) on delete set null,
  purpose text not null,
  footage_start_at timestamptz not null,
  footage_end_at timestamptz not null,
  status text not null default 'PENDING_PRIVACY_APPROVAL',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_cctv_export_window check (footage_end_at > footage_start_at),
  constraint chk_cctv_export_status check (
    status in ('PENDING_PRIVACY_APPROVAL', 'PENDING_CUSTODY_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED')
  ),
  constraint chk_cctv_dual_custody check (
    status <> 'APPROVED'
    or (
      privacy_approved_by is not null
      and custody_approved_by is not null
      and privacy_approved_by <> custody_approved_by
    )
  )
);
create index if not exists idx_cctv_export_status
  on public.cctv_export_requests(status, created_at desc);
create table if not exists public.department_scope_assignments (
  id uuid primary key default gen_random_uuid(),
  department_head_user_id uuid not null references public.users(id) on delete cascade,
  department_name text not null,
  can_approve boolean not null default true,
  can_shadow boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_department_head_scope unique (department_head_user_id, department_name)
);
create or replace function public.enforce_legal_contract_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.state = new.state then
    if old.state = 'COUNSEL_APPROVED' and new is distinct from old then
      raise exception 'approved legal workflows are immutable';
    end if;
    return new;
  end if;

  if old.state = 'DRAFT' and new.state = 'PENDING_COUNSEL_REVIEW' then
    return new;
  end if;
  if old.state = 'PENDING_COUNSEL_REVIEW'
     and new.state in ('COUNSEL_APPROVED', 'REJECTED_REVISION') then
    return new;
  end if;
  if old.state = 'REJECTED_REVISION' and new.state = 'DRAFT' then
    return new;
  end if;

  raise exception 'invalid legal workflow transition: % -> %', old.state, new.state;
end;
$$;
drop trigger if exists enforce_legal_contract_transition on public.legal_contract_workflows;
create trigger enforce_legal_contract_transition
before update on public.legal_contract_workflows
for each row execute function public.enforce_legal_contract_transition();
create or replace function public.reject_immutable_workflow_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'workflow audit records are immutable';
end;
$$;
revoke all on function public.reject_immutable_workflow_log_change() from public;
drop trigger if exists protect_records_custody_events on public.records_custody_events;
create trigger protect_records_custody_events
before update or delete on public.records_custody_events
for each row execute function public.reject_immutable_workflow_log_change();
drop trigger if exists protect_privacy_reveal_audits on public.privacy_reveal_audits;
create trigger protect_privacy_reveal_audits
before update or delete on public.privacy_reveal_audits
for each row execute function public.reject_immutable_workflow_log_change();
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hub_inventory_assets', 'facility_compliance_documents',
    'legal_contract_workflows', 'records_archives',
    'records_custody_events', 'privacy_reveal_audits',
    'data_subject_requests', 'cctv_export_requests',
    'department_scope_assignments'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;
do $$
declare
  table_name text;
begin
  if to_regprocedure('public.emit_realtime_event()') is null then
    return;
  end if;

  foreach table_name in array array[
    'hub_inventory_assets', 'facility_compliance_documents',
    'legal_contract_workflows', 'records_archives',
    'data_subject_requests', 'cctv_export_requests'
  ] loop
    execute format('drop trigger if exists emit_realtime_event on public.%I', table_name);
    execute format(
      'create trigger emit_realtime_event after insert or update or delete on public.%I for each row execute function public.emit_realtime_event()',
      table_name
    );
  end loop;
end $$;
