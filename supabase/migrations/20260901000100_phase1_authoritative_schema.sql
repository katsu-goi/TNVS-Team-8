-- Phase 1: make the Supabase migration chain authoritative for tables and
-- columns used by active Edge Functions. This migration is additive so it can
-- also reconcile databases that previously received the legacy Flyway schema.

alter table public.documents
  add column if not exists owner_email varchar(255),
  add column if not exists department varchar(100);

create table if not exists public.document_grants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  grantee_type varchar(20) not null,
  grantee_key varchar(100) not null,
  access_level varchar(20) not null,
  reason varchar(255),
  is_deleted boolean not null default false,
  deleted_at timestamp,
  deleted_by varchar(255),
  created_at timestamp not null default now(),
  updated_at timestamp,
  created_by varchar(255),
  updated_by varchar(255),
  constraint uq_document_grants_document_grantee
    unique (document_id, grantee_type, grantee_key)
);

-- CREATE TABLE IF NOT EXISTS does not reconcile constraints on a table that
-- already exists. Add the relationship explicitly for legacy/Flyway-created
-- tables, but stop without changing data if an orphan is ever encountered.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.document_grants'::regclass
      and c.confrelid = 'public.documents'::regclass
      and c.conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.document_grants'::regclass
           and attname = 'document_id')
      ]::smallint[]
      and c.confkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.documents'::regclass
           and attname = 'id')
      ]::smallint[]
  ) then
    if exists (
      select 1
      from public.document_grants g
      left join public.documents d on d.id = g.document_id
      where d.id is null
    ) then
      raise exception
        'Cannot add document_grants.document_id foreign key: orphaned rows exist';
    end if;

    alter table public.document_grants
      add constraint fk_document_grants_document
      foreign key (document_id) references public.documents(id)
      on delete cascade not valid;
    alter table public.document_grants
      validate constraint fk_document_grants_document;
  end if;
end;
$$;

create index if not exists idx_document_grants_document
  on public.document_grants(document_id);

create table if not exists public.contract_clauses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  clause_type varchar(100) not null,
  content text not null,
  risk_level varchar(50),
  ai_analysis_notes text,
  is_deleted boolean not null default false,
  deleted_at timestamp,
  deleted_by varchar(255),
  created_at timestamp not null default now(),
  updated_at timestamp,
  created_by varchar(255),
  updated_by varchar(255)
);

-- Legacy Flyway versions did not include the soft-delete columns now written
-- by the Edge Functions.
alter table public.contract_clauses
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamp,
  add column if not exists deleted_by varchar(255);

create index if not exists idx_contract_clauses_contract
  on public.contract_clauses(contract_id);

create table if not exists public.ai_providers (
  id varchar(100) primary key,
  name varchar(255) not null,
  provider_type varchar(50) not null,
  default_model varchar(200),
  encrypted_api_key text,
  base_url varchar(500),
  endpoint varchar(500),
  capabilities text,
  enabled boolean not null default true,
  status varchar(20) not null default 'CONNECTED',
  is_default boolean not null default false,
  created_at timestamp not null default now(),
  updated_at timestamp,
  is_deleted boolean not null default false,
  deleted_at timestamp
);

create index if not exists idx_ai_providers_default
  on public.ai_providers(is_default)
  where is_deleted = false;

create table if not exists public.ai_module_config (
  id uuid primary key default gen_random_uuid(),
  module_key varchar(100) not null unique,
  enabled boolean not null default true,
  provider_id varchar(100) references public.ai_providers(id) on delete set null,
  model varchar(200),
  fallback_model varchar(200),
  execution_mode varchar(20) not null default 'REALTIME',
  features text,
  created_at timestamp not null default now(),
  updated_at timestamp,
  updated_by varchar(255),
  is_deleted boolean not null default false,
  deleted_at timestamp,
  deleted_by varchar(255)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.ai_module_config'::regclass
      and c.confrelid = 'public.ai_providers'::regclass
      and c.conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.ai_module_config'::regclass
           and attname = 'provider_id')
      ]::smallint[]
      and c.confkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.ai_providers'::regclass
           and attname = 'id')
      ]::smallint[]
  ) then
    if exists (
      select 1
      from public.ai_module_config m
      left join public.ai_providers p on p.id = m.provider_id
      where m.provider_id is not null
        and p.id is null
    ) then
      raise exception
        'Cannot add ai_module_config.provider_id foreign key: orphaned rows exist';
    end if;

    alter table public.ai_module_config
      add constraint fk_ai_module_config_provider
      foreign key (provider_id) references public.ai_providers(id)
      on delete set null not valid;
    alter table public.ai_module_config
      validate constraint fk_ai_module_config_provider;
  end if;
end;
$$;

create index if not exists idx_ai_module_config_module_key
  on public.ai_module_config(module_key);

alter table public.document_grants enable row level security;
alter table public.contract_clauses enable row level security;
alter table public.ai_providers enable row level security;
alter table public.ai_module_config enable row level security;

comment on table public.document_grants is
  'Explicit document sharing grants evaluated by the documents Edge Function.';
comment on table public.contract_clauses is
  'Human-managed clauses associated with legal and procurement contracts.';
comment on table public.ai_providers is
  'Server-side AI provider registry; credential values are AES-256-GCM encrypted.';
comment on table public.ai_module_config is
  'Per-module AI provider, model, feature, and execution configuration.';
