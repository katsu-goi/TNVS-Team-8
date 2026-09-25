-- Phase 3: grounded contract-content analysis, human review, and operational obligations.

alter table public.contracts
  add column if not exists ai_analysis_review_status text not null default 'NOT_ANALYZED',
  add column if not exists ai_analysis_reviewed_by varchar(255),
  add column if not exists ai_analysis_reviewed_at timestamptz,
  add column if not exists approved_by varchar(255),
  add column if not exists approved_at timestamptz,
  add column if not exists activated_by varchar(255),
  add column if not exists activated_at timestamptz;

alter table public.contracts drop constraint if exists chk_contract_ai_review_status;
alter table public.contracts add constraint chk_contract_ai_review_status check (
  ai_analysis_review_status in ('NOT_ANALYZED', 'PENDING', 'APPROVED', 'CORRECTED', 'REJECTED')
);

create table if not exists public.contract_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  source_document_id uuid not null references public.documents(id) on delete restrict,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  extraction_method text not null,
  extracted_character_count integer not null check (extracted_character_count >= 0),
  provider_id varchar(100),
  provider_name text not null,
  model text not null,
  analyzed_at timestamptz not null default now(),
  analysis_data jsonb not null,
  overall_risk text not null check (overall_risk in ('LOW', 'MEDIUM', 'HIGH')),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  confidence_method text not null,
  grounded_evidence jsonb not null default '[]'::jsonb,
  missing_terms jsonb not null default '[]'::jsonb,
  review_required boolean not null default true,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING', 'APPROVED', 'CORRECTED', 'REJECTED')),
  final_data jsonb,
  reviewer_email varchar(255),
  reviewed_at timestamptz,
  review_notes text,
  version integer not null check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_contract_ai_analysis_version unique (contract_id, version),
  constraint chk_contract_ai_review_fields check (
    (review_status = 'PENDING' and reviewer_email is null and reviewed_at is null and final_data is null)
    or (review_status in ('APPROVED', 'CORRECTED') and reviewer_email is not null and reviewed_at is not null and final_data is not null)
    or (review_status = 'REJECTED' and reviewer_email is not null and reviewed_at is not null and final_data is null)
  )
);

create index if not exists idx_contract_ai_analyses_contract
  on public.contract_ai_analyses(contract_id, analyzed_at desc);
create index if not exists idx_contract_ai_analyses_document
  on public.contract_ai_analyses(source_document_id);

create table if not exists public.contract_obligations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  source_analysis_id uuid not null references public.contract_ai_analyses(id) on delete cascade,
  suggestion_index integer not null check (suggestion_index >= 0),
  responsible_party text,
  description text not null,
  due_date date,
  frequency text,
  source_clause text,
  evidence text not null,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED')),
  reviewed_by varchar(255) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_contract_obligation_suggestion unique (source_analysis_id, suggestion_index)
);

create index if not exists idx_contract_obligations_contract_status
  on public.contract_obligations(contract_id, status, due_date);

alter table public.contract_clauses
  add column if not exists source_analysis_id uuid references public.contract_ai_analyses(id) on delete set null,
  add column if not exists source_evidence text,
  add column if not exists confidence numeric(5,4);

alter table public.contract_ai_analyses enable row level security;
alter table public.contract_obligations enable row level security;
revoke all privileges on table public.contract_ai_analyses from anon, authenticated;
revoke all privileges on table public.contract_obligations from anon, authenticated;

create or replace function public.review_contract_ai_analysis(
  p_analysis_id uuid,
  p_decision text,
  p_final_data jsonb,
  p_reviewer_email text,
  p_notes text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_decision text := upper(trim(p_decision));
  v_status text;
  v_analysis public.contract_ai_analyses%rowtype;
  v_final jsonb;
  v_now timestamptz := now();
  v_item jsonb;
  v_index integer := 0;
  v_effective text;
  v_expiration text;
  v_renewal_notice text;
begin
  if v_decision not in ('APPROVE', 'CORRECT', 'REJECT') then
    raise exception 'INVALID_CONTRACT_AI_REVIEW_DECISION';
  end if;
  if nullif(trim(p_reviewer_email), '') is null then
    raise exception 'CONTRACT_AI_REVIEWER_REQUIRED';
  end if;

  select * into v_analysis from public.contract_ai_analyses
  where id = p_analysis_id for update;
  if not found then raise exception 'CONTRACT_AI_ANALYSIS_NOT_FOUND'; end if;
  if v_analysis.review_status <> 'PENDING' then
    raise exception 'CONTRACT_AI_ANALYSIS_ALREADY_REVIEWED';
  end if;

  if v_decision = 'APPROVE' then
    v_status := 'APPROVED';
    v_final := v_analysis.analysis_data;
  elsif v_decision = 'CORRECT' then
    if p_final_data is null or jsonb_typeof(p_final_data) <> 'object' then
      raise exception 'CONTRACT_AI_CORRECTION_REQUIRED';
    end if;
    v_status := 'CORRECTED';
    v_final := p_final_data;
  else
    v_status := 'REJECTED';
    v_final := null;
  end if;

  update public.contract_ai_analyses set
    review_status = v_status,
    final_data = v_final,
    reviewer_email = trim(p_reviewer_email),
    reviewed_at = v_now,
    review_notes = nullif(trim(p_notes), ''),
    updated_at = v_now
  where id = p_analysis_id;

  update public.contracts set
    ai_analysis_review_status = v_status,
    ai_analysis_reviewed_by = trim(p_reviewer_email),
    ai_analysis_reviewed_at = v_now,
    updated_at = v_now::timestamp,
    updated_by = trim(p_reviewer_email)
  where id = v_analysis.contract_id;

  if v_final is not null then
    select item->>'value' into v_effective
    from jsonb_array_elements(coalesce(v_final->'dates', '[]'::jsonb)) item
    where item->>'type' = 'EFFECTIVE_DATE' and item->>'status' = 'FOUND' limit 1;
    select item->>'value' into v_expiration
    from jsonb_array_elements(coalesce(v_final->'dates', '[]'::jsonb)) item
    where item->>'type' = 'EXPIRATION_DATE' and item->>'status' = 'FOUND' limit 1;
    select item->>'value' into v_renewal_notice
    from jsonb_array_elements(coalesce(v_final->'dates', '[]'::jsonb)) item
    where item->>'type' in ('RENEWAL_NOTICE_DEADLINE', 'NOTICE_DEADLINE') and item->>'status' = 'FOUND' limit 1;

    update public.contracts set
      ai_assessed_risk_level = case when v_final->>'overallRisk' in ('LOW', 'MEDIUM', 'HIGH') then v_final->>'overallRisk' else ai_assessed_risk_level end,
      ai_risk_summary = nullif(v_final->>'summary', ''),
      start_date = case when v_effective ~ '^\d{4}-\d{2}-\d{2}$' then v_effective::date else start_date end,
      end_date = case when v_expiration ~ '^\d{4}-\d{2}-\d{2}$' then v_expiration::date else end_date end,
      renewal_notice_date = case when v_renewal_notice ~ '^\d{4}-\d{2}-\d{2}$' then v_renewal_notice::date else renewal_notice_date end,
      document_id = v_analysis.source_document_id,
      updated_at = v_now::timestamp,
      updated_by = trim(p_reviewer_email)
    where id = v_analysis.contract_id;

    for v_item in select value from jsonb_array_elements(coalesce(v_final->'obligations', '[]'::jsonb)) loop
      insert into public.contract_obligations (
        contract_id, source_analysis_id, suggestion_index, responsible_party,
        description, due_date, frequency, source_clause, evidence, confidence,
        status, reviewed_by, created_at, updated_at
      ) values (
        v_analysis.contract_id, v_analysis.id, v_index,
        nullif(v_item->>'responsibleParty', ''),
        coalesce(nullif(v_item->>'description', ''), 'Reviewed contract obligation'),
        case when coalesce(v_item->>'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (v_item->>'dueDate')::date else null end,
        nullif(v_item->>'frequency', ''), nullif(v_item->>'sourceClause', ''),
        coalesce(nullif(v_item->>'evidence', ''), 'Human-reviewed contract finding'),
        greatest(0, least(1, coalesce((v_item->>'confidence')::numeric, 1))),
        'PENDING', trim(p_reviewer_email), v_now, v_now
      ) on conflict (source_analysis_id, suggestion_index) do nothing;
      v_index := v_index + 1;
    end loop;

    v_index := 0;
    for v_item in select value from jsonb_array_elements(coalesce(v_final->'clauses', '[]'::jsonb)) loop
      insert into public.contract_clauses (
        id, contract_id, clause_type, content, risk_level, ai_analysis_notes,
        source_analysis_id, source_evidence, confidence, is_deleted,
        created_at, updated_at, created_by, updated_by
      ) values (
        gen_random_uuid(), v_analysis.contract_id,
        coalesce(nullif(v_item->>'type', ''), 'OTHER'),
        coalesce(nullif(v_item->>'summary', ''), v_item->>'evidence'),
        case when v_item->>'riskLevel' in ('LOW', 'MEDIUM', 'HIGH') then v_item->>'riskLevel' else null end,
        'AI-assisted clause identification approved by an authorized reviewer.',
        v_analysis.id, nullif(v_item->>'evidence', ''),
        greatest(0, least(1, coalesce((v_item->>'confidence')::numeric, 1))),
        false, v_now::timestamp, v_now::timestamp,
        trim(p_reviewer_email), trim(p_reviewer_email)
      );
      v_index := v_index + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'analysisId', v_analysis.id,
    'contractId', v_analysis.contract_id,
    'reviewStatus', v_status,
    'reviewedAt', v_now,
    'reviewerEmail', trim(p_reviewer_email)
  );
end;
$$;

revoke all on function public.review_contract_ai_analysis(uuid, text, jsonb, text, text) from public;
revoke all on function public.review_contract_ai_analysis(uuid, text, jsonb, text, text) from anon;
revoke all on function public.review_contract_ai_analysis(uuid, text, jsonb, text, text) from authenticated;
grant execute on function public.review_contract_ai_analysis(uuid, text, jsonb, text, text) to service_role;

insert into public.ai_module_config (
  id, module_key, enabled, provider_id, model, fallback_model,
  execution_mode, features, created_at, updated_at, is_deleted
)
values (
  gen_random_uuid(), 'mod-2', false, null, null, null,
  'REALTIME', 'contractAnalysis,aiSummarization', now(), now(), false
)
on conflict (module_key) do nothing;

comment on table public.contract_ai_analyses is
  'Grounded Contract AI provenance. Original AI output is separate from human-reviewed final data.';
comment on table public.contract_obligations is
  'Operational obligations created only after authorized human approval or correction of Contract AI suggestions.';
