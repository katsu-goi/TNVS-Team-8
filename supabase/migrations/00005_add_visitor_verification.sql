-- ============================================================
-- 00005 - Visitor verification, watchlist screening
--
-- Task 4: registration alone does not tell the lobby whether a
-- visitor is who they claim to be. Two new tables carry that:
--
--   visitor_verifications - one row per verification attempt
--     (heuristic ID parse + watchlist screen). Append-only in
--     practice: a visitor may be re-verified and every attempt is
--     kept as an audit trail.
--   visitor_watchlist     - the names/ID numbers screened against.
--
-- Rules (identical to 00001-00004):
--   * PURELY ADDITIVE - CREATE TABLE IF NOT EXISTS only. No DROP,
--     no TRUNCATE, no ALTER of existing tables or columns.
--   * No FOREIGN KEY constraints: visitor_id is a loose uuid
--     reference resolved in application code, consistent with
--     documents.retention_policy_id (00004) and contracts.vendor_id.
--   * BaseEntity (LocalDateTime) columns -> timestamp.
--
-- Unlike 00004 this file creates its own tables, so it has no
-- prerequisite beyond an empty schema and is safe to run first.
-- Recommended order remains 00001 -> 00002 -> 00003 -> 00004 -> 00005.
--
-- Supabase only. Backend Flyway migrations (V1-V5) are NOT touched:
-- the local/default profiles run ddl-auto and pick these tables up
-- from the JPA entities.
-- ============================================================

-- 1. VISITOR VERIFICATIONS ------------------------------------
create table if not exists public.visitor_verifications (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamp not null default now(),
  updated_at          timestamp,
  created_by          varchar(255),
  updated_by          varchar(255),
  is_deleted          boolean not null default false,
  deleted_at          timestamp,
  deleted_by          varchar(255),

  visitor_id          uuid not null,
  id_type             text,
  id_number           text,
  -- Parsed components of the ID (prefix, serial, detected format,
  -- validity) plus the visitor identity the screen ran against.
  extracted_fields    jsonb default '{}'::jsonb,
  match_score         numeric(5,2),
  watchlist_status    text not null default 'CLEAR',
  verification_status text not null default 'PENDING',
  verified_at         timestamp,
  verified_by         varchar(255),
  notes               text
);

create index if not exists idx_visitor_verifications_visitor
  on public.visitor_verifications (visitor_id);

-- 2. VISITOR WATCHLIST ----------------------------------------
create table if not exists public.visitor_watchlist (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamp not null default now(),
  updated_at  timestamp,
  created_by  varchar(255),
  updated_by  varchar(255),
  is_deleted  boolean not null default false,
  deleted_at  timestamp,
  deleted_by  varchar(255),

  full_name   text not null,
  id_number   text,
  reason      text,
  status      text not null default 'ACTIVE'
);

-- 3. DEMO SEED ------------------------------------------------
-- Seeded only when the table is empty, so re-running this file is a
-- no-op and entries an operator has deliberately removed do not
-- reappear. These two rows make the pre-oral demo reproducible:
-- verifying ID N02-18-998412 must come back FLAGGED.
insert into public.visitor_watchlist (full_name, id_number, reason, status)
select 'Juan Carlos De La Cruz', 'N02-18-998412', 'Security incident under review (demo)', 'ACTIVE'
where not exists (select 1 from public.visitor_watchlist);

insert into public.visitor_watchlist (full_name, id_number, reason, status)
select 'Maria Clara Santos', 'D12-34-567890', 'Suspected fraudulent ID (demo)', 'ACTIVE'
where not exists (
  select 1 from public.visitor_watchlist where id_number = 'D12-34-567890'
);

-- 4. RLS ------------------------------------------------------
-- Enabled with no policies, matching 00001: the backend connects as
-- the postgres role, which bypasses RLS, while anon/authenticated
-- keys get no direct access to these tables.
alter table public.visitor_verifications enable row level security;
alter table public.visitor_watchlist     enable row level security;
