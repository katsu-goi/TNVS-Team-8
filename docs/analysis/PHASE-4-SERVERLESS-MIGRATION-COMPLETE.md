# Phase 4 — Serverless Migration Complete (Edge Functions)

**Status:** COMPLETE — all module Edge Functions deployed to `dunijfrvfozwlykpkfhy` and live-verified (221 routes across 18 functions).
**Date:** 2026-08-20
**Scope:** Phase 4 of the Supabase-only migration — re-implementation of the Spring Boot backend as Deno Edge Functions on the existing Postgres database. Spring Boot remains as a fallback until full parity (realtime/storage/jobs pending, see §7).
**Predecessors:** [PHASE-0-REPORT](PHASE-0-REPORT.md) · [PHASE-1-EDGE-FUNCTIONS-INFRASTRUCTURE](PHASE-1-EDGE-FUNCTIONS-INFRASTRUCTURE.md) · [PHASE-2-AUTH-EDGE-FUNCTION](PHASE-2-AUTH-EDGE-FUNCTION.md) · [PHASE-3-RBAC-SECURITY-MIDDLEWARE](PHASE-3-RBAC-SECURITY-MIDDLEWARE.md) · [TNVS-Serverless-Migration-Audit](TNVS-Serverless-Migration-Audit.md)

---

## 1. Architecture

- **Runtime:** Supabase Edge Functions (Deno) behind `/functions/v1/{function}/{routePath}`.
- **Deploy mode:** every function is deployed with `--no-verify-jwt`; tokens are custom HS256 JWTs (same `JWT_SECRET`/claims as Spring) verified in-handler via `_shared/jwt.ts`. GoTrue `/auth/v1/token` is unusable because `auth.users` is empty — login is served by the custom `auth` function.
- **DB access:** service-role PostgREST (`_shared/db.ts` → `adminDb()`), preserving the existing schema untouched. RLS remains as defense-in-depth.
- **Shared middleware (`supabase/functions/_shared/`):**
  - `guard.ts` — route table + segment matching + `public`/`auth`/`roles`/`permissions` guards; 401 `UNAUTHORIZED` / 403 `ACCESS_DENIED` / 404 `NOT_FOUND` envelopes byte-match Spring; per-request DB user reload (mirrors `JwtAuthenticationFilter.loadUserByUsername`).
  - `envelope.ts` — Spring-faithful `ok(data,msg)` / `ok(msg)` / `fail(msg,code,errors)` overloads.
  - `cors.ts` — `GET,POST,PUT,PATCH,DELETE,OPTIONS`, exposes `Content-Disposition`; preflight 204.
  - `jwt.ts` (jose HS256 verify) · `auth-users.ts` (user/roles/permissions, `userSummary`) · `db.ts` · `config.ts` · `ip.ts` · `subsystem-health.ts` (shared subsystem checks).
- **Time rule:** Spring persists `LocalDateTime` naive into `timestamptz` (UTC); all functions use `toUtcIso()` / `naiveIso()` (no `Z`). DB "today" = 2026-08-20.

## 2. Function inventory (221 routes + 2 support functions)

| Function | Routes | Guard | Mirrors (Spring) |
|---|---|---|---|
| `auth` | 8 | public×5, auth×3 | AuthController, HrAssistanceController |
| `rbac-demo` | 4 | auth×1, roles×2, permissions×1 | Phase-3 proof |
| `admin` | 17 | roles | UserAdminController, SystemConfigController, IntegrationController, BackupController, NotificationController, HrAssistanceAdminController, KpiController |
| `security` | 9 | roles | SecurityAdminController |
| `dashboard` | 1 | roles | DashboardController |
| `analytics` | 1 | roles | AnalyticsController |
| `monitoring` | 2 | roles | SystemMonitoringController |
| `documents` | 5 | auth | DocumentController |
| `contracts` | 3 | roles | ContractController |
| `compliance` | 17 | roles | ComplianceController |
| `legal` | 27 | roles | LegalCaseController, LegalOfficerController |
| `procurement` | 30 | roles | ProcurementOfficerController |
| `facilities` | 31 | roles | FacilityController, FacilitiesOfficerController, FacilitiesManagerController |
| `visitor` | 9 | roles | VisitorController |
| `employee` | 27 | roles | EmployeeController, RequestReviewController |
| `notifications` | 5 | auth | UserNotificationController |
| `ai` | 25 | roles×24, auth×1 | AiController (all `SUPER_ADMIN`; `/ai/chat` authenticated) |
| `spike` | 0 | — | connectivity probe |

Route guard distribution: `roles` 230, `auth` 14, `public` 5, `permissions` 1 across all functions.

## 3. Batch execution & live verification

Each batch was verified against the live project with a self-contained script: **fresh logins → DB baseline snapshot → exercise every route (200s, 401/403/404s, authz matrix, DB truth-checks) → cleanup → baseline-restored assertion**.

| Batch | Function(s) | Verification |
|---|---|---|
| A–I (prior) | auth, admin, security, compliance, legal, procurement, facilities, visitor, employee, notifications | verified, baseline clean |
| J | documents | **40/40 PASS**, baseline restored |
| K | dashboard, analytics, monitoring (+ `_shared/subsystem-health.ts`) | **74/74 PASS**, baseline restored |
| L | ai | **109/109 PASS**, baseline restored (`verify-batchl.mjs`) |

`verify-batchl.mjs` (final batch): baseline via dynamic snapshot + DB-clock cutoff; cleaned AI audit rows after cutoff; restored `ai_providers`/`ai_module_config` byte-exact; re-asserted `ai_providers`/`ai_module_config`/`audit_logs` back to baseline.

## 4. AI module parity (Batch L)

- **DB-backed (consistent):** `ai_providers` (registry, soft-delete, `is_default`, AES-256-GCM key encryption) and `ai_module_config` (per-module enabled/provider/model/fallback/execution-mode/features + audit rows `CREATE/UPDATE_AI_MODULE_CONFIG`, module `AI`, entity `AiModuleConfig`, INFO/SUCCESS).
- **In-memory (mirrors Spring `AiStateManagementService`):** system prompt, request logs, module instruction cache (6 module `.md` files + system_prompt embedded), analytic counters.
- **Heuristics (no LLM, parity with Spring stubs):** `classifyDocument` keyword → 6 categories; `summarizeDocument` = `"AI Summary: " + first 250 chars + "..."`; `analyzeContract` fixed LOW-risk + 2 clauses; visitor OCR canned `Juan Carlos De La Cruz` / `CLEARED`; `detectModule` route heuristics; `dataContext` = real DB counts.
- **Chat:** composes system prompt + module/related instructions + caller authorities + live counts, then graceful fallback (`liveLlm=false`) when no usable provider/key.
- **Live-upstream paths:** model catalog fetch (`/ai/models`, `/ai/modules/:id/models`) and `/ai/test-connection` do real HTTP against provider base URLs with 15s timeouts and friendly error mapping (`describeUpstreamError`).
- **Enabled/disabled:** with no usable provider the module endpoints return `status: "DISABLED"` (verified); adding a decryptable provider flips them to real heuristic execution (verified end-to-end including provider CRUD, default swapping, and audit writes).

### 4.1 Key encryption caveat
New providers are encrypted/decrypted round-trip by the edge function (Web Crypto AES-256-GCM; key from `AI_API_KEY_ENCRYPTION_KEY` env, else derived from `JWT_SECRET`). **Existing Spring-sealed keys cannot be decrypted until `AI_API_KEY_ENCRYPTION_KEY` is set to the same value Spring used** — until then the seeded `GSM` provider reports `apiKey=null` / `OFFLINE` and modules degrade gracefully to DISABLED/fallback. This is the one env dependency needed to light up the live provider.

### 4.2 Multi-instance caveat (inherent to edge functions)
Spring holds AI logs/system prompt/instruction cache/module-toggle in a single JVM. Supabase Edge Functions are stateless per instance, so that ephemeral state is **per-instance**: rapid sequential requests may be served by different warm instances and not observe each other's in-memory writes. DB-backed state (providers, module config, audit) is fully consistent. The verify suite asserts the DB truth and each mutation's own response; ephemeral-state reads are treated as non-deterministic. If a single-writer requirement ever emerges, the prompt/logs/instructions should be moved to a DB table.

## 5. Parity notes worth recording

- **Auth:** login/refresh/logout/heartbeat/reset + lockout are Phase-2 verified; the access token TTL is 900 s, so verify runs re-login before each batch (each login writes 1 `AUTH` audit row + 1 `login_history` row — accounted for by snapshot/cleanup).
- **Envelope:** `ok(string)` intentionally has **no** `data` field (Spring-faithful). During Batch L this exposed a handler bug where `ok(id, msg)` swallowed the id into the message — fixed to `ok({ id }, msg)` and re-verified.
- **Analytics labels:** Spring `Duration.toHours()` truncates, so `periodLabel`/`buildLabels`/`bucket` use `Math.floor(hours)`; a raw 24h+ε range now correctly reads "Last 24 Hours".
- **Dashboard:** 6 live counts with message `"Dashboard metrics loaded successfully"`.
- **Monitoring:** 6 subsystems `SYS-FAC-01 … SYS-CON-06`, all `HEALTHY`, overall `OPERATIONAL`, warnings/offline/errors 0; unknown subsystem id → 200 with `data:null`.

## 6. Operations

- **Deploy:** `supabase functions deploy <name> --no-verify-jwt --project-ref dunijfrvfozwlykpkfhy`.
- **Shared libs are bundled per function** — redeploy each dependent function after editing `_shared/`.
- **Secrets live in function env only** (never in the client bundle): `JWT_SECRET`, `SUPABASE_URL`, service-role key, DB pooler creds, `AI_API_KEY_ENCRYPTION_KEY` (for live AI providers).
- **Verification workflow:** refresh tokens → dynamic baseline + DB-clock cutoff → run → pg cleanup → baseline-restored check; `cleanup` stage available per batch if a run crashes mid-mutation.
- All edge functions (and this report) are **uncommitted** in the working tree (`supabase/functions/`, `supabase/migrations/002_*`, `docs/analysis/PHASE-*`) — commit only when instructed.

## 7. Remaining non-parity items (future phases)

Per the [Serverless-Migration Audit](TNVS-Serverless-Migration-Audit.md) Phase 14 plan, these were intentionally deferred and are the remaining gap between "REST parity" and "full serverless":

1. **Realtime:** STOMP/SockJS → Supabase Realtime (already partially wired via `user_activity_events`/`online_users`).
2. **File storage:** local-disk document upload/download → Supabase Storage (bucket `facilities-documents` exists, unused).
3. **Scheduled jobs:** `@Scheduled` crons, session reaping, retention/expiry → `pg_cron` / cron HTTP hooks.
4. **Rate limiting & in-memory buckets:** bucket4j per-instance map → DB-backed or managed store.
5. **Backups:** local CSV executor → Supabase CLI dumps / cron.

Until those land, the Spring Boot backend stays available as a fallback. REST/API parity for the 221-route Edge surface (Batches A–L) is complete and verified.