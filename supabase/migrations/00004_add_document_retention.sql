-- ============================================================
-- 00004 - Document retention assignment
--
-- Task 3: the nightly retention job assigns each document a
-- retention policy (matched from the existing retention_policies
-- rows) and computes when that retention period runs out. Two new
-- nullable columns on public.documents carry that result.
--
-- Rules (identical to 00001-00003):
--   * PURELY ADDITIVE - ALTER TABLE ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS.
--   * No DROP, no TRUNCATE, no ALTER of existing columns.
--   * No FOREIGN KEY constraint: retention_policy_id is a loose
--     uuid reference, consistent with the codebase pattern
--     (documents.retention_policy_id -> retention_policies.id is
--     resolved in application code, not by the database).
--   * BaseEntity (LocalDateTime) columns -> timestamp.
--
-- ORDER-DEPENDENT: public.documents is created by 00001. Run
-- 00001 -> 00002 -> 00003 -> 00004.
--
-- Supabase only. Backend Flyway migrations (V1-V5) are NOT touched:
-- the local/default profiles run ddl-auto and pick these columns up
-- from the JPA entity.
-- ============================================================

do $$
begin
  -- to_regclass is immune to search_path and information_schema privilege
  -- quirks: it returns null when the relation is not visible/does not exist.
  --
  -- Unlike 00003 (a broad reconcile file that skips absent tables with a
  -- notice), this migration exists *only* to add these two columns. Skipping
  -- silently would report success while accomplishing nothing, so it fails
  -- loudly instead: public.documents is created by 00001.
  if to_regclass('public.documents') is null then
    raise exception
      'public.documents does not exist - apply 00001_create_all_tables.sql (and 00002, 00003) before this migration.'
      using hint = 'Supabase migrations are order-dependent: run 00001 -> 00002 -> 00003 -> 00004.';
  end if;

  alter table public.documents add column if not exists retention_policy_id   uuid;
  alter table public.documents add column if not exists retention_expires_at  timestamp;

  -- Supports the nightly scan for documents whose retention window is
  -- closing or already closed. Partial: only rows actually under a
  -- retention schedule are of interest.
  create index if not exists idx_documents_retention_expires_at
    on public.documents (retention_expires_at)
    where retention_expires_at is not null;
end
$$;
