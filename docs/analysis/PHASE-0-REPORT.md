# PHASE 0 REPORT — Production Database Verification & Safe Baseline

**Date:** 2026-08-18
**Author:** Migration assistant (read-only verification)
**Status:** COMPLETE — all checks performed. STOP after this report.

> **APPROVED CHANGE (2026-08-18, user-approved):** cleared the permanent lockout on `fo@photonicomega.com` — `UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE email='fo@photonicomega.com'` (1 row). This was the only data modification in Phase 0 and was explicitly approved by the project owner.

---

## PROJECT VERIFICATION

- **Candidate project (from audit):** `nlzfosfyyqileruosebi` (ap-southeast-2, "TNVS team 8")
- **Verified live project:** `dunijfrvfozwlykpkfhy` (ap-southeast-1)
- **Confirmed live?** NO for `nlzfosfyyqileruosebi` — **YES for `dunijfrvfozwlykpkfhy`**
- **Evidence:**
  - `nlzfosfyyqileruosebi.supabase.co` → **DNS ENOTFOUND** (does not resolve).
  - Pooler connect to `postgres.nlzfosfyyqileruosebi@aws-0-ap-southeast-2.pooler.supabase.com` → **`XX000 tenant/user not found`** on both ports 5432 and 6543.
  - `dunijfrvfozwlykpkfhy.supabase.co` → resolves; REST health reachable (401 on unauthenticated = normal).
  - Pooler connect to `postgres.dunijfrvfozwlykpkfhy@aws-0-ap-southeast-1.pooler.supabase.com:6543` → **CONNECTED** (PostgreSQL 17.6).
  - The candidate ref `nlzfosfyyqileruosebi` exists only in: `supabase/.temp/*` (git-ignored CLI metadata), the header comment of `supabase/migrations/00001_create_all_tables.sql`, and `docs/claude-enhancement-prompt.md`. It is stale/phantom metadata — likely a CLI link to a project that was deleted or never existed.
  - All runtime configuration (backend, frontend, DEPLOYMENT.md, VERCEL-405-FIX.md) points at `dunijfrvfozwlykpkfhy`, and that project is the one containing all real data (see below).

---

## DATABASE

- **Expected tables (from audit):** ~47
- **Actual tables:** **56 public base tables** (reconciled: `pg_class relkind='r'` = 56; `information_schema` BASE TABLE = 56; the `pg_tables` query returned 59 rows because it included duplicate rows)
- **Columns:** 853 · **Primary keys:** 59 · **Foreign keys:** 37 · **Indexes:** 138 · **Sequences:** 2
- **Seven demo users present?** **YES** — all 7 exist with correct roles:
  - `admin@photonicomega.com` → SUPER_ADMIN
  - `fm@photonicomega.com` → FACILITIES_MANAGER
  - `fo@photonicomega.com` → FACILITIES_OFFICER (⚠ locked_until = 2027-08-17, 3 failed attempts — permanently locked)
  - `co@photonicomega.com` → COMPLIANCE_OFFICER
  - `legal@photonicomega.com` → LEGAL_OFFICER
  - `contract@photonicomega.com` → CONTRACT_OFFICER
  - `employee@photonicomega.com` → EMPLOYEE
- **Important tables present:** users, roles, permissions, user_roles, role_permissions, refresh_tokens (130 rows: 7 live / 123 revoked), security_logs (3,557 rows), login_history (15), blocked_ips (0), active_sessions (48: 11 REVOKED / 37 EXPIRED), security_alerts (1 HIGH), documents (8), reservations (4), facilities (1), visitors (2), contracts (4), user_activity_events (0), online_users (0) — all present.
- **Current data appears production?** **YES** — 3,557 security logs from 2026-08-16 → 2026-08-18, real logins, real IPs (43.240.55.29), real geo (Philippines / Caloocan / Metro Manila / ISP / ASN), real business records.
- **Schema vs migrations diverge:** 56 tables in DB vs ~47-59 described across `supabase/migrations/00001–00006` + `realtime.sql` + Flyway `V1–V9`. The live DB is JPA/`ddl-auto: update`-shaped; the migration files are an older/incomplete projection. Do not trust migrations as the source of truth — the baseline below is.

---

## RUNTIME CONFIGURATION

- **Spring currently points to:** `dunijfrvfozwlykpkfhy` — `backend/src/main/resources/application.yml:281-282` (supabase profile default `aws-0-ap-southeast-1.pooler.supabase.com:6543`, user `postgres.dunijfrvfozwlykpkfhy`). Confirmed by log evidence: the backend wrote threat-map/security records with geo into this project.
- **Frontend currently points to:** `dunijfrvfozwlykpkfhy` — `frontend/.env` (`VITE_SUPABASE_URL=https://dunijfrvfozwlykpkfhy.supabase.co`, anon key `sb_publishable_UWaHC31yeIQCKgSN20oPEg_qY-iJsQE`), also `.env.example`, `.env.production.example`, `.env.local`, `DEPLOYMENT.md:78,107-108`, `docs/VERCEL-405-FIX.md:81`.
- **Supabase CLI linked project:** `nlzfosfyyqileruosebi` (in `supabase/.temp/project-ref`, `linked-project.json`, `pooler-url`) — **stale; the project does not exist.**
- **Conflicting references found:**
  - `nlzfosfyyqileruosebi`: `supabase/.temp/*` (gitignored), `supabase/migrations/00001_create_all_tables.sql:3` (comment only), `docs/claude-enhancement-prompt.md:24` (doc), audit report.
  - `dunijfrvfozwlykpkfhy`: `application.yml:278,282`, `frontend/.env`, `frontend/.env.example`, `frontend/.env.production.example`, `.env.local`, `DEPLOYMENT.md:78,107-108,181`, `docs/VERCEL-405-FIX.md:81`, `frontend/src/vite-env.d.ts` (var name, neutral).
- **Verdict:** The `dunijfrvfozwlykpkfhy` references are the correct, live, self-consistent configuration. The `nlzfosfyyqileruosebi` references are dead/archival and should be cleaned up in a later phase (not now).

---

## THREAT MAP

- **Real security logs present?** **YES** — 3,557 rows in `security_logs`, latest 2026-08-18T04:23:00Z.
- **Geo data present?** **YES** — 32 logs carry `geo_location` JSON (e.g. `{"latitude":"14.7061","longitude":"120.9888","country":"Philippines","countryCode":"PH","region":"Metro Manila","city":"Caloocan","timezone":"Asia/Manila","isp":"BF DOMINGO ENTERPRISES","asn":"AS154261 ..."}`).
- **Recent activity present?** **YES** — logs from 2026-08-18 (today), `LOGIN_SUCCESS`, `READ_RESOURCE`, `READ_FACILITY_ROOM`, etc. `login_history` has 15 rows (latest 2026-08-18T04:22:53Z).
- **Threat-map data source:** `security_logs` + `login_history` + `blocked_ips` + `active_sessions` are the aggregation inputs; `ip_threats` table is empty (0 rows) — the vector map is computed from security_logs at query time, consistent with the service design.
- **No data was created or modified to verify this** — all reads only.

---

## BASELINE

- **Baseline created?** **YES**
- **Location:** `docs/analysis/PHASE-0-PRODUCTION-BASELINE.md` (schema/data snapshot; tables + columns + types + PK/FK/index + RLS + policies + functions + triggers + views + sequences + realtime publications + extension list + storage config)
- **Database modified?** **NO** — read-only SELECTs against information_schema/pg_catalog/pg_tables/pg_policy/pg_publication/storage.buckets and table counts. Nothing written, altered, truncated, dropped, or reset. No `supabase db reset`, no migrations run.

---

## RISK ASSESSMENT (items to resolve before Phase 1)

1. **Project-ref cleanup is deferred, not fixed.** The migration must target `dunijfrvfozwlykpkfhy` everywhere. The stale `nlzfosfyyqileruosebi` CLI metadata and doc references must be removed/updated during Phase 1 infrastructure (config-only change, no DB impact). **Do not** run `supabase link` against the phantom ref.
2. **Demo user `fo@photonicomega.com` is permanently locked** (`locked_until` 2027-08-17, 3 failed attempts). If the E2E/verification plan requires the FACILITIES_OFFICER account, its lockout must be cleared (this is a data change — requires approval; noted for Phase 2/verification planning, not done now).
3. **RLS is deny-by-default with zero policies.** All 56 tables have RLS ON (except `ai_providers`, `contract_clauses`). `anon`/`authenticated` reads return empty. This is actually a **safe** posture but **breaks the existing Supabase Realtime/PostgREST pattern**: `user_activity_events` / `online_users` are empty (0 rows) and the frontend's `postgres_changes` subscriptions and the backend's PostgREST publisher would receive/write nothing under RLS with no policies. Realtime migration (Phase 11) must reconcile with this: either add targeted policies or move fully to Broadcast-tick + JWT-REST (already the chosen approach).
4. **Schema source of truth is the live DB, not migrations.** Do not apply `supabase/migrations/*` or Flyway as-is — they are stale. Phase 1 must baseline from the live dump/snapshot (`PHASE-0-PRODUCTION-BASELINE.md`) and only add what's needed.
5. **No `pg_cron` extension installed** — scheduled-job migration (Phase 12) must install/enable pg_cron (or use Supabase's scheduled Edge Functions) as an additive step, never touching data.
6. **No Storage buckets exist** (0 buckets, 0 objects) — Phase 5 must create the `facilities-documents` bucket. The existing 8 `documents` rows reference local filesystem paths (from the old Spring local storage), which cannot be reached from Supabase Storage; a file migration/backfill decision is needed.
7. **Credentials note:** direct DB access used the known pooler password for `dunijfrvfozwlykpkfhy`. No Management-API access token or service-role key was available in the environment; Phase 1 infrastructure work will need the Supabase service-role key and (ideally) an access token from the project owner to configure functions, buckets, and scheduled jobs.
8. **Backend currently not running** (only VS Code JDT process remains; port 8080 free). This is fine — the migration proceeds against the DB directly.

---

## DECISION NEEDED (before Phase 1)

Confirm the corrected live project and whether the `fo@photonicomega.com` lockout should be cleared:

- **Live project for all migration work:** `dunijfrvfozwlykpkfhy` (ap-southeast-1) — the `nlzfosfyyqileruosebi` ref is dead. **DECISION (2026-08-18): CONFIRMED — proceed on dunijfrvfozwlykpkfhy.**
- **`fo@photonicomega.com` lockout:** **DECISION (2026-08-18): CLEARED** (UPDATE above).

Phase 0 is complete. **STOPPED as required** — no Edge Functions, no JWT migration, no RLS changes, no realtime/storage/cron work, no frontend env changes, no Spring removal, no Cloudflare removal, no migrations run.
