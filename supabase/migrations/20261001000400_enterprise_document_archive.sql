-- Enterprise Document Archive: authoritative departments, granular document
-- permissions, and audited access requests. Existing document, Storage, OCR,
-- AI, duplicate, retention, and grant tables remain canonical.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  code text,
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  source text not null default 'LOCAL' check (source in ('LOCAL', 'LEGACY_DERIVED', 'INTEGRATION')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create unique index if not exists uq_departments_name_active
  on public.departments(lower(name)) where is_deleted = false;
create unique index if not exists uq_departments_external_id
  on public.departments(external_id) where external_id is not null and is_deleted = false;
create index if not exists idx_departments_status on public.departments(status) where is_deleted = false;

alter table public.users add column if not exists department_id uuid;
alter table public.documents add column if not exists department_id uuid;
alter table public.documents add column if not exists pre_archive_status text;

alter table public.documents drop constraint if exists ck_documents_pre_archive_status;
alter table public.documents add constraint ck_documents_pre_archive_status check (
  pre_archive_status is null or pre_archive_status in ('DRAFT', 'PENDING_REVIEW', 'APPROVED')
);

insert into public.departments(name, status, source)
select distinct source_name, 'ACTIVE', 'LEGACY_DERIVED'
from (
  select trim(department) source_name from public.users
  where is_deleted = false and nullif(trim(coalesce(department, '')), '') is not null
  union
  select trim(department) source_name from public.documents
  where is_deleted = false and nullif(trim(coalesce(department, '')), '') is not null
) source_departments
where not exists (
  select 1 from public.departments existing
  where existing.is_deleted = false and lower(existing.name) = lower(source_departments.source_name)
);

update public.users app_user
set department_id = department_row.id
from public.departments department_row
where app_user.department_id is null
  and app_user.is_deleted = false
  and department_row.is_deleted = false
  and lower(department_row.name) = lower(trim(app_user.department));

update public.documents document_row
set department_id = department_ref.id
from public.departments department_ref
where document_row.department_id is null
  and document_row.is_deleted = false
  and department_ref.is_deleted = false
  and lower(department_ref.name) = lower(trim(document_row.department));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_users_department') then
    alter table public.users add constraint fk_users_department
      foreign key (department_id) references public.departments(id) on delete set null not valid;
    alter table public.users validate constraint fk_users_department;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_documents_department') then
    alter table public.documents add constraint fk_documents_department
      foreign key (department_id) references public.departments(id) on delete restrict not valid;
    alter table public.documents validate constraint fk_documents_department;
  end if;
end;
$$;

create index if not exists idx_users_department_id_active
  on public.users(department_id) where is_deleted = false;
create index if not exists idx_documents_department_status_active
  on public.documents(department_id, status, updated_at desc) where is_deleted = false;
create index if not exists idx_documents_archive_filters_active
  on public.documents(classification_level, retention_status, ai_detected_document_type, created_at desc)
  where is_deleted = false;

alter table public.documents drop constraint if exists ck_documents_classification_level;
alter table public.documents add constraint ck_documents_classification_level check (
  classification_level is null or classification_level in (
    'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'HIGHLY_RESTRICTED', 'SECRET'
  )
);

create table if not exists public.document_access_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  requester_id uuid not null references public.users(id) on delete restrict,
  requester_email varchar(255) not null,
  requester_department_id uuid references public.departments(id) on delete set null,
  requested_actions text[] not null default array['VIEW']::text[],
  reason varchar(1000) not null,
  routed_approver_role varchar(100) not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED')),
  decision_reason varchar(1000),
  decided_by uuid references public.users(id) on delete set null,
  decided_by_email varchar(255),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_document_access_requested_actions check (
    cardinality(requested_actions) > 0
    and requested_actions <@ array['VIEW', 'DOWNLOAD', 'PRINT', 'SHARE']::text[]
  ),
  constraint ck_document_access_decision_fields check (
    (status = 'PENDING' and decided_at is null and decided_by_email is null)
    or (status <> 'PENDING' and decided_at is not null and decided_by_email is not null)
  )
);

create unique index if not exists uq_document_access_request_pending
  on public.document_access_requests(document_id, requester_id) where status = 'PENDING';
create index if not exists idx_document_access_requests_requester
  on public.document_access_requests(requester_id, created_at desc);
create index if not exists idx_document_access_requests_approver
  on public.document_access_requests(routed_approver_role, status, created_at desc);

alter table public.departments enable row level security;
alter table public.document_access_requests enable row level security;
revoke all privileges on table public.departments from anon, authenticated;
revoke all privileges on table public.document_access_requests from anon, authenticated;
grant select, insert, update on public.departments to service_role;
grant select, insert, update on public.document_access_requests to service_role;

create or replace function public.decide_document_access_request(
  p_request_id uuid,
  p_decision text,
  p_reason text,
  p_actor_id uuid,
  p_actor_email text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.document_access_requests%rowtype;
  next_status text;
  grant_level text;
  decision_time timestamptz := now();
begin
  if p_decision not in ('APPROVE', 'DENY') then
    raise exception 'INVALID_ACCESS_DECISION';
  end if;
  select * into request_row
  from public.document_access_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'ACCESS_REQUEST_NOT_FOUND'; end if;
  if request_row.status <> 'PENDING' then raise exception 'ACCESS_REQUEST_NOT_PENDING'; end if;

  next_status := case when p_decision = 'APPROVE' then 'APPROVED' else 'DENIED' end;
  update public.document_access_requests set
    status = next_status,
    decision_reason = left(p_reason, 1000),
    decided_by = p_actor_id,
    decided_by_email = p_actor_email,
    decided_at = decision_time,
    updated_at = decision_time
  where id = p_request_id;

  if p_decision = 'APPROVE' then
    grant_level := case
      when 'SHARE' = any(request_row.requested_actions) then 'SHARE'
      when 'DOWNLOAD' = any(request_row.requested_actions) and 'PRINT' = any(request_row.requested_actions) then 'DOWNLOAD_PRINT'
      when 'DOWNLOAD' = any(request_row.requested_actions) then 'DOWNLOAD'
      when 'PRINT' = any(request_row.requested_actions) then 'PRINT'
      else 'VIEW'
    end;
    insert into public.document_grants(
      document_id, grantee_type, grantee_key, access_level, reason,
      is_deleted, deleted_at, deleted_by, created_by, updated_by, updated_at
    ) values (
      request_row.document_id, 'USER', lower(request_row.requester_email), grant_level,
      left('Approved access request ' || p_request_id::text || ': ' || p_reason, 255),
      false, null, null, p_actor_email, p_actor_email, decision_time
    )
    on conflict (document_id, grantee_type, grantee_key) do update set
      access_level = excluded.access_level,
      reason = excluded.reason,
      is_deleted = false,
      deleted_at = null,
      deleted_by = null,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'requestId', request_row.id,
    'documentId', request_row.document_id,
    'status', next_status,
    'decidedAt', decision_time
  );
end;
$$;

revoke all on function public.decide_document_access_request(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.decide_document_access_request(uuid, text, text, uuid, text)
  to service_role;

insert into public.permissions(name, display_name, description, module, resource, action, created_at)
select permission_name, display_name, description, 'DOCUMENTS', 'DOCUMENT', action_name, now()
from (values
  ('DOCUMENT_VIEW_METADATA', 'View Document Metadata', 'View authorized document metadata and department-folder counts.', 'READ'),
  ('DOCUMENT_VIEW', 'View Document Content', 'Open authorized document content in the secure viewer.', 'READ'),
  ('DOCUMENT_DOWNLOAD', 'Download Documents', 'Download authorized document content.', 'DOWNLOAD'),
  ('DOCUMENT_PRINT', 'Print Documents', 'Print authorized document content.', 'PRINT'),
  ('DOCUMENT_SHARE', 'Share Documents', 'Share document access through explicit grants.', 'SHARE'),
  ('DOCUMENT_UPLOAD', 'Upload Documents', 'Upload documents through the OCR and AI pipeline.', 'CREATE'),
  ('DOCUMENT_EDIT_METADATA', 'Edit Document Metadata', 'Maintain authorized archive metadata.', 'UPDATE'),
  ('DOCUMENT_CLASSIFY', 'Classify Documents', 'Confirm or correct document classification.', 'UPDATE'),
  ('DOCUMENT_ARCHIVE', 'Archive Documents', 'Move active documents into retained archive custody.', 'ARCHIVE'),
  ('DOCUMENT_RESTORE', 'Restore Documents', 'Restore retained archived documents to active status.', 'RESTORE'),
  ('DOCUMENT_REQUEST_ACCESS', 'Request Document Access', 'Request access to known restricted document metadata.', 'REQUEST'),
  ('DOCUMENT_APPROVE_ACCESS', 'Approve Document Access', 'Approve or deny routed document-access requests.', 'APPROVE'),
  ('DOCUMENT_DISPOSE', 'Dispose Documents', 'Execute separately authorized document disposition.', 'DELETE'),
  ('DOCUMENT_MANAGE_RETENTION', 'Manage Document Retention', 'Maintain document retention assignments and review status.', 'MANAGE')
) permission_seed(permission_name, display_name, description, action_name)
on conflict (name) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  is_deleted = false,
  updated_at = now();

insert into public.role_permissions(role_id, permission_id)
select role_row.id, permission_row.id
from (values
  ('RECORDS_OFFICER', 'DOCUMENT_VIEW_METADATA'), ('RECORDS_OFFICER', 'DOCUMENT_VIEW'),
  ('RECORDS_OFFICER', 'DOCUMENT_DOWNLOAD'), ('RECORDS_OFFICER', 'DOCUMENT_PRINT'),
  ('RECORDS_OFFICER', 'DOCUMENT_UPLOAD'), ('RECORDS_OFFICER', 'DOCUMENT_EDIT_METADATA'),
  ('RECORDS_OFFICER', 'DOCUMENT_CLASSIFY'), ('RECORDS_OFFICER', 'DOCUMENT_ARCHIVE'),
  ('RECORDS_OFFICER', 'DOCUMENT_RESTORE'), ('RECORDS_OFFICER', 'DOCUMENT_REQUEST_ACCESS'),
  ('RECORDS_OFFICER', 'DOCUMENT_APPROVE_ACCESS'), ('RECORDS_OFFICER', 'DOCUMENT_DISPOSE'),
  ('RECORDS_OFFICER', 'DOCUMENT_MANAGE_RETENTION'),
  ('DEPARTMENT_HEAD', 'DOCUMENT_VIEW_METADATA'), ('DEPARTMENT_HEAD', 'DOCUMENT_VIEW'),
  ('DEPARTMENT_HEAD', 'DOCUMENT_DOWNLOAD'), ('DEPARTMENT_HEAD', 'DOCUMENT_PRINT'),
  ('DEPARTMENT_HEAD', 'DOCUMENT_UPLOAD'), ('DEPARTMENT_HEAD', 'DOCUMENT_CLASSIFY'),
  ('DEPARTMENT_HEAD', 'DOCUMENT_REQUEST_ACCESS'), ('DEPARTMENT_HEAD', 'DOCUMENT_APPROVE_ACCESS'),
  ('EMPLOYEE', 'DOCUMENT_VIEW_METADATA'), ('EMPLOYEE', 'DOCUMENT_VIEW'),
  ('EMPLOYEE', 'DOCUMENT_DOWNLOAD'), ('EMPLOYEE', 'DOCUMENT_PRINT'),
  ('EMPLOYEE', 'DOCUMENT_UPLOAD'), ('EMPLOYEE', 'DOCUMENT_REQUEST_ACCESS'),
  ('FACILITIES_OFFICER', 'DOCUMENT_UPLOAD'),
  ('COMPLIANCE_MANAGER', 'DOCUMENT_VIEW_METADATA'), ('COMPLIANCE_MANAGER', 'DOCUMENT_VIEW'),
  ('COMPLIANCE_MANAGER', 'DOCUMENT_DOWNLOAD'), ('COMPLIANCE_MANAGER', 'DOCUMENT_PRINT'),
  ('COMPLIANCE_MANAGER', 'DOCUMENT_CLASSIFY'),
  ('COMPLIANCE_MANAGER', 'DOCUMENT_REQUEST_ACCESS'), ('COMPLIANCE_MANAGER', 'DOCUMENT_APPROVE_ACCESS'),
  ('COMPLIANCE_MANAGER', 'DOCUMENT_MANAGE_RETENTION'),
  ('COMPLIANCE_OFFICER', 'DOCUMENT_VIEW_METADATA'), ('COMPLIANCE_OFFICER', 'DOCUMENT_VIEW'),
  ('COMPLIANCE_OFFICER', 'DOCUMENT_DOWNLOAD'), ('COMPLIANCE_OFFICER', 'DOCUMENT_PRINT'),
  ('COMPLIANCE_OFFICER', 'DOCUMENT_CLASSIFY'),
  ('COMPLIANCE_OFFICER', 'DOCUMENT_REQUEST_ACCESS'), ('COMPLIANCE_OFFICER', 'DOCUMENT_APPROVE_ACCESS'),
  ('COMPLIANCE_OFFICER', 'DOCUMENT_MANAGE_RETENTION'),
  ('DATA_PROTECTION_OFFICER', 'DOCUMENT_VIEW_METADATA'), ('DATA_PROTECTION_OFFICER', 'DOCUMENT_VIEW'),
  ('DATA_PROTECTION_OFFICER', 'DOCUMENT_DOWNLOAD'), ('DATA_PROTECTION_OFFICER', 'DOCUMENT_PRINT'),
  ('DATA_PROTECTION_OFFICER', 'DOCUMENT_CLASSIFY'),
  ('DATA_PROTECTION_OFFICER', 'DOCUMENT_REQUEST_ACCESS'),
  ('DATA_PROTECTION_OFFICER', 'DOCUMENT_APPROVE_ACCESS'),
  ('LEGAL_COUNSEL', 'DOCUMENT_VIEW_METADATA'), ('LEGAL_COUNSEL', 'DOCUMENT_VIEW'),
  ('LEGAL_COUNSEL', 'DOCUMENT_DOWNLOAD'), ('LEGAL_COUNSEL', 'DOCUMENT_PRINT'),
  ('LEGAL_COUNSEL', 'DOCUMENT_CLASSIFY'),
  ('LEGAL_COUNSEL', 'DOCUMENT_REQUEST_ACCESS'),
  ('LEGAL_COUNSEL', 'DOCUMENT_APPROVE_ACCESS'),
  ('LEGAL_OFFICER', 'DOCUMENT_VIEW_METADATA'), ('LEGAL_OFFICER', 'DOCUMENT_VIEW'),
  ('LEGAL_OFFICER', 'DOCUMENT_DOWNLOAD'), ('LEGAL_OFFICER', 'DOCUMENT_PRINT'),
  ('LEGAL_OFFICER', 'DOCUMENT_CLASSIFY'),
  ('LEGAL_OFFICER', 'DOCUMENT_REQUEST_ACCESS'),
  ('LEGAL_OFFICER', 'DOCUMENT_APPROVE_ACCESS'),
  ('CONTRACT_OFFICER', 'DOCUMENT_VIEW_METADATA'), ('CONTRACT_OFFICER', 'DOCUMENT_VIEW'),
  ('CONTRACT_OFFICER', 'DOCUMENT_DOWNLOAD'), ('CONTRACT_OFFICER', 'DOCUMENT_PRINT'),
  ('CONTRACT_OFFICER', 'DOCUMENT_CLASSIFY'),
  ('CONTRACT_OFFICER', 'DOCUMENT_REQUEST_ACCESS'),
  ('CONTRACT_OFFICER', 'DOCUMENT_APPROVE_ACCESS'),
  ('SECURITY_OFFICER', 'DOCUMENT_VIEW_METADATA'), ('SECURITY_OFFICER', 'DOCUMENT_VIEW'),
  ('SECURITY_OFFICER', 'DOCUMENT_DOWNLOAD'), ('SECURITY_OFFICER', 'DOCUMENT_PRINT'),
  ('SECURITY_OFFICER', 'DOCUMENT_CLASSIFY'),
  ('SECURITY_OFFICER', 'DOCUMENT_REQUEST_ACCESS'),
  ('SECURITY_OFFICER', 'DOCUMENT_APPROVE_ACCESS'),
  ('INFOSEC_OFFICER', 'DOCUMENT_VIEW_METADATA'), ('INFOSEC_OFFICER', 'DOCUMENT_VIEW'),
  ('INFOSEC_OFFICER', 'DOCUMENT_DOWNLOAD'), ('INFOSEC_OFFICER', 'DOCUMENT_PRINT'),
  ('INFOSEC_OFFICER', 'DOCUMENT_CLASSIFY'),
  ('INFOSEC_OFFICER', 'DOCUMENT_REQUEST_ACCESS'),
  ('INFOSEC_OFFICER', 'DOCUMENT_APPROVE_ACCESS')
) role_permission(role_name, permission_name)
join public.roles role_row on role_row.name = role_permission.role_name and role_row.is_deleted = false
join public.permissions permission_row on permission_row.name = role_permission.permission_name and permission_row.is_deleted = false
on conflict do nothing;

comment on table public.departments is
  'Authoritative, integration-ready department catalog. Initial rows are derived only from existing real user/document department values.';
comment on column public.documents.department_id is
  'Stable logical archive department relationship; Storage paths are never used as an authorization boundary.';
comment on table public.document_access_requests is
  'Audited human approval workflow for document-content access; approval creates an explicit document_grants record.';
