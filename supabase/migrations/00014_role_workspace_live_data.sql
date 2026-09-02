-- Live operational data for the PDF-defined role workspaces.

alter table public.hub_inventory_assets
  add column if not exists unit_price numeric(14, 2) not null default 0,
  add column if not exists supplier_name text;

alter table public.facility_compliance_documents
  add column if not exists document_category text,
  add column if not exists routed_to_role text;

alter table public.facility_compliance_documents
  drop constraint if exists chk_facility_document_status;

alter table public.facility_compliance_documents
  add constraint chk_facility_document_status check (
    review_status in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CRITICAL_RENEWAL')
  );

create table if not exists public.facility_permits (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facilities(id) on delete set null,
  hub_name text not null,
  permit_type text not null,
  permit_number text,
  expiration_date date not null,
  status text not null default 'ACTIVE',
  tracking_officer_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint uq_facility_permit unique (hub_name, permit_type),
  constraint chk_facility_permit_status check (status in ('ACTIVE', 'WATCH', 'CRITICAL', 'EXPIRED', 'RENEWED'))
);

create index if not exists idx_facility_permits_expiration
  on public.facility_permits(expiration_date, status);

create table if not exists public.vendor_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null,
  contract_title text not null,
  sec_dti_registered boolean not null,
  bir_clearance_submitted boolean not null,
  aml_watchlist_cleared boolean not null,
  justification text,
  risk_level text not null,
  status text not null,
  assessed_by uuid references public.users(id) on delete set null,
  assessed_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint uq_vendor_risk_assessment unique (vendor_name, contract_title),
  constraint chk_vendor_risk_level check (risk_level in ('LOW', 'MEDIUM', 'HIGH')),
  constraint chk_vendor_risk_status check (status in ('APPROVED_FOR_SIGNING', 'FLAGGED_HOLD')),
  constraint chk_vendor_hold_justification check (
    status <> 'FLAGGED_HOLD' or length(btrim(coalesce(justification, ''))) >= 10
  )
);

create index if not exists idx_vendor_risk_status
  on public.vendor_risk_assessments(status, risk_level);

create table if not exists public.compliance_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_reference text not null unique,
  hub_name text not null,
  violation_category text not null,
  severity text not null,
  status text not null default 'OPEN',
  assigned_to uuid references public.users(id) on delete set null,
  statutory_deadline timestamptz,
  remediation_directives text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_compliance_incident_severity check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  constraint chk_compliance_incident_status check (status in ('OPEN', 'UNDER_INVESTIGATION', 'RESOLVED'))
);

create index if not exists idx_compliance_incidents_status
  on public.compliance_incidents(status, severity, statutory_deadline);

create table if not exists public.management_signoffs (
  id uuid primary key default gen_random_uuid(),
  signoff_reference text not null unique,
  item_type text not null,
  item_title text not null,
  submitted_by uuid references public.users(id) on delete set null,
  status text not null default 'AWAITING_MANAGER_SIGNOFF',
  manager_comments text,
  decided_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint chk_management_signoff_status check (
    status in ('AWAITING_MANAGER_SIGNOFF', 'MANAGER_APPROVED', 'REJECTED_REVISION')
  )
);

create index if not exists idx_management_signoffs_status
  on public.management_signoffs(status, submitted_at desc);

create table if not exists public.facility_data_logs (
  id uuid primary key default gen_random_uuid(),
  external_reference text not null unique,
  data_category text not null,
  raw_pii_json jsonb not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  anonymized_at timestamptz,
  constraint chk_facility_data_status check (status in ('ACTIVE', 'ANONYMIZED', 'PURGED'))
);

create index if not exists idx_facility_data_retention
  on public.facility_data_logs(data_category, created_at, status);

create table if not exists public.privacy_breach_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_reference text not null unique,
  title text not null,
  facility_name text,
  discovered_at timestamptz not null,
  notification_due_at timestamptz not null,
  severity text not null,
  status text not null default 'ASSESSING',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_privacy_breach_severity check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  constraint chk_privacy_breach_status check (status in ('ASSESSING', 'NOTIFICATION_DRAFTED', 'REPORTED', 'CLOSED'))
);

create index if not exists idx_privacy_breach_due
  on public.privacy_breach_incidents(status, notification_due_at);

create table if not exists public.security_role_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_reference text not null unique,
  security_domain text not null,
  title text not null,
  facility_name text,
  severity text not null,
  status text not null default 'OPEN',
  owner_user_id uuid references public.users(id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_security_domain check (security_domain in ('PHYSICAL', 'INFORMATION_SECURITY')),
  constraint chk_security_role_severity check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  constraint chk_security_role_status check (status in ('OPEN', 'CONTAINED', 'MITIGATING', 'RESOLVED'))
);

create index if not exists idx_security_role_incidents
  on public.security_role_incidents(security_domain, status, severity);

create table if not exists public.department_approvals (
  id uuid primary key default gen_random_uuid(),
  approval_reference text not null unique,
  department_name text not null,
  request_type text not null,
  request_title text not null,
  submitted_by uuid references public.users(id) on delete set null,
  status text not null default 'PENDING_DEPARTMENT_HEAD',
  decision_comments text,
  decided_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint chk_department_approval_status check (
    status in ('PENDING_DEPARTMENT_HEAD', 'APPROVED', 'RETURNED', 'REJECTED')
  )
);

create index if not exists idx_department_approvals_status
  on public.department_approvals(department_name, status, submitted_at desc);

create table if not exists public.governance_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null,
  category text not null,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.facility_reorder_requests (
  id uuid primary key default gen_random_uuid(),
  inventory_asset_id uuid not null references public.hub_inventory_assets(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  supplier_name text,
  requested_quantity integer not null,
  status text not null default 'PENDING_PROCUREMENT',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint chk_reorder_quantity check (requested_quantity > 0),
  constraint chk_reorder_status check (status in ('PENDING_PROCUREMENT', 'ORDERED', 'RECEIVED', 'CANCELLED'))
);

create unique index if not exists uq_active_inventory_reorder
  on public.facility_reorder_requests(inventory_asset_id)
  where status in ('PENDING_PROCUREMENT', 'ORDERED');

create or replace function public.refresh_facility_permit_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.facility_permits
  set status = case
      when expiration_date < current_date then 'EXPIRED'
      when expiration_date <= current_date + 30 then 'CRITICAL'
      when expiration_date <= current_date + 90 then 'WATCH'
      else 'ACTIVE'
    end,
    updated_at = now()
  where status <> 'RENEWED';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_facility_permit_statuses() from public;

insert into public.retention_policies (
  name, description, retention_period_days, action_on_expiry, active, is_deleted, created_at
)
values
  ('CCTV_FOOTAGE', 'Facility CCTV footage retained for 30 days under privacy policy.', 30, 'PERMANENT_DELETE', true, false, now()),
  ('HUB_VISITOR_LOGS', 'Visitor identity logs retained for 90 days and then anonymized.', 90, 'ANONYMIZE', true, false, now()),
  ('FAILED_DRIVER_DOCUMENTS', 'Rejected driver onboarding documents retained for one year.', 365, 'PERMANENT_DELETE', true, false, now()),
  ('RESIGNED_EMPLOYEE_LABOR_RECORDS', 'Labor records retained for three years.', 1095, 'PERMANENT_DELETE', true, false, now())
on conflict (name) do update set
  description = excluded.description,
  retention_period_days = excluded.retention_period_days,
  action_on_expiry = excluded.action_on_expiry,
  active = true,
  is_deleted = false,
  updated_at = now();

insert into public.hub_inventory_assets (
  facility_id, sku, asset_name, category, current_stock, low_stock_threshold,
  unit, unit_price, supplier_name, created_at
)
select facility.id, seed.sku, seed.asset_name, seed.category, seed.current_stock,
       seed.low_stock_threshold, seed.unit, seed.unit_price, seed.supplier_name, now()
from (select id from public.facilities where coalesce(is_deleted, false) = false order by created_at limit 1) facility
cross join (values
  ('WELCOME-KIT', 'Driver Welcome Kits', 'ONBOARDING_MERCHANDISE', 12, 20, 'kit', 850.00, 'Metro Mobility Supplies'),
  ('BODY-DECAL', 'Vehicle Body Decals', 'BRANDING', 8, 15, 'set', 320.00, 'SignalMark Graphics'),
  ('DELIVERY-BAG', 'Insulated Delivery Bags', 'DRIVER_EQUIPMENT', 54, 20, 'bag', 1250.00, 'Transit Gear PH')
) as seed(sku, asset_name, category, current_stock, low_stock_threshold, unit, unit_price, supplier_name)
on conflict (facility_id, sku) do update set
  asset_name = excluded.asset_name,
  category = excluded.category,
  current_stock = excluded.current_stock,
  low_stock_threshold = excluded.low_stock_threshold,
  unit = excluded.unit,
  unit_price = excluded.unit_price,
  supplier_name = excluded.supplier_name,
  updated_at = now();

insert into public.facility_permits (
  facility_id, hub_name, permit_type, permit_number, expiration_date, tracking_officer_id
)
select facility.id, coalesce(facility.name, 'Metro Driver Onboarding Hub'), seed.permit_type,
       seed.permit_number, current_date + seed.days_until_expiry, officer.id
from (select id, name from public.facilities where coalesce(is_deleted, false) = false order by created_at limit 1) facility
cross join (values
  ('Fire Safety Clearance', 'FSC-2026-1842', 18),
  ('Mayor''s Business Permit', 'MBP-2026-0431', 58),
  ('Sanitary Certificate', 'SAN-2026-7712', 124)
) as seed(permit_type, permit_number, days_until_expiry)
left join public.users officer on lower(officer.email) = 'co@photonicomega.com'
on conflict (hub_name, permit_type) do update set
  facility_id = excluded.facility_id,
  permit_number = excluded.permit_number,
  expiration_date = excluded.expiration_date,
  tracking_officer_id = excluded.tracking_officer_id,
  updated_at = now();

select public.refresh_facility_permit_statuses();

insert into public.vendor_risk_assessments (
  vendor_name, contract_title, sec_dti_registered, bir_clearance_submitted,
  aml_watchlist_cleared, justification, risk_level, status, assessed_by
)
select seed.vendor_name, seed.contract_title, seed.sec_ok, seed.bir_ok, seed.aml_ok,
       seed.justification, seed.risk_level, seed.status, officer.id
from (values
  ('Metro Shield Security', 'Regional Hub Guard Detachment', true, true, true, null, 'LOW', 'APPROVED_FOR_SIGNING'),
  ('QuickBuild Renovations', 'Quezon City Hub Renovation', true, false, true,
   'BIR tax clearance is pending validation before the contract can proceed.', 'HIGH', 'FLAGGED_HOLD')
) as seed(vendor_name, contract_title, sec_ok, bir_ok, aml_ok, justification, risk_level, status)
left join public.users officer on lower(officer.email) = 'co@photonicomega.com'
on conflict (vendor_name, contract_title) do update set
  sec_dti_registered = excluded.sec_dti_registered,
  bir_clearance_submitted = excluded.bir_clearance_submitted,
  aml_watchlist_cleared = excluded.aml_watchlist_cleared,
  justification = excluded.justification,
  risk_level = excluded.risk_level,
  status = excluded.status,
  assessed_by = excluded.assessed_by,
  updated_at = now();

insert into public.compliance_incidents (
  incident_reference, hub_name, violation_category, severity, status,
  assigned_to, statutory_deadline, remediation_directives
)
select seed.reference, seed.hub_name, seed.category, seed.severity, seed.status,
       officer.id, now() + seed.deadline_interval, seed.directive
from (values
  ('EHS-2026-0041', 'Metro Driver Onboarding Hub', 'EHS Safety Violation', 'HIGH', 'UNDER_INVESTIGATION', interval '5 days', 'Reduce queue density and install temporary barriers.'),
  ('LTFRB-2026-0118', 'Corporate Operations', 'LTFRB Franchise Directive', 'CRITICAL', 'OPEN', interval '3 days', 'Assess affected hubs and prepare mandated action response.')
) as seed(reference, hub_name, category, severity, status, deadline_interval, directive)
left join public.users officer on lower(officer.email) = 'co@photonicomega.com'
on conflict (incident_reference) do update set
  hub_name = excluded.hub_name,
  violation_category = excluded.violation_category,
  severity = excluded.severity,
  status = excluded.status,
  assigned_to = excluded.assigned_to,
  statutory_deadline = excluded.statutory_deadline,
  remediation_directives = excluded.remediation_directives,
  updated_at = now();

insert into public.management_signoffs (
  signoff_reference, item_type, item_title, submitted_by, status, submitted_at
)
select seed.reference, seed.item_type, seed.item_title, officer.id,
       'AWAITING_MANAGER_SIGNOFF', now() - seed.age
from (values
  ('MS-2026-0091', 'VENDOR_CONTRACT_APPROVAL', 'Regional Hub Guard Detachment', interval '4 hours'),
  ('MS-2026-0092', 'CRITICAL_PERMIT_OVERRIDE', 'Metro Hub Fire Clearance Renewal', interval '1 day')
) as seed(reference, item_type, item_title, age)
left join public.users officer on lower(officer.email) = 'co@photonicomega.com'
on conflict (signoff_reference) do nothing;

insert into public.legal_contract_workflows (
  contract_id, state, submitted_by, submitted_at, created_at
)
select contract_row.id,
       case when row_number() over (order by contract_row.created_at, contract_row.id) = 1
            then 'PENDING_COUNSEL_REVIEW' else 'DRAFT' end,
       legal_officer.id,
       case when row_number() over (order by contract_row.created_at, contract_row.id) = 1
            then now() - interval '6 hours' else null end,
       now()
from public.contracts contract_row
left join public.users legal_officer on lower(legal_officer.email) = 'legal.officer@photonicomega.com'
where coalesce(contract_row.is_deleted, false) = false
on conflict (contract_id) do nothing;

insert into public.records_archives (
  document_id, retention_policy_id, archive_status, metadata, checksum,
  custodian_user_id, vaulted_at, retention_expires_at, created_at
)
select document_row.id,
       policy.id,
       case when row_number() over (order by document_row.created_at, document_row.id) = 1
            then 'VAULTED' else 'PENDING_VALIDATION' end,
       jsonb_build_object(
         'document_title', document_row.title,
         'file_name', document_row.file_name,
         'source_module', coalesce(document_row.owning_module, 'DOCUMENTS')
       ),
       md5(document_row.id::text || coalesce(document_row.file_name, '')),
       records_officer.id,
       case when row_number() over (order by document_row.created_at, document_row.id) = 1
            then now() - interval '2 days' else null end,
       now() + interval '365 days',
       now()
from public.documents document_row
left join public.retention_policies policy on policy.name = 'FAILED_DRIVER_DOCUMENTS'
left join public.users records_officer on lower(records_officer.email) = 'records@photonicomega.com'
where coalesce(document_row.is_deleted, false) = false
order by document_row.created_at, document_row.id
limit 4
on conflict (document_id) do nothing;

insert into public.data_subject_requests (
  request_reference, request_type, requester_name, requester_email,
  status, assigned_to, due_at, created_at
)
select seed.reference, seed.request_type, seed.requester_name, seed.requester_email,
       seed.status, dpo.id, now() + seed.due_interval, now() - seed.age
from (values
  ('DSR-2026-0181', 'ACCESS', 'Miguel Santos', 'miguel.santos@example.test', 'IN_PROGRESS', interval '6 days', interval '24 days'),
  ('DSR-2026-0182', 'DELETION', 'Ana Reyes', 'ana.reyes@example.test', 'IDENTITY_VERIFICATION', interval '18 days', interval '12 days')
) as seed(reference, request_type, requester_name, requester_email, status, due_interval, age)
left join public.users dpo on lower(dpo.email) = 'dpo@photonicomega.com'
on conflict (request_reference) do update set
  status = excluded.status,
  assigned_to = excluded.assigned_to,
  due_at = excluded.due_at,
  updated_at = now();

insert into public.facility_data_logs (
  external_reference, data_category, raw_pii_json, status, created_at
)
values
  ('VISITOR-LOG-0001', 'HUB_VISITOR_LOGS',
   '{"name":"Carlos Mendoza","phone":"09171234123","address":"Quezon City","purpose":"Driver onboarding"}'::jsonb,
   'ACTIVE', now() - interval '12 days'),
  ('VISITOR-LOG-0002', 'HUB_VISITOR_LOGS',
   '{"name":"Patricia Lim","phone":"09981234987","address":"Makati City","purpose":"Document resubmission"}'::jsonb,
   'ACTIVE', now() - interval '88 days'),
  ('CCTV-LOG-0001', 'CCTV_FOOTAGE',
   '{"subject":"Hub entrance camera","phone":null,"address":"Metro Driver Onboarding Hub"}'::jsonb,
   'ACTIVE', now() - interval '28 days')
on conflict (external_reference) do update set
  data_category = excluded.data_category,
  raw_pii_json = excluded.raw_pii_json,
  status = excluded.status,
  created_at = excluded.created_at;

insert into public.cctv_export_requests (
  facility_id, requested_by, purpose, footage_start_at, footage_end_at,
  status, expires_at, created_at
)
select facility.id, manager.id, 'Investigate reported theft at the driver onboarding front desk.',
       now() - interval '2 days 20 minutes', now() - interval '2 days',
       'PENDING_PRIVACY_APPROVAL', now() + interval '5 days', now() - interval '4 hours'
from (select id from public.facilities where coalesce(is_deleted, false) = false order by created_at limit 1) facility
cross join (select id from public.users where lower(email) = 'fm@photonicomega.com' limit 1) manager
where not exists (
  select 1 from public.cctv_export_requests request_row
  where request_row.purpose = 'Investigate reported theft at the driver onboarding front desk.'
);

insert into public.privacy_breach_incidents (
  incident_reference, title, facility_name, discovered_at, notification_due_at,
  severity, status, description
)
values (
  'NPC-2026-0031', 'Lost onboarding laptop containing driver application files',
  'Metro Driver Onboarding Hub', now() - interval '19 hours', now() + interval '53 hours',
  'HIGH', 'ASSESSING',
  'A managed laptop assigned to the onboarding desk was reported missing during shift turnover.'
)
on conflict (incident_reference) do update set
  title = excluded.title,
  facility_name = excluded.facility_name,
  discovered_at = excluded.discovered_at,
  notification_due_at = excluded.notification_due_at,
  severity = excluded.severity,
  status = excluded.status,
  description = excluded.description,
  updated_at = now();

insert into public.security_role_incidents (
  incident_reference, security_domain, title, facility_name, severity, status,
  owner_user_id, description
)
select seed.reference, seed.domain, seed.title, seed.facility_name, seed.severity,
       seed.status, owner.id, seed.description
from (values
  ('PHY-2026-0028', 'PHYSICAL', 'Unauthorized tailgating at restricted archive room', 'Metro Driver Onboarding Hub', 'HIGH', 'OPEN', 'Badge access footage requires officer review.'),
  ('INF-2026-0063', 'INFORMATION_SECURITY', 'Repeated privileged login failures', 'Cloud Administration', 'CRITICAL', 'MITIGATING', 'Privileged identity access is temporarily restricted pending review.')
) as seed(reference, domain, title, facility_name, severity, status, description)
left join public.users owner on lower(owner.email) = case
  when seed.domain = 'PHYSICAL' then 'security@photonicomega.com'
  else 'infosec@photonicomega.com'
end
on conflict (incident_reference) do update set
  severity = excluded.severity,
  status = excluded.status,
  owner_user_id = excluded.owner_user_id,
  description = excluded.description,
  updated_at = now();

insert into public.department_approvals (
  approval_reference, department_name, request_type, request_title,
  submitted_by, status, submitted_at
)
select seed.reference, seed.department_name, seed.request_type, seed.title,
       submitter.id, 'PENDING_DEPARTMENT_HEAD', now() - seed.age
from (values
  ('DA-2026-0101', 'Compliance', 'MANAGEMENT_EXCEPTION', 'Critical permit renewal resource override', 'compliance.manager@photonicomega.com', interval '5 hours'),
  ('DA-2026-0102', 'Facilities', 'CAPACITY_OVERRIDE', 'Temporary counter expansion for peak driver onboarding', 'fm@photonicomega.com', interval '1 day')
) as seed(reference, department_name, request_type, title, submitter_email, age)
left join public.users submitter on lower(submitter.email) = seed.submitter_email
on conflict (approval_reference) do nothing;

insert into public.department_scope_assignments (
  department_head_user_id, department_name, can_approve, can_shadow, created_at
)
select department_head.id, seed.department_name, true, false, now()
from public.users department_head
cross join (values ('Compliance'), ('Facilities'), ('Legal'), ('Security')) as seed(department_name)
where lower(department_head.email) = 'dept.head@photonicomega.com'
on conflict (department_head_user_id, department_name) do update set can_approve = true;

insert into public.governance_settings (setting_key, setting_value, category, updated_by)
select seed.setting_key, seed.setting_value, seed.category, manager.id
from (values
  ('compliance.permit_critical_days', '{"days":30}'::jsonb, 'COMPLIANCE'),
  ('compliance.vendor_risk_requires_all_checks', '{"enabled":true}'::jsonb, 'COMPLIANCE'),
  ('privacy.default_masking', '{"enabled":true,"fields":["name","phone","address"]}'::jsonb, 'PRIVACY'),
  ('records.dual_custody_disposal', '{"enabled":true}'::jsonb, 'RECORDS')
) as seed(setting_key, setting_value, category)
left join public.users manager on lower(manager.email) = 'compliance.manager@photonicomega.com'
on conflict (setting_key) do update set
  setting_value = excluded.setting_value,
  category = excluded.category,
  updated_by = excluded.updated_by,
  updated_at = now();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'facility_permits', 'vendor_risk_assessments', 'compliance_incidents',
    'management_signoffs', 'facility_data_logs', 'privacy_breach_incidents',
    'security_role_incidents', 'department_approvals', 'governance_settings',
    'facility_reorder_requests'
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
    'facility_permits', 'vendor_risk_assessments', 'compliance_incidents',
    'management_signoffs', 'facility_data_logs', 'privacy_breach_incidents',
    'security_role_incidents', 'department_approvals', 'governance_settings',
    'facility_reorder_requests'
  ] loop
    execute format('drop trigger if exists emit_realtime_event on public.%I', table_name);
    execute format(
      'create trigger emit_realtime_event after insert or update or delete on public.%I for each row execute function public.emit_realtime_event()',
      table_name
    );
  end loop;
end $$;
