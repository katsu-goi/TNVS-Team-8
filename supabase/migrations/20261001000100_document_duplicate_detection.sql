-- Advisory duplicate detection for the existing document/OCR pipeline.
-- Candidate discovery is service-only and applies the document visibility policy
-- before returning any content to the documents Edge Function.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.documents
  add column if not exists file_sha256 text,
  add column if not exists ocr_normalized_sha256 text,
  add column if not exists duplicate_check_status text not null default 'NOT_CHECKED',
  add column if not exists duplicate_checked_at timestamptz;

alter table public.documents drop constraint if exists ck_documents_file_sha256;
alter table public.documents add constraint ck_documents_file_sha256
  check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');
alter table public.documents drop constraint if exists ck_documents_ocr_normalized_sha256;
alter table public.documents add constraint ck_documents_ocr_normalized_sha256
  check (ocr_normalized_sha256 is null or ocr_normalized_sha256 ~ '^[0-9a-f]{64}$');
alter table public.documents drop constraint if exists ck_documents_duplicate_check_status;
alter table public.documents add constraint ck_documents_duplicate_check_status
  check (duplicate_check_status in ('NOT_CHECKED', 'NO_DUPLICATE', 'REVIEW_REQUIRED', 'UNAVAILABLE'));

create index if not exists idx_documents_file_sha256_active
  on public.documents(file_sha256) where is_deleted = false and file_sha256 is not null;
create index if not exists idx_documents_ocr_sha256_active
  on public.documents(ocr_normalized_sha256) where is_deleted = false and ocr_normalized_sha256 is not null;
create index if not exists idx_documents_ai_document_number_active
  on public.documents(lower(regexp_replace(coalesce(ai_metadata_suggestions->>'documentNumber', ai_metadata_suggestions->>'document_number', ai_metadata_suggestions->>'referenceNumber', ai_metadata_suggestions->>'contractNumber'), '[^a-zA-Z0-9]', '', 'g')))
  where is_deleted = false;
create index if not exists idx_documents_title_trgm_active
  on public.documents using gin (lower(title) extensions.gin_trgm_ops)
  where is_deleted = false;
create index if not exists idx_documents_ocr_trgm_active
  on public.documents using gin ((left(lower(coalesce(ocr_extracted_text, '')), 12000)) extensions.gin_trgm_ops)
  where is_deleted = false and ocr_extracted_text is not null;
create index if not exists idx_documents_detected_type_active
  on public.documents(lower(ai_detected_document_type))
  where is_deleted = false and ai_detected_document_type is not null;

create table if not exists public.document_duplicate_matches (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.documents(id) on delete cascade,
  matched_document_id uuid not null references public.documents(id) on delete cascade,
  match_type text not null check (match_type in (
    'EXACT_FILE_DUPLICATE', 'EXACT_OCR_DUPLICATE', 'POSSIBLE_DUPLICATE_DOCUMENT_NUMBER',
    'NEAR_DUPLICATE', 'POSSIBLE_NEW_VERSION', 'POSSIBLE_RELATED_DOCUMENT'
  )),
  confidence text not null check (confidence in ('EXACT', 'HIGH_CONFIDENCE', 'POSSIBLE_DUPLICATE')),
  ocr_similarity numeric(5,4) check (ocr_similarity is null or (ocr_similarity >= 0 and ocr_similarity <= 1)),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  detector_version text not null,
  detected_at timestamptz not null default now(),
  reviewer_decision text check (reviewer_decision is null or reviewer_decision in ('CONTINUE_AS_NEW', 'CANCEL_REVIEW')),
  reviewed_by text,
  reviewed_at timestamptz,
  constraint uq_document_duplicate_pair unique (source_document_id, matched_document_id),
  constraint ck_document_duplicate_not_self check (source_document_id <> matched_document_id),
  constraint ck_document_duplicate_review_fields check (
    (reviewer_decision is null and reviewed_by is null and reviewed_at is null)
    or (reviewer_decision is not null and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists idx_document_duplicate_matches_source
  on public.document_duplicate_matches(source_document_id, detected_at desc);
create index if not exists idx_document_duplicate_matches_matched
  on public.document_duplicate_matches(matched_document_id, detected_at desc);

alter table public.document_duplicate_matches enable row level security;
revoke all on public.document_duplicate_matches from public, anon, authenticated;
grant select, insert, update on public.document_duplicate_matches to service_role;

create or replace function public.phase10_document_duplicate_candidates(
  p_user_email text,
  p_user_department text,
  p_roles text[],
  p_source_document_id uuid,
  p_file_sha256 text,
  p_ocr_normalized_sha256 text,
  p_ocr_normalized_text text,
  p_document_number text,
  p_title text,
  p_document_type text,
  p_limit integer default 25
)
returns table (
  id uuid,
  title text,
  file_name text,
  status text,
  owner_email text,
  department text,
  created_at timestamptz,
  file_path text,
  classification_level text,
  version_number integer,
  ocr_extracted_text text,
  file_sha256 text,
  ocr_normalized_sha256 text,
  document_number text,
  effective_date text,
  document_type text
)
language sql
security definer
set search_path = pg_catalog, public, extensions
as $$
  with authorized as materialized (
    select d.*,
      coalesce(d.ai_metadata_suggestions->>'documentNumber', d.ai_metadata_suggestions->>'document_number',
        d.ai_metadata_suggestions->>'referenceNumber', d.ai_metadata_suggestions->>'contractNumber') as detected_document_number,
      coalesce(d.ai_metadata_suggestions->>'effectiveDate', d.ai_metadata_suggestions->>'effective_date') as detected_effective_date
    from public.documents d
    left join public.categories category on category.id = d.category_id
    where d.is_deleted = false
      and d.id <> p_source_document_id
      and (
        (p_file_sha256 is not null and d.file_sha256 = p_file_sha256)
        or (p_ocr_normalized_sha256 is not null and d.ocr_normalized_sha256 = p_ocr_normalized_sha256)
        or (p_document_number is not null and lower(regexp_replace(coalesce(d.ai_metadata_suggestions->>'documentNumber', d.ai_metadata_suggestions->>'document_number', d.ai_metadata_suggestions->>'referenceNumber', d.ai_metadata_suggestions->>'contractNumber', ''), '[^a-zA-Z0-9]', '', 'g')) = lower(p_document_number))
        or (p_title is not null and lower(coalesce(d.title, '')) operator(extensions.%) lower(p_title))
        or (p_ocr_normalized_text is not null and length(p_ocr_normalized_text) >= 80
          and left(lower(coalesce(d.ocr_extracted_text, '')), 12000) operator(extensions.%) left(lower(p_ocr_normalized_text), 12000))
        or (p_document_type is not null and lower(coalesce(d.ai_detected_document_type, '')) = lower(p_document_type))
      )
      and (
        'SUPER_ADMIN' = any(coalesce(p_roles, array[]::text[]))
        or lower(coalesce(d.owner_email, '')) = lower(coalesce(p_user_email, ''))
        or lower(coalesce(d.created_by, '')) = lower(coalesce(p_user_email, ''))
        or exists (
          select 1 from public.document_grants g
          where g.document_id = d.id and g.is_deleted = false
            and ((g.grantee_type = 'USER' and lower(g.grantee_key) = lower(coalesce(p_user_email, '')))
              or (g.grantee_type = 'ROLE' and upper(g.grantee_key) = any(coalesce(p_roles, array[]::text[]))))
        )
        or 'COMPLIANCE_OFFICER' = any(coalesce(p_roles, array[]::text[]))
        or 'LEGAL_OFFICER' = any(coalesce(p_roles, array[]::text[]))
        or (
          'CONTRACT_OFFICER' = any(coalesce(p_roles, array[]::text[]))
          and (
            lower(coalesce(d.department, '')) = lower(coalesce(p_user_department, ''))
            or lower(concat_ws(' ', d.title, d.ai_predicted_category, d.department, category.name)) ~ '(contract|procurement|vendor|supplier|sla|lease|purchase|agreement|obligation|dpa)'
          )
        )
        or (
          not ('EMPLOYEE' = any(coalesce(p_roles, array[]::text[])))
          and not ('CONTRACT_OFFICER' = any(coalesce(p_roles, array[]::text[])))
          and nullif(trim(coalesce(p_user_department, '')), '') is not null
          and lower(d.department) = lower(p_user_department)
        )
      )
  ), candidates as (
    select a.*,
      greatest(
        case when p_title is null then 0 else extensions.similarity(lower(coalesce(a.title, '')), lower(p_title)) end,
        case when p_ocr_normalized_text is null or length(p_ocr_normalized_text) < 80 then 0
          else extensions.similarity(left(lower(coalesce(a.ocr_extracted_text, '')), 12000), left(lower(p_ocr_normalized_text), 12000)) end
      ) as candidate_similarity
    from authorized a
    order by
      (a.file_sha256 = p_file_sha256) desc nulls last,
      (a.ocr_normalized_sha256 = p_ocr_normalized_sha256) desc nulls last,
      candidate_similarity desc,
      a.created_at desc
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  )
  select c.id, c.title, c.file_name, c.status, c.owner_email, c.department, c.created_at,
    c.file_path, c.classification_level, c.version_number, c.ocr_extracted_text,
    c.file_sha256, c.ocr_normalized_sha256, c.detected_document_number,
    c.detected_effective_date, c.ai_detected_document_type
  from candidates c;
$$;

revoke all on function public.phase10_document_duplicate_candidates(text, text, text[], uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.phase10_document_duplicate_candidates(text, text, text[], uuid, text, text, text, text, text, text, integer) to service_role;

comment on table public.document_duplicate_matches is
  'Advisory, non-destructive duplicate/related-document findings and reviewer decisions.';
comment on function public.phase10_document_duplicate_candidates is
  'Returns only candidates visible under the existing document access policy. Service-role Edge use only.';
