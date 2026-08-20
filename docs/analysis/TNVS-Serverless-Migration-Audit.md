# TNVS Facilities & Administrative Management System
## Serverless-Migration Audit & Feasibility Report

**Date:** 2026-08-18
**Status:** READ-ONLY audit complete. No code modified, nothing committed, nothing deployed.
**Scope:** Existing Spring Boot 3.3.5 (Java 21) backend + React/Vite frontend + Supabase PostgreSQL.

---

# Executive Summary (Read This First)

Your system **can** be moved to a fully remote, serverless, PC-independent architecture,
and your existing Supabase database and frontend can be preserved. But the honest
headline is this:

> **This is a REWRITE of the backend, not a port.** Spring Boot, JPA/Hibernate,
> Servlet filters, STOMP/SockJS, `@Scheduled`, and the JVM's in-memory state do not
> exist on Vercel Functions or Supabase Edge Functions. Those two runtimes are
> Node.js/Deno + TypeScript. Every one of the 222 REST endpoints and ~40 services
> must be re-implemented in TypeScript. The database, the API JSON contract, and the
> React frontend can largely survive unchanged; the Spring Boot backend cannot.

The recommended target is **Option C (Hybrid)**:

```
React/Vite frontend  (unchanged, on Vercel)
        |
        +-- REST:  Vercel Functions (Node.js, TypeScript)  -- preserves /api/v1/* contract
        |               |
        |               +-- JWT verify (reuse jjwt-style HS256, same secret/claims)
        |               +-- @supabase/postgrest-js or pg client (service_role, server-side)
        |               +-- Rate limiting (DB-backed or Upstash-style store, NOT in-memory)
        |               +-- AI provider calls (server-side secrets)
        +-- Realtime: Supabase Realtime (WebSocket)   -- replaces STOMP/SockJS
        +-- Files:    Supabase Storage                 -- replaces local disk upload/download
        +-- Jobs:     pg_cron (DB) + Vercel Cron (HTTP hooks)
        |
Supabase PostgreSQL (SAME project, SAME tables - do not recreate)
```

The single most important correction to your assumptions: **Supabase Edge Functions
(Deno) and Vercel Functions (Node) cannot run Java.** Any plan that implies keeping
the Spring Boot logic is impossible. The only way to reach your goal is to rewrite
the backend in TypeScript and run it on serverless functions, while preserving the
DB, the frontend, and the API shapes.

Detailed evidence for every claim is in the 15 phases below.

---

# Phase 1 - Full Codebase Audit (Dependency Map)

## Inventory (from source tree, 437 tracked files)

- **28 Spring Boot `@RestController` classes, 222 HTTP endpoints.**
- **~40 service classes**, 30+ repositories, ~60 JPA entities, ~30 DTOs.
- 9 Flyway migrations (`V1`-`V9`) and 6 Supabase migrations (`00001`-`00006`) that
  have **diverged** (see Phase 5).
- Frontend: React 19 + Vite 6 + TypeScript, axios, zustand, @stomp/stompjs 7,
  sockjs-client 1.6, @supabase/supabase-js 2.110.

## 1. Controllers & endpoints (222 total)

| Area | Controller(s) | Endpoints |
|---|---|---|
| Auth | AuthController, HrAssistanceController | 7 |
| AI | AiController | 24 |
| Admin | BackupController, IntegrationController, SystemConfigController, UserAdminController, NotificationController, HrAssistanceAdminController | 11 |
| Analytics/Dashboard | AnalyticsController, DashboardController, KpiController | 3 |
| Documents | DocumentController | 5 (1 upload, 1 download) |
| Contracts | ContractController | 3 |
| Compliance | ComplianceController | 17 |
| Legal | LegalCaseController, LegalOfficerController | 27 |
| Procurement | ProcurementOfficerController | 30 |
| Facilities | FacilityController, FacilitiesOfficerController, FacilitiesManagerController | 33 |
| Visitor | VisitorController | 9 |
| Employee | EmployeeController | 22 |
| Requests | RequestReviewController | 5 |
| Monitoring | SystemMonitoringController | 2 |
| Security | SecurityAdminController, SecurityThreatMapController | 14 |
| Notifications | UserNotificationController | 5 |

## 2-6. Services / Repositories / Entities / DTOs

- Entities grouped by module: auth (User/Role/Permission/RefreshToken/AuditLog),
  security (SecurityLog/BlockedIp/ActiveSession/LoginHistory/SecurityAlert/ApiRequestLog),
  documents (Document/Folder/Category/Tag/DocumentGrant), facilities (Facility/Room/
  Equipment/Reservation/MaintenanceSchedule/ReservationApproval), visitor (Visitor/
  VisitorVerification/VisitorWatchlist), legal, contracts, procurement, employee,
  compliance, admin, monitoring.
- Services implement CRUD + business rules + (in many cases) fabricated AI/analytics
  (see Phase 8). Repositories are Spring Data JPA interfaces.
- DTOs are plain records used to flatten entities for the frontend. **These shapes
  ARE the API contract and can be preserved in TypeScript.**

## 7-10. Authentication / Authorization / JWT / Refresh tokens

- **JWT:** jjwt 0.12.6, HS256, `JWT_SECRET` env → `Keys.hmacShaKeyFor`.
  Access = 15 min (`JWT_ACCESS_EXPIRY:900000`), refresh = 7 days. Claims: `roles`
  (comma list), `type` (ACCESS/REFRESH), `sub`, `iss`, `jti`, `iat`, `exp`.
  Stateless (no access-token blacklist).
- **Refresh rotation:** DB-backed `refresh_tokens` table. Refresh → old row revoked,
  new row created. No token-family/reuse detection. `deleteExpiredTokens()` exists but
  is never called (leak).
- **RBAC:** DB tables `roles`, `permissions`, `user_roles`, `role_permissions`;
  `@EnableMethodSecurity` + `@PreAuthorize` on ~10 controllers; URL rules in
  `SecurityConfig`. Frontend role comes from JWT `roles` claim (decoded client-side)
  and login `user.roles`.
- **Critical:** `JwtAuthenticationFilter` does `loadUserByUsername()` (JOIN FETCH
  roles+permissions) on **every authenticated request** - 1 DB query per request just
  for authorization.

## 11-13. Security filters / rate limiting / audit

| Filter | Mechanism | State |
|---|---|---|
| IpBlacklistFilter | DB `blocked_ips` EXISTS check per request | DB (safe) |
| SuspiciousRequestFilter | static regex for SQLi/XSS/path traversal | stateless |
| RateLimitingFilter | **bucket4j ConcurrentHashMap per ip:path** | **IN-MEMORY (blocker)** |
| SecurityAuditInterceptor | writes `security_logs` row per request + optional HIGH/CRIT alert | DB |
| JwtAuthenticationFilter | JWT verify + user reload | stateless |

- Audit logging writes a `security_logs` row **synchronously** per request
  (`@Async` is declared but **no `@EnableAsync` exists**, so `@Async` runs on the
  caller thread).
- ~3-4 DB round-trips per authenticated request from the security infra alone.

## 14. Scheduled jobs / background threads (assume an always-on JVM)

| File | Schedule | Purpose |
|---|---|---|
| SecurityThreatBroadcastService.broadcastEvents | 5 s | threat EVENT + `writeBackGeo` (DB + geo HTTP) |
| SecurityThreatBroadcastService.broadcastSync | 30 s | full threat snapshot |
| UserActivityService.reapStaleSessions | 60 s | expire stale `active_sessions` |
| RealtimeDashboardService.broadcastSystemStats | 2 s | JVM stats (meaningless serverless) |
| RealtimeDashboardService.broadcastFacilitiesSync | 3 s | DB count queries → STOMP |
| RealtimeDashboardService.broadcastOnlineUsers | 5 s | active sessions → Supabase REST |
| SubsystemHealthMonitorService.runMonitoringCycle | 5 s | 6 subsystem checks, several `findAll()` per tick |
| ComplianceScheduler (3 cron jobs) | daily 01/02/08 | retention, contract expiry, visitor cleanup |
| BackupService (single-thread executor) | on-demand | CSV dump to **local disk** |
| BootstrapAdmin (CommandLineRunner) | startup | seed users/demo data |
| RealtimeDashboardService (ApplicationReadyEvent) | startup | initial metrics broadcast |
| @PostConstruct x4 | startup | load AI configs/providers/instructions/geo cache |

## 15-16. WebSocket / STOMP / SockJS

- `WebSocketConfig`: **in-memory SimpleBroker** (`/topic`, `/queue`), endpoint
  `/ws-endpoint` + SockJS, `setAllowedOriginPatterns("*")`, no heartbeat config,
  app prefix `/app`, user prefix `/user`.
- 12 STOMP destinations: `/topic/security/threats`, `/topic/dashboard/{metrics,charts,
  insights,system,notifications}`, `/topic/facilities/sync`,
  `/topic/system-monitoring/subsystems`, `/topic/ai/config`, `/topic/backups`,
  `/user/{email}/queue/notifications`, `/user/{email}/queue/admin-notifications`.
- `StompSessionRegistry` = in-memory `ConcurrentHashMap` (sessionId → Authentication).

## 17. Realtime broadcasters

- STOMP: dashboard, threats, system-monitoring, ai/config, backups, notifications.
- **Supabase already partially used:** `SupabaseRealtimePublisher` writes to
  `user_activity_events` / `online_users` via **PostgREST REST** (not the Realtime
  WebSocket). Frontend `useLiveActivities` already subscribes to those two tables via
  supabase-js Realtime. **This is the exact seam where your realtime already works
  serverlessly** - it just isn't used for anything except online-user activity.

## 18-21. File upload/download, AI, OCR, classification

- **Storage:** `DocumentStorageService` writes to `${FILE_STORAGE_PATH}` default
  `/mnt/fileserver/facilities`, fallback `${java.io.tmpdir}/facilities-documents`.
  Absolute path persisted in `documents.file_path`; downloads read local disk.
  `Document.supabaseStorageUrl` column exists but is **never populated**.
- **OCR:** `OcrService` is a **stub** - returns a canned string. tika/tess4j declared
  in pom.xml but never referenced in code.
- **Classification:** `DocumentClassificationAiService` = keyword substring matching.
  `ContractAnalyticsAiService` = **hardcoded mock clauses**. Chat (`AiChatGateway`,
  `ReservationLlmGateway`) is the only real LLM call, via blocking `RestTemplate`
  with no timeouts.

## 22. External API integrations

- AI providers (OpenAI/Gemini/Anthropic/Azure-compatible) - blocking HTTP.
- ip-api.com geolocation - Caffeine-cached, 2 s timeout, fail-open.
- Supabase PostgREST (anon key).
- Gmail SMTP (password reset, HR assistance).

## 23-24. CORS / Actuator

- CORS: allowed-origin patterns from `CORS_ORIGINS`, credentials true, max-age 3600.
- Actuator: health, info, metrics, prometheus exposed.

## 25-28. DB migrations / Flyway / Supabase integration / Storage

- **Flyway disabled in the supabase profile** (`flyway.enabled: false`);
  Hibernate `ddl-auto: update` is authoritative in production. Flyway V1-V9 is legacy.
- Supabase migrations `00001`-`00006` create **47 tables** (incl. realtime tables);
  RLS enabled on 45, only 13 have permissive "allow all for anon" policies (dev-mode).
- Storage config block (`app.storage.backup` supabase bucket) is configured but unused.
- **WARNING:** `application.yml` supabase defaults reference project ref
  `dunijfrvfozwlykpkfhy` (ap-southeast-1) but the linked project is
  `nlzfosfyyqileruosebi` (ap-southeast-2). Resolve before migrating.

## 29-38. Filesystem / local-machine / long-running / in-memory state

- Local disk: document upload/download, backup CSVs. Everything else is DB or classpath.
- Long-running processes: backup executor thread, all `@Scheduled` timers.
- In-memory state (all lost on restart / broken in serverless):
  - bucket4j rate-limit buckets
  - STOMP SimpleBroker session/subscription maps
  - StompSessionRegistry
  - Caffeine geo cache
  - `lastEventWatermark` (threat broadcast)
  - SubsystemHealthMonitor rolling histories + latestSnapshot + WS counters
  - AiStateManagementService provider/log/counter lists
  - ModuleAiConfig / ModuleInstruction ConcurrentHashMaps
  - SseEmitter list in SecurityThreatMapController (never fed - dead code)

---

# Phase 2 - Serverless Compatibility Classification

| Component | Current implementation | Target | Difficulty | Risk | Notes |
|---|---|---|---|---|---|
| Auth login/refresh/logout | Spring AuthService + JWT + DB refresh_tokens | Vercel Function (TypeScript), reuse jjwt claims, `jsonwebtoken` | Medium | Med | Contract preserved |
| JWT verify per request | jjwt filter + user reload | Vercel Function middleware + `@supabase/auth-helpers` or plain jsonwebtoken | Medium | Low | Avoid per-request user reload; verify claims only |
| RBAC | DB roles + @PreAuthorize | Postgres functions / RLS + TypeScript middleware | Medium | Med | Keep SUPER_ADMIN gating in middleware |
| Refresh rotation | DB `refresh_tokens` | Same table, same logic in TS | Low | Med | Fix missing reuse-detection while here |
| Account lockout | DB `users` counters | Keep DB columns; logic in login function | Low | Low | DB-backed already |
| Rate limiting | bucket4j in-memory | DB table or managed store (Upstash/Vercel KV) or PostgREST-based | Medium | Med | **MUST leave JVM memory** |
| IP blacklist | DB `blocked_ips` | Same, checked in middleware/function | Low | Low | DB-backed already |
| Audit logging | per-request `security_logs` insert | DB insert in each function (or RLS + trigger) | Low | Med | Per-request writes multiply |
| Suspicious request filter | static regex | Edge middleware (Vercel Edge or Supabase Realtime auth) | Low | Low | Move to CDN/gateway |
| Document upload/download | local disk | **Supabase Storage** | Medium | Med | Biggest storage change |
| Backup service | local CSV + executor | pg_cron / Supabase backup / Vercel Cron | Medium | Low | Replace entirely |
| AI chat | blocking RestTemplate | fetch/undici in Vercel Function | Low | Low | Keys server-side |
| OCR/classification | stubs | Real OCR = external service (e.g. Document AI/LLM vision); fits serverless (async) | Med | Low | It's already fake - no regression |
| Threat map build | JPA aggregates | TS + SQL aggregates | Medium | Med | Real logic port |
| Threat EVENT/SYNC | @Scheduled 5s/30s STOMP | Supabase Realtime + DB trigger/broadcast | Medium | Med | See Phase 4 |
| Dashboard broadcast | @Scheduled 2s/3s/5s STOMP | Supabase Realtime broadcast (on change) or client polling | Medium | Low | Drop fabricated chart data |
| System monitoring | @Scheduled 5s JVM+DB | Replaced by real platform health or removed | Medium | Low | JVM stats meaningless |
| Online users | DB + Supabase REST | Keep: already serverless-side via `online_users` | Low | Low | **Already done** |
| Compliance jobs | cron daily | pg_cron + Vercel Cron | Low | Low | |
| STOMP/SockJS client | @stomp/stompjs + sockjs-client | **Supabase Realtime** client (supabase-js) | Medium | Med | See Phase 4 |
| CORS | Spring config | Vercel `vercel.json` headers + Supabase Realtime | Low | Low | |
| Health checks | Actuator | Vercel `/api/health` function + Supabase health | Low | Low | |

---

# Phase 3 - Supabase Edge Functions vs Vercel Functions vs Hybrid

### A. Supabase Edge Functions (Deno/TypeScript)

- **Runtime:** Deno. Cannot run Java/Spring. Requires a full TypeScript rewrite.
- **Limits (Free):** 500,000 invocations/mo, 256 MB memory, ~150 s wall clock.
- **DB access:** Excellent - native `supabase-js` with service_role; co-located with
  the database (lower latency than Vercel → Supabase round-trips).
- **Auth:** native `@supabase/supabase-js` + `verifyJWT`; integrates with Supabase
  Auth users table. Custom JWT still verifiable with `jsonwebtoken`-equivalent (jose).
- **Strengths for you:** Realtime (see Phase 4) and Storage live in Supabase, so Edge
  Functions are the natural home for: DB-triggered webhooks, Realtime event handlers,
  auth callbacks, small utility endpoints, and any logic that must run close to the DB.
- **Weaknesses for you:** 222 endpoints as Deno functions is a large footprint; Deno
  ecosystem differs from Node; cold starts; a capstone-size API surface is too big to
  live comfortably here alone.

### B. Vercel Functions (Node.js/TypeScript)

- **Runtime:** Node.js 20/22. Cannot run Java. Requires TypeScript rewrite.
- **Limits (Hobby, 2026):** ~1M function invocations/mo (some sources 100K), function
  duration up to ~300 s max (Node, `maxDuration`), 2 GB memory, 100 GB bandwidth.
  Commercial use NOT allowed on Hobby (personal/educational only).
- **Strengths for you:** Your frontend is already on Vercel. Vercel Functions can
  expose `/api/v1/*` (or `/api/*`) so `VITE_API_BASE_URL` just changes host.
  Node ecosystem (jsonwebtoken, pg/postgres, supabase-js, tesseract.js, fetch) is the
  most familiar. Best fit for the bulk of your CRUD + AI + auth endpoints.
- **Weaknesses:** Each request is a separate process - no in-memory shared state, no
  WebSockets/STOMP, no always-on schedulers. Latency to Supabase is network RTT
  (acceptable for capstone). Long-running heavy work needs async patterns.

### C. Hybrid (RECOMMENDED)

| Capability | Placement | Why |
|---|---|---|
| REST CRUD API (most of 222 endpoints) | **Vercel Functions** | Node/TS, contract preserved, frontend co-located |
| Auth (login/refresh/logout/JWT) | **Vercel Functions** | Same shape as today |
| AI calls | **Vercel Functions** | Server-side keys, Node HTTP |
| Geolocation | **Vercel Function** | http to ip-api (or move to Supabase Edge if latency matters) |
| Realtime (threats, dashboard, notifications, online users) | **Supabase Realtime** | Managed WebSocket; already partially wired |
| File storage (documents) | **Supabase Storage** | Managed, remote, download URLs |
| Scheduled/cleanup jobs | **pg_cron + Vercel Cron** | DB-side cron for DB work; HTTP cron for function work |
| Database | **Supabase Postgres (unchanged)** | Service-role via Vercel Functions, RLS as defense-in-depth |
| Edge utility/webhook functions | **Supabase Edge Functions** (optional) | Realtime/webhook glue |

**Verdict:** Hybrid. It alone preserves the frontend, the DB, the API contract, the
security model, and your free-tier constraints.

---

# Phase 4 - Realtime Architecture (STOMP vs Supabase Realtime)

## Current STOMP surface

- 12 destinations across dashboard/threats/monitoring/ai/backups/notifications.
- In-memory SimpleBroker + SockJS + in-memory session registry: **cannot run on
  serverless functions** (no long-lived socket server, no shared memory).

## Options evaluated

| Option | Verdict for your app |
|---|---|
| Keep Spring STOMP/SockJS | **Impossible** serverless - requires an always-on socket server |
| Vercel Functions streaming/SSE | Weak - no realtime fan-out, no push to many clients, Hobby limits; NOT a WebSocket broker |
| SSE | Possible fallback for threat map only, but Supabase Realtime is simpler and already present |
| **Supabase Realtime (postgres_changes + broadcast)** | **RECOMMENDED** - managed WebSocket, works serverless, 200 concurrent conns free |
| Database-triggered realtime | The mechanism behind Supabase Realtime - use it |

## Why Supabase Realtime is the right answer here

1. **It's already in your stack.** `SupabaseRealtimePublisher` writes
   `user_activity_events` + `online_users` via PostgREST, and the frontend already
   subscribes to both via supabase-js (`useLiveActivities`). The pattern works today.
2. **Your data is already in Postgres.** `postgres_changes` on
   `security_logs`/`active_sessions`/notifications tables gives you push without a
   broker. A broadcast on the realtime channel lets the backend (or a DB trigger /
   Edge Function) publish events to subscribed browsers.
3. **Free tier:** 200 peak concurrent connections, 2M messages/mo - fine for a
   capstone with a handful of concurrent admins.
4. **Frontend migration is mechanical** (already 80% there):
   - `@stomp/stompjs` `Client` → `supabase.channel('...')` + `on('postgres_changes', ...)`.
   - `/topic/security/threats` → channel `security-threats`; EVENT/SYNC → broadcast
     messages plus `postgres_changes` on `security_logs`.
   - `/user/{email}/queue/notifications` → per-user channel filtered by `user_id` +
     RLS; or keep a `notifications` table with RLS and `postgres_changes` insert.
   - Online users → already Supabase Realtime.
   - Dashboard metrics → either `postgres_changes` on the relevant tables or the
     frontend polls REST every N seconds (simplest; the current broadcasts are
     partially fabricated data anyway - see Phase 8).

**Recommendation: remove STOMP/SockJS entirely.** Keep the REST snapshot endpoints
(the frontend already re-fetches on reconnect) and layer Supabase Realtime on top.
This is the single largest realtime change but it is well-scoped and partially built.

---

# Phase 5 - Database Architecture

## Current database state (Supabase, production)

- **47 tables** (from `supabase/migrations/00001-00006` + `realtime.sql`). 45 have
  RLS enabled; only 13 have permissive "allow all for anon" policies (dev-mode).
- **No stored procedures, functions, or triggers exist** in any migration.
- Flyway V1-V9 is **legacy and dormant** (disabled in supabase profile).
- **Do NOT recreate the database.** Keep the same Supabase project and tables; only
  apply additive changes.

## What can move into Postgres (safely, without duplicating logic)

| Item | Move to DB? | Why / how |
|---|---|---|
| Security log insert | Optional - trigger on `security_logs` | Keeps audit even if a function fails; use a SECURITY DEFINER function |
| Online-user upsert | Optional | Already done via PostgREST |
| Rate limiting | **Yes - DB table** `rate_limit_counts` | In-memory bucket4j cannot scale; a simple INSERT/UPDATE with TTL row works |
| Account lockout | **Keep** (already DB) | `users.failed_login_attempts`, `locked_until` - no change |
| Refresh token rotation | **Keep** (already DB) | `refresh_tokens` - no change; add missing cleanup cron |
| Retention / expiry jobs | **pg_cron** | DB-side scheduling of DB work |
| RLS | **Tighten** | Replace the 13 permissive anon policies with `authenticated`/service-role policies; keep RLS on all 45 |

## Risks / required changes

1. **RLS permissive policies are a security debt.** The backend currently uses the
   `postgres` (superuser-ish) role which bypasses RLS. Serverless functions should use
   the **service_role** key server-side (bypasses RLS, keeps behavior identical).
   RLS remains as defense-in-depth for any accidental client-side access.
2. **No functions/triggers exist today** - so there is nothing to "port"; you can
   add them fresh without migration risk.
3. **Resolve the project-ref mismatch** (`dunijfrvfozwlykpkfhy` in application.yml
   vs linked `nlzfosfyyqileruosebi`).
4. **Baseline your schema before touching code** (see Phase 14 step 1).

---

# Phase 6 - Authentication

## Options

| Option | Verdict |
|---|---|
| **A. Keep custom JWT system** | **RECOMMENDED** - preserves exact security model, contract, and lockout/rotation logic; ports to TypeScript in one function |
| B. Migrate to Supabase Auth | Replaces your `users`/`roles`/`permissions`/lockout logic with Supabase's `auth.users` - a **big rewrite** of auth, RBAC, and every user-related query; risks breaking SUPER_ADMIN/role semantics |
| C. Other serverless auth | Adds a dependency for no benefit |

## Recommendation: Option A (custom JWT, ported)

- Re-implement with `jsonwebtoken` (Node) using the **same** `JWT_SECRET`, HS256, same
  claims (`roles`, `type`, `sub`, `iss`, `jti`), same 15-min/7-day expiries.
- Keep the `users`, `roles`, `permissions`, `user_roles`, `role_permissions`,
  `refresh_tokens` tables exactly as they are.
- Port `AuthService.login/refresh/logout`, `LoginAttemptService` (lockout),
  `AuditService.log`, and `UserActivityService.registerSession/heartbeat` to TS.
- Security parity maintained: BCrypt (`bcrypt` npm, cost 12), refresh rotation,
  revocation on logout, lockout counters. **Improve while porting:** add refresh-token
  reuse detection and a real cleanup job for expired tokens (both missing today).

---

# Phase 7 - Security Preservation

## What is preserved 1:1
- RBAC + SUPER_ADMIN: same roles/permissions, enforced in TS middleware (claim decode)
  plus DB role checks.
- Authentication: same JWT, same refresh rotation, same lockout.
- Audit logs, security logs, blocked IPs, active sessions, login history, security
  alerts: same tables, same writes.
- Input validation: keep `zod` (TS) mirroring the current `@Valid` DTO constraints.
- BCrypt hashing, CORS config (Vercel headers), security headers (Vercel headers).

## What becomes WEAKER / needs explicit handling

| Item | Current | Serverless risk | Mitigation |
|---|---|---|---|
| Client IP detection | `ClientIpResolver` honors XFF only from loopback/private peers | Vercel injects its own XFF chain; the last trusted proxy differs | Use Vercel's `request.headers['x-forwarded-for']` correctly + Vercel's own `x-vercel-forwarded-for`; document the trust boundary |
| Rate limiting | in-memory per instance | **bypassable** (per-function state) | DB-backed or managed store (Vercel KV / Upstash); or Supabase table + TTL |
| Request logging / audit | per-request interceptor | high write volume per function call | Keep (functions write security_logs), or DB trigger |
| Secrets (service_role, DB password, JWT_SECRET, AI keys, encryption key) | env vars | Must stay env vars on Vercel/Supabase, NEVER in `VITE_*` | Vercel Project Env (Server-side) + Supabase Secrets; keep `AI_API_KEY_ENCRYPTION_KEY` for AES-GCM decryption of stored keys |
| Secrets exposure risk | - | **Vercel Hobby builds are public to the owner only** | Never use service_role in client; keep all keys server-side |
| Security headers / CSP | default | customize in `vercel.json` | add headers config |

---

# Phase 8 - AI Provider

## Current reality (important)
- **OCR is a stub** (`OcrService` returns a canned string). **Classification is
  keyword matching. Contract analysis is hardcoded mocks.** Only `/v1/ai/chat` and the
  reservation AI endpoints make real LLM calls (blocking, no timeout).
- AI provider keys are AES-256-GCM encrypted at rest (`ai_providers.encrypted_api_key`,
  master key = `AI_API_KEY_ENCRYPTION_KEY` env), never serialized to the frontend.

## Serverless placement

```
Vercel Function (Node)  ->  fetch(baseUrl + '/chat/completions')  ->  AI Provider
      ^ keys from Vercel env (server-side) only
```

**Vercel Function is the better host for AI** (Node HTTP, familiar, `maxDuration`
sufficient for a single LLM call ~<60 s). Supabase Edge Functions are equally capable
but Node is your stack.

## Execution limits check
- Real LLM chat: fits comfortably (single request, blocking, <60 s).
- OCR/classification: currently fake, so **no regression**; if you later want real OCR,
  upload the file to Supabase Storage, then either:
  - call an external OCR/Document-AI API from a Vercel Function (best), or
  - run a Vercel Function that downloads from Storage and uses tesseract.js (heavy).
  Either way it fits serverless with the 256 KB sample approach you already use.

---

# Phase 9 - File Storage

## Current
- `DocumentStorageService` writes to a **local disk** path; absolute path saved in
  `documents.file_path`; downloads read local disk. `supabase_storage_url` column is
  never populated. **This is the biggest single blocker** - files vanish when the PC
  is off and are invisible to serverless instances.

## Target: Supabase Storage (recommended)
- `app.storage.backup` bucket `facilities-documents` already configured - use it.
- Upload: Vercel Function receives multipart → uploads bytes to Supabase Storage
  (service_role) → stores the public/signed URL in `documents.supabase_storage_url`.
- Download: generate a signed URL in a Vercel Function (or set bucket to public and
  serve directly) → keep `Content-Disposition` behavior by signing with
  `?download=`.
- Migration of existing files: copy local files (or the `/mnt/fileserver` contents)
  into the Storage bucket once, then update `supabase_storage_url` per row.
- Free tier: 1 GB storage, 50 MB per-file limit (your app allows 100 MB - reduce to
  50 MB or document the cap), 5 GB egress.

---

# Phase 10 - Scheduled Tasks (serverless replacements)

| Current | Replacement | Runs where |
|---|---|---|
| Threat EVENT (5s) / SYNC (30s) | DB trigger or Realtime broadcast on `security_logs` insert + client re-sync on connect | Postgres + Realtime |
| Dashboard broadcasts (2s/3s/5s) | Drop the fabricated JVM stats; client polls REST every 15-30 s OR `postgres_changes` on core tables | Client + Realtime |
| Online users (5s) | Keep - already Supabase PostgREST | PostgREST |
| reapStaleSessions (60s) | pg_cron every minute: UPDATE active_sessions SET status='EXPIRED' WHERE last_activity < now() - interval '5 min' | pg_cron |
| Subsystem health (5s) | Remove JVM-based checks; keep only real platform checks (optional) | n/a |
| Compliance daily crons (3) | pg_cron + optional Vercel Cron invoking an Edge/Function | pg_cron |
| Backup service | Supabase CLI `db dump` via GitHub Action / Vercel Cron → store to Supabase Storage or a private repo | CI/CD |
| Refresh-token cleanup | pg_cron daily delete | pg_cron |
| BootstrapAdmin seeding | Idempotent migration/seed SQL run once (or a Vercel Function on deploy) | Supabase migration |

**Rule:** DB-only work → `pg_cron`; work that needs a function → **Vercel Cron**
(one HTTP call per schedule, free tier includes cron). Never start a permanently
running scheduler process.

---

# Phase 11 - API Compatibility Mapping

The frontend calls `VITE_API_BASE_URL` (default `/api/v1`) with module-relative paths.
Preserving this means: Vercel Functions mounted under `/api/v1/...` so the browser
keeps the same request shapes and response JSON.

| Current Spring endpoint | New serverless endpoint | Where | Change |
|---|---|---|---|
| POST /api/v1/auth/login | POST /api/v1/auth/login | Vercel Function | Same body/response |
| POST /api/v1/auth/refresh | POST /api/v1/auth/refresh | Vercel Function | Same |
| GET /api/v1/admin/dashboard/summary | GET /api/v1/admin/dashboard/summary | Vercel Function | Same |
| GET /api/v1/admin/kpi | GET /api/v1/admin/kpi | Vercel Function | Same |
| GET /api/v1/admin/analytics | GET /api/v1/admin/analytics | Vercel Function | Same |
| GET /api/v1/security/ip-threats/vector-map | GET /api/v1/security/ip-threats/vector-map | Vercel Function | Same; realtime moves to Realtime |
| GET /api/v1/security/ip-threats/stats | GET /api/v1/security/ip-threats/stats | Vercel Function | Same |
| GET /api/v1/security/ip-threats/stream | (REMOVE) | - | Dead SSE - never fed; delete |
| GET /api/v1/security/admin/logs | GET /api/v1/security/admin/logs | Vercel Function | Same |
| POST /api/v1/documents/upload | POST /api/v1/documents/upload | Vercel Function → Supabase Storage | Response keeps same shape; file goes to Storage |
| GET /api/v1/documents/{id}/download | GET /api/v1/documents/{id}/download | Vercel Function → signed Storage URL | Same response shape |
| POST /api/v1/ai/chat | POST /api/v1/ai/chat | Vercel Function | Same |
| POST /api/v1/ai/classify | POST /api/v1/ai/classify | Vercel Function | Same |
| POST /api/v1/facilities-officer/ai/suggest | POST /api/v1/facilities-officer/ai/suggest | Vercel Function | Same |
| GET /api/v1/contracts, /visitors, /employee/..., /legal/..., /procurement/..., /compliance/... | same paths | Vercel Function | Same JSON DTOs ported to TS types |
| /api/v1/admin/backups POST | /api/v1/admin/backups POST | Vercel Function + pg_cron | Different internals, same API |
| STOMP /ws-endpoint | REMOVED | Supabase Realtime | Frontend store rewrite (Phase 4) |

**Summary:** ~95% of endpoints keep the same path + request + response; the internals
are re-implemented. Only `/security/ip-threats/stream` is deleted and the STOMP
endpoint is replaced. This keeps the frontend service layer almost untouched.

---

# Phase 12 - Environment Variables

| Current variable | Target location | Safe for client? | Action |
|---|---|---|---|
| `VITE_API_BASE_URL` | Vercel frontend env | Yes | Point to new serverless host, e.g. `https://<project>.vercel.app/api/v1` |
| `VITE_WS_BASE_URL` | **REMOVE** | n/a | Replaced by Supabase Realtime URL |
| `VITE_SUPABASE_URL` | Vercel frontend env | Yes | Keep (already present) |
| `VITE_SUPABASE_ANON_KEY` | Vercel frontend env | Yes (publishable) | Keep |
| `JWT_SECRET` | Vercel Function env | **NO** | Same value, server-side only |
| `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` | Vercel Function env | No | Keep |
| `SUPABASE_DB_PASSWORD` | Vercel Function env | **NO** | Direct pooler connect (or prefer service_role) |
| `SUPABASE_SERVICE_KEY` (service_role) | Vercel Function env | **NO** | New - for serverless DB access |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` (server-side) | Vercel Function env | No (anon ok client-side too) | Keep |
| `AI_API_KEY_ENCRYPTION_KEY` | Vercel Function env | **NO** | Same AES-GCM master key |
| AI provider API keys | Vercel Function env (or encrypted in DB) | **NO** | Keep DB encryption, decrypt in function |
| `FILE_STORAGE_PATH`, `FILE_STORAGE_URL` | **REMOVE** | n/a | Supabase Storage replaces them |
| `BACKUP_STORAGE_PATH` | **REMOVE** | n/a | pg_cron / GitHub Action backup |
| `CORS_ORIGINS` | Vercel `vercel.json` headers | n/a | Convert to response headers |
| `MAIL_USERNAME`, `MAIL_PASSWORD` | Vercel Function env | **NO** | Keep for password-reset email |
| `SPRING_PROFILES_ACTIVE`, `SUPABASE_DB_USERNAME`, Flyway props | **REMOVE** | n/a | Spring-only |
| `HR_CONTACT_EMAIL`, lockout tuning vars | Vercel Function env | No | Keep |

**Rule enforced:** nothing with `SECRET`, `KEY`, `PASSWORD`, `service_role`,
`JWT_SECRET`, or AI keys ever reaches the browser. Only `VITE_SUPABASE_*` and
`VITE_API_BASE_URL` are client-side.

---

# Phase 13 - Cost (Free-Tier Realism)

## Supabase Free (2026)
- 500 MB database, 1 GB storage, 5 GB egress/mo, 50K MAU, 500K Edge Function
  invocations, **200 concurrent Realtime connections**, 2M Realtime messages.
- **Pauses after ~7 days of inactivity** (must keep-alive or accept staging-only).
- **No automatic backups** (use GitHub Action + `supabase db dump`).
- Commercial use permitted.

## Vercel Hobby (2026)
- 100 GB bandwidth, ~1M function invocations/mo (some sources 100K), functions up to
  ~300 s (Node `maxDuration`), 2 GB memory, Vercel Cron available.
- **Commercial use NOT allowed** (personal/educational only) - relevant for a
  capstone; check this against your grading/usage terms.
- No WebSockets for your own sockets - fine, Realtime is Supabase's.

## Realistic assessment for capstone/staging
- **Yes**, the hybrid (Vercel Hobby + Supabase Free) can run your app for a capstone
  staging environment at **$0**.
- Two caveats that are NOT "free forever":
  1. **Vercel Hobby is non-commercial** - acceptable for a capstone, not for a paid
     product.
  2. **Supabase Free pauses after 7 days of inactivity and has no backups** - add a
     keep-alive (Vercel Cron touching the DB or Realtime ping) and a weekly
     `supabase db dump` to a private repo.
- If you later need commercial or guaranteed uptime: Supabase Pro ($25/mo) and Vercel
  Pro ($20/seat/mo) - still no Railway/Render.

---

# Phase 14 - Migration Strategy (No Code Changed Yet)

A safe, phased plan. The Spring Boot backend remains as a fallback until parity.

| Step | Phase | Files affected | Expected change | Risk | Rollback | Validation |
|---|---|---|---|---|---|---|
| 0 | Baseline | `supabase/`, DB | `supabase db dump` snapshot; record table inventory | none | n/a | dump restores |
| 1 | Auth | new `api/auth/*` TS | Port login/refresh/logout/lockout/rotation (same JWT) | Med | Keep Spring login live | E2E login both stacks |
| 2 | DB access layer | new TS `db/` | supabase-js service_role + pg client; RLS tightened (additive) | Med | DB unchanged; only additive SQL | `supabase db reset` on clone |
| 3 | REST APIs | new `api/**/*.ts` | Port 222 endpoints in module batches (auth → security → documents → facilities → ...) | High (largest) | Route flag to Spring or new host | Contract tests (fixtures from current responses) |
| 4 | File storage | `documentService.ts`, Storage bucket | Upload/download via Supabase Storage + signed URLs; migrate existing files | Med | Keep local path working | Upload→download roundtrip E2E |
| 5 | AI services | new `api/ai/*` | Port chat; keep key encryption; real OCR later | Low | Keep `/ai/*` on Spring | Chat E2E |
| 6 | Realtime | `securityThreatStore`, `dashboardStore`, `realtimeSyncStore`, `notificationRealtimeStore`, `useLiveActivities` | Replace @stomp/stompjs with supabase-js Realtime channels | Med | Keep STOMP client as fallback branch | Realtime marker appears on login E2E |
| 7 | Scheduled jobs | new `cron/`, Supabase SQL | pg_cron jobs + Vercel Cron + DB triggers | Med | Scheduler toggles off | Run each job manually |
| 8 | Frontend env | `frontend/.env*`, `vercel.json` | Point VITE_API_BASE_URL at new host; remove VITE_WS_BASE_URL | Low | Old env restore | `npm run build` + live smoke |
| 9 | Security testing | test suites | RBAC, SUPER_ADMIN, lockout, rate-limit, XFF, secret absence | Med | n/a | Re-run EndpointAuthorizationTest scenarios against new host |
| 10 | Deployment | Vercel project | Deploy functions + frontend; env vars set (never client-visible) | Low | Revert env | Health endpoint + login |
| 11 | Remove Cloudflare | - | Delete tunnel; stop local backend; keep PC off | Low | Restart local backend if needed | Full E2E with PC off |
| 12 | Final E2E | whole app | Login → dashboard → threat map → upload → AI → notifications | Med | Rollback to Spring host | Grading runbook |

---

# Phase 15 - Final Verdict

1. **Can my current system become serverless?** Yes, but by **rewriting the Spring
   Boot backend in TypeScript**, not by porting it. The DB and frontend survive.
2. **Is Supabase suitable?** Yes - Postgres, Realtime, Storage, Auth-less custom JWT,
   pg_cron, Edge Functions are all suitable; keep your existing project.
3. **Is Vercel suitable?** Yes for the frontend (already) and as the Node/TS REST API
   host via Vercel Functions.
4. **Should I use Supabase Edge Functions?** For glue/utility/webhook/Realtime-event
   functions only. Not as the primary 222-endpoint API host (Deno rewrite cost).
5. **Should I use Vercel Functions?** Yes - the primary REST API layer.
6. **Should I use a hybrid architecture?** **Yes - this is the recommendation
   (Option C).**
7. **Can I completely remove Cloudflare Tunnel?** Yes - after the rewrite, no tunnel
   is needed.
8. **Can the system work while my PC is turned off?** Yes - fully (modulo the
   Supabase-free-tier pause caveat, solved with a keep-alive).
9. **Can I preserve the current database?** Yes - same project, same tables; only
   additive changes (RLS tightening, pg_cron, index/trigger additions). Never recreate.
10. **Can I preserve RBAC/security?** Yes - same roles/permissions/JWT/lockout in TS;
    SUPER_ADMIN gating kept; secrets stay server-side.
11. **Can I preserve AI functionality?** Yes - AI calls are plain HTTP; keys stay
    server-side. Real OCR can be added later without regression (current OCR is a stub).
12. **Can I preserve realtime functionality?** Yes - but **STOMP/SockJS must be
    replaced by Supabase Realtime**; the frontend migration is mechanical and already
    partially implemented (`useLiveActivities`).
13. **What MUST be rewritten?** All Spring services/controllers (~40 files), STOMP
    layer, bucket4j rate limiting, local-disk storage, scheduled jobs, backup service,
    and the in-memory state holders. (~222 endpoints of TS.)
14. **What can remain unchanged?** Supabase DB schema, most API JSON contracts,
    the React frontend UI (with realtime + env swaps), JWT secret/claims, BCrypt
    hashes, existing documents (after file copy).
15. **Lowest-complexity architecture:** Vercel Functions (REST, TS) + Supabase
    Postgres/Realtime/Storage + pg_cron/Vercel Cron. Keep custom JWT.
16. **Lowest-cost architecture:** same as #15 on Vercel Hobby + Supabase Free = $0
    for a capstone, with the two non-technical caveats (Hobby non-commercial; Free
    pauses/no backups).
17. **Safest migration path:** the 13-step Phase-14 plan with the Spring backend kept
    live as a rollback target until parity.

## The honest bottom line

Your goal is achievable on free tiers with no PC and no tunnel, and most of what you
built (DB, frontend, contracts, security) survives. The cost is that the **entire
Java backend is re-implemented in TypeScript** on Vercel Functions + Supabase
Realtime/Storage. That is a real, multi-week rewrite, not a configuration change.
The single hardest parts to get right are (a) the realtime migration off STOMP,
(b) moving documents to object storage, and (c) porting the 222-endpoint business
logic with matching JSON. Everything else is straightforward serverless
re-implementation of logic that is already DB-backed.

No code was modified, nothing was committed or deployed during this audit, and the
Spring Boot backend, database, and Cloudflare tunnel were left untouched.
