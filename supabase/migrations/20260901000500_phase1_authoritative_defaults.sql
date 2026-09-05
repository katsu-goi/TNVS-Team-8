-- Phase 1 legacy-schema convergence: CREATE TABLE IF NOT EXISTS does not add
-- defaults to tables that already exist. These ALTERs affect future inserts
-- only and do not rewrite existing business rows.

alter table public.document_grants
  alter column id set default gen_random_uuid(),
  alter column is_deleted set default false,
  alter column created_at set default now();

alter table public.contract_clauses
  alter column id set default gen_random_uuid(),
  alter column is_deleted set default false,
  alter column created_at set default now();

alter table public.ai_providers
  alter column enabled set default true,
  alter column status set default 'CONNECTED',
  alter column is_default set default false,
  alter column created_at set default now(),
  alter column is_deleted set default false;

alter table public.ai_module_config
  alter column id set default gen_random_uuid(),
  alter column enabled set default true,
  alter column execution_mode set default 'REALTIME',
  alter column created_at set default now(),
  alter column is_deleted set default false;
