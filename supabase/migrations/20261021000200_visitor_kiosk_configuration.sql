-- Administrator-managed visitor kiosk policy. This singleton record contains
-- organizational notice content and policy controls, never visitor identity
-- data or provider secrets. Edge Functions remain the only access path.

create table if not exists public.visitor_kiosk_configuration (
  id smallint primary key default 1 check (id = 1),
  organization_name text,
  controller_name text,
  controller_contact text,
  dpo_contact text,
  processing_purposes text,
  lawful_basis text,
  privacy_notice_text text,
  acknowledgement_text text,
  notice_version varchar(80),
  retention_policy text,
  retention_days integer check (retention_days is null or retention_days between 1 and 3650),
  rights_process text,
  processors text,
  safeguards text,
  alternative_verification text,
  accepted_id_types text[] not null default '{}',
  purpose_department_routes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(purpose_department_routes) = 'object'),
  registration_enabled boolean not null default false,
  privacy_review_approved boolean not null default false,
  privacy_review_approved_by uuid references public.users(id),
  privacy_review_approved_at timestamptz,
  security_review_approved boolean not null default false,
  security_review_approved_by uuid references public.users(id),
  security_review_approved_at timestamptz,
  operations_review_approved boolean not null default false,
  operations_review_approved_by uuid references public.users(id),
  operations_review_approved_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),
  constraint visitor_kiosk_privacy_review_evidence_check check (
    not privacy_review_approved or (privacy_review_approved_by is not null and privacy_review_approved_at is not null)
  ),
  constraint visitor_kiosk_security_review_evidence_check check (
    not security_review_approved or (security_review_approved_by is not null and security_review_approved_at is not null)
  ),
  constraint visitor_kiosk_operations_review_evidence_check check (
    not operations_review_approved or (operations_review_approved_by is not null and operations_review_approved_at is not null)
  )
);

insert into public.visitor_kiosk_configuration (id, organization_name)
values (1, 'HIRNA TNVS')
on conflict (id) do nothing;

alter table public.visitor_kiosk_configuration enable row level security;
revoke all on public.visitor_kiosk_configuration from public, anon, authenticated;
grant select, insert, update on public.visitor_kiosk_configuration to service_role;

comment on table public.visitor_kiosk_configuration is
  'Singleton, administrator-managed visitor kiosk policy. Public projection is provided only by the visitor Edge Function.';
comment on column public.visitor_kiosk_configuration.registration_enabled is
  'Administrator intent only; effective readiness also requires every policy field, valid department routes, and all recorded reviews.';
