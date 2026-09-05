-- Phase 2: content-derived document classification and human review provenance.

alter table public.documents
  add column if not exists ai_detected_document_type text,
  add column if not exists ai_metadata_suggestions jsonb not null default '{}'::jsonb,
  add column if not exists ai_classification_reason text,
  add column if not exists ai_provider_name text,
  add column if not exists ai_model text,
  add column if not exists ai_processed_at timestamptz,
  add column if not exists ai_extraction_method text,
  add column if not exists ai_review_required boolean not null default true,
  add column if not exists classification_review_status text not null default 'PENDING',
  add column if not exists final_classification text,
  add column if not exists classification_reviewed_by varchar(255),
  add column if not exists classification_reviewed_at timestamptz,
  add column if not exists classification_review_notes text;

create table if not exists public.document_ai_classifications (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content_sha256 text not null,
  extraction_method text not null,
  extracted_character_count integer not null check (extracted_character_count >= 0),
  provider_id varchar(100),
  provider_name text not null,
  model text not null,
  processed_at timestamptz not null default now(),
  predicted_category_id uuid references public.categories(id) on delete set null,
  predicted_category_name text not null,
  category_scores jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  confidence_method text not null,
  detected_document_type text not null,
  summary text not null,
  metadata_suggestions jsonb not null default '{}'::jsonb,
  classification_reason text not null,
  grounded_evidence jsonb not null default '[]'::jsonb,
  review_required boolean not null default true,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING', 'APPROVED', 'CORRECTED', 'REJECTED')),
  final_category_id uuid references public.categories(id) on delete set null,
  final_category_name text,
  reviewer_email varchar(255),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_ai_classifications_document_processed
  on public.document_ai_classifications(document_id, processed_at desc);

alter table public.document_ai_classifications enable row level security;

create or replace function public.review_document_ai_classification(
  p_document_id uuid,
  p_decision text,
  p_category_id uuid,
  p_reviewer_email text,
  p_notes text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_decision text := upper(trim(p_decision));
  v_review_status text;
  v_classification public.document_ai_classifications%rowtype;
  v_final_category_id uuid;
  v_final_category_name text;
  v_reviewed_at timestamptz := now();
begin
  if v_decision not in ('APPROVE', 'CORRECT', 'REJECT') then
    raise exception 'INVALID_CLASSIFICATION_REVIEW_DECISION';
  end if;

  if not exists (
    select 1 from public.documents
    where id = p_document_id and is_deleted = false and status = 'PENDING_REVIEW'
  ) then
    raise exception 'DOCUMENT_NOT_PENDING_REVIEW';
  end if;

  select * into v_classification
  from public.document_ai_classifications
  where document_id = p_document_id
  order by processed_at desc
  limit 1
  for update;
  if not found then raise exception 'AI_CLASSIFICATION_NOT_FOUND'; end if;

  if v_decision = 'APPROVE' then
    v_review_status := 'APPROVED';
    v_final_category_id := v_classification.predicted_category_id;
    v_final_category_name := v_classification.predicted_category_name;
  elsif v_decision = 'CORRECT' then
    v_review_status := 'CORRECTED';
    select id, name into v_final_category_id, v_final_category_name
    from public.categories where id = p_category_id and is_deleted = false;
    if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  else
    v_review_status := 'REJECTED';
    v_final_category_id := null;
    v_final_category_name := null;
  end if;

  update public.document_ai_classifications set
    review_status = v_review_status,
    final_category_id = v_final_category_id,
    final_category_name = v_final_category_name,
    reviewer_email = p_reviewer_email,
    reviewed_at = v_reviewed_at,
    review_notes = nullif(trim(p_notes), ''),
    updated_at = v_reviewed_at
  where id = v_classification.id;

  update public.documents set
    category_id = v_final_category_id,
    status = case when v_decision = 'REJECT' then 'PENDING_REVIEW' else 'APPROVED' end,
    classification_review_status = v_review_status,
    final_classification = v_final_category_name,
    classification_reviewed_by = p_reviewer_email,
    classification_reviewed_at = v_reviewed_at,
    classification_review_notes = nullif(trim(p_notes), ''),
    updated_by = p_reviewer_email,
    updated_at = v_reviewed_at::timestamp
  where id = p_document_id;

  return jsonb_build_object(
    'reviewStatus', v_review_status,
    'finalCategoryId', v_final_category_id,
    'finalCategoryName', v_final_category_name,
    'reviewedAt', v_reviewed_at
  );
end;
$$;

revoke all on function public.review_document_ai_classification(uuid, text, uuid, text, text) from public;
revoke all on function public.review_document_ai_classification(uuid, text, uuid, text, text) from anon;
revoke all on function public.review_document_ai_classification(uuid, text, uuid, text, text) from authenticated;
grant execute on function public.review_document_ai_classification(uuid, text, uuid, text, text) to service_role;

insert into public.categories (name, description, is_deleted)
values
  ('ADMINISTRATIVE_MEMORANDUM', 'Official memoranda, circulars, directives, and administrative issuances.', false),
  ('FINANCIAL_RECORD', 'Invoices, receipts, payment records, budgets, and other financial documents.', false),
  ('FACILITIES_RECORD', 'Facility reservations, maintenance reports, inspections, assets, and work orders.', false),
  ('SECURITY_RECORD', 'Security incidents, visitor records, access-control records, and safety reports.', false),
  ('LEGAL_DOCUMENT', 'Legal correspondence, agreements, policies, opinions, and case-related records.', false),
  ('GENERAL_CORRESPONDENCE', 'Business correspondence that does not fit a more specific active category.', false)
on conflict (name) do update set
  description = excluded.description,
  is_deleted = false,
  updated_at = now();

comment on table public.document_ai_classifications is
  'Immutable-by-default AI classification provenance plus the separate human review decision.';
comment on column public.documents.final_classification is
  'Final human-approved category; intentionally separate from ai_predicted_category.';
