# TNVS — Phase 1 Deliverables (D1–D6)

> **Companion documents:** `TNVS-Phase0-Report.md` (reconnaissance) · `TNVS-Phase2-Deliverables.md` (D7–D13) · `TNVS-Phase3-Deliverables.md` (D14–D16)
> **Labelling per Master Prompt §5:** `[VERIFIED]` = read from actual repository files · `[ASSUMED]` = inference, flagged for confirmation
> **Constraint reminder:** R1 no rebuild · R2 no redesign · R3 preserve `frontend/`/`backend/`/`supabase/` · R7 additive migrations only · R8 reuse existing JWT + RBAC · R10 no invention

---

# DELIVERABLE 1 — REPOSITORY ANALYSIS `[VERIFIED]`

## 1.1 Corrected canonical stack

This table supersedes §3 of the Master Prompt. All subsequent deliverables target it.

| Layer | Technology | Version | Source |
|---|---|---|---|
| Backend runtime | Spring Boot | 3.3.5 | `backend/pom.xml` parent |
| Language | Java | 21 | `<java.version>` |
| Build | Maven | — | `backend/pom.xml` |
| Persistence | Spring Data JPA / Hibernate | via BOM | `spring-boot-starter-data-jpa` |
| Migrations | Flyway | via BOM | `flyway-core`, `flyway-database-postgresql` |
| Database | PostgreSQL | — | `org.postgresql:postgresql` |
| Auth | Spring Security + jjwt | 0.12.6 | `security/SecurityConfig.java` |
| API docs | springdoc-openapi | 2.6.0 | `backend/pom.xml` |
| Mapping / boilerplate | MapStruct 1.6.2 · Lombok 1.18.34 | | |
| Realtime | Spring WebSocket (STOMP/SockJS) + Supabase `postgres_changes` | | |
| Cache | Caffeine (`@EnableCaching`) | | |
| Rate limiting | Bucket4j | 8.10.1 | |
| Document / OCR | Apache Tika 2.9.2 · Tess4J 5.13.0 | | |
| QR encoding | ZXing | 3.5.3 | |
| Frontend build | Vite | 6 | `frontend/package.json` |
| UI | React 19 + TypeScript 5.7 | | |
| Routing | react-router-dom | 7.1.3 | |
| Styling | TailwindCSS | 3.4.17 | `frontend/tailwind.config.js` |
| State | Zustand | 5.0.3 | |
| HTTP | Axios | 1.7.9 | |
| Charts / maps | Recharts 3.10 · Leaflet 1.9 | | |
| Icons | lucide-react | 0.474 | |
| BaaS client | `@supabase/supabase-js` | 2.110.8 | |

**Not present, contrary to §3:** PHP · Next.js · ShadCN/Radix · OpenAI SDK · n8n.

## 1.2 Directory structure (R3 — preserve exactly)

```
TNVS-Team-8/
├── package.json                     ← thin root wrapper, delegates to frontend/
├── backend/                         ← Spring Boot (Maven)
│   ├── pom.xml
│   ├── POSTGRES_PROFILE.md
│   └── src/main/
│       ├── java/com/photonicomega/
│       │   ├── facilities/          ← SCANNED. @SpringBootApplication base package
│       │   │   ├── ai/              ← AiController + 4 "AI" services
│       │   │   ├── common/dto/      ← ApiResponse<T> envelope
│       │   │   ├── config/
│       │   │   ├── security/        ← SecurityConfig, JWT filter, UserDetails
│       │   │   └── module/          ← admin · auth · compliance · contracts
│       │   │                           dashboard · documents · facilities
│       │   │                           legal · security · visitor
│       │   └── security/            ← NOT SCANNED. Orphan duplicate (P0-6)
│       └── resources/
│           ├── application.yml      ← 5 profiles; committed secrets (P0-5)
│           └── db/migration/        ← V1..V5
├── frontend/                        ← Vite + React
│   ├── package.json · tailwind.config.js · tsconfig.json · vite.config.ts
│   ├── unused_security/             ← non-compiling dead code, excluded from build
│   └── src/
│       ├── api/                     ← 8 axios service modules
│       ├── components/{auth,compliance,facilities,facilities-officer,layout,sysadmin}
│       ├── hooks/ · lib/ · stores/ · types/
│       └── App.tsx                  ← 38 routes, 4 guards
└── supabase/
    ├── migrations/00001_create_all_tables.sql   ← divergent 2nd schema
    └── realtime.sql
```

**Module convention (new code must follow):** `module/<name>/{controller,service,repository,domain,dto}` — established by `compliance`, `contracts`, `documents`, `facilities`, `legal`, `visitor`. Two packages deviate (`ai/` and `module/dashboard/` place controllers at the package root); new modules follow the majority.

## 1.3 Conventions to reuse (R1 / R2 / R6)

| Concern | Established pattern | Reference |
|---|---|---|
| HTTP response | `ApiResponse<T>` — `{success, message, data, errors, errorCode, timestamp, path}` via `ApiResponse.success(data, msg)` / `.failure(msg, code)` | `common/dto/ApiResponse.java` |
| Route base | `server.servlet.context-path: /api` + `@RequestMapping("/v1/<resource>")` → public path `/api/v1/...` | `application.yml` |
| Frontend base | `axios` instance with `baseURL = VITE_API_BASE_URL ?? '/api/v1'`; services call `/compliance/...` etc. | `api/client.ts:3-8` |
| Dev proxy | Vite proxies `/api`, `/v1`, `/ws-endpoint` → `localhost:8080` | `vite.config.ts` |
| Primary keys | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | V1, V2, V4, V5 (V3 deviates) |
| Audit columns | `created_at, updated_at, created_by, updated_by` | V1, V2, V4, V5 |
| Soft delete | `is_deleted BOOLEAN NOT NULL DEFAULT FALSE, deleted_at, deleted_by` | V1, V2, V4, V5 |
| JPA auditing | `@EnableJpaAuditing(auditorAwareRef = "auditorAwareImpl")` | `FacilitiesManagementApplication.java` |
| Table naming | `snake_case`, plural | all migrations |
| Migration naming | `V<n>__snake_case_description.sql` — **next is `V6`** | `db/migration/` |
| Dependency injection | Constructor injection via Lombok `@RequiredArgsConstructor` | all controllers |
| API documentation | `@Tag` on class, `@Operation(summary = ...)` on method | all controllers |
| Design tokens | Tailwind `theme.extend`: `brand.*`, `surface.*`, `content.*`, `border.*`, `accent`, `success/error/warning`, `rounded-card`, `shadow-{glass,card,soft,medium,strong,heavy}` | `tailwind.config.js` |
| Auth state | Zustand `authStore` — `{user, accessToken, refreshToken}` + `getDashboardPath(user)` role→landing-page mapper | `stores/authStore.ts` |
| 401 handling | Axios response interceptor clears tokens and hard-redirects to `/login` | `api/client.ts:22-34` |

## 1.4 Convention violations already in the baseline

Recorded so new code does not propagate them. Remediation is Deliverable 16.

1. **V3 breaks every schema convention** — `BIGSERIAL` PKs instead of UUID, `TIMESTAMPTZ` instead of `TIMESTAMP`, `INET`/`JSONB` types, `blocked_ips` keyed on `ip_address INET`, and **no audit or soft-delete columns**. Its six tables cannot participate in the standard auditing pattern.
2. **Supabase `00001` re-declares 12 tables with incompatible shapes** — `security_logs.id` is `uuid` there vs `BIGSERIAL` in V3; `blocked_ips` is uuid-keyed there vs `INET`-keyed in V3; `reservations` uses `start_time`/`end_time`/`employee_name` there vs `start_datetime`/`end_datetime`/`requester_id` in V2.
3. **Controllers call repositories directly** in `contracts`, `documents`, `legal`, `visitor`, `admin` — no transaction boundary, no place to hang audit writes.
4. **`app.scheduler.*` cron config is orphaned** — `retention-check-cron`, `contract-expiry-cron`, `visitor-cleanup-cron` are read by no code. The only `@Scheduled` methods are the dashboard broadcasters.
5. **`SecurityThreatMapController` hardcodes `/api/...` in `@GetMapping`** while `context-path` already prepends `/api`, producing `/api/api/security/...`.
6. **`"lint": "eslint ."` cannot run** — no `eslint` dependency, no config file.
7. **Zero tests** in either half of the repo; no `.github/`, no CI.
8. **`lib/supabaseClient.ts` is a 0-byte file** alongside the working 9-line `lib/supabase.ts`.

## 1.5 Collaboration state vs §10

| §10 expectation | Reality |
|---|---|
| Feature branches | Single branch `main` |
| PR review | No PR history; 12 direct commits |
| Meaningful commit messages | 10 of 12 are the literal string `commit` |
| Multiple contributors | One author, "Administrator" |
| CI gates | None — no `.github/` directory |

§10 is **aspirational, not established**. D16 proposes the minimum scaffolding to satisfy §10 and the §14 Definition of Done without disrupting the current flow.

---

# DELIVERABLE 2 — ARCHITECTURE ANALYSIS `[VERIFIED]`

## 2.1 Runtime topology

```
Browser (Vite dev :5173 / static build)
   │
   ├── axios  ──────────────► /api/v1/**  ──► Spring Boot :8080  ──► PostgreSQL
   │   (Bearer JWT from localStorage)          (context-path /api)     (Flyway V1..V5)
   │
   ├── SockJS/STOMP ────────► /ws-endpoint ──► Spring WebSocket broker
   │                                            └── RealtimeDashboardService
   │                                                @Scheduled 2s / 3s / 5s
   │
   └── @supabase/supabase-js ──────────────────────────────────► Supabase Postgres
       (postgres_changes subscriptions, anon key)                (schema 00001 + realtime.sql)
```

## 2.2 Layering — as designed vs as built

The intended layering is the standard Spring three-tier. Actual adherence is partial:

| Module | Controller | Service | Repository | Layering intact? |
|---|---|---|---|---|
| `auth` | ✓ | `AuthService`, `AuditService` | ✓ | **Yes** |
| `compliance` | ✓ | `ComplianceService` | ✓ | **Yes** |
| `facilities` | ✓ ×3 | `RoomAvailabilityService`, `ReservationAiService` | ✓ | **Yes** |
| `dashboard` | ✓ ×2 | `RealtimeDashboardService` | ✓ (14 repos) | **Yes** |
| `security` (module) | ✓ ×2 | `SecurityAuditService`, `UserActivityService` | ✓ | **Yes** |
| `contracts` | ✓ | **none** | ✓ | **No** — controller → repository |
| `documents` | ✓ | **none** | ✓ | **No** |
| `legal` | ✓ | **none** | ✓ | **No** |
| `visitor` | ✓ | **none** | ✓ | **No** |
| `admin` | ✓ ×5 | **none** | ✓ | **No** |

`ContractController.java:26-44` is representative — the controller injects `ContractRepository` directly, calls the AI service inline, and saves. No `@Transactional`, no audit write, no DTO boundary (the JPA entity is both request body and response body, so every column is client-writable including `created_by` and `is_deleted`).

**Architectural implication:** the five service-less modules are exactly the five §6 modules that need the most new work (B, C, E, F and the admin surface). New work must introduce the missing service layer rather than extend the controller-to-repository shortcut — this is additive, not a redesign, so it is R2-compliant.

## 2.3 Authentication and authorisation architecture (R8 — reuse, do not rewrite)

**What exists and works, and must be reused verbatim:**

- Stateless `SessionCreationPolicy.STATELESS`, CSRF disabled — correct for a token API.
- BCrypt strength 12 password encoder.
- jjwt 0.12.6 issuing access + refresh tokens; `refresh_tokens` table for rotation.
- A JWT filter populating `SecurityContextHolder`; `CustomUserDetailsService` resolving roles from `users` → `user_roles` → `roles`.
- Public allowlist: `/v1/auth/login|refresh|forgot-password|reset-password`, swagger, `/actuator/health|info`, `/files/**`, `/ws-endpoint/**`.
- `@EnableMethodSecurity(prePostEnabled = true)` is already switched on — **method-level `@PreAuthorize` is available today and requires no configuration change.**

**What is broken (P0-2, P0-3) and what that means for new work:**

Authorisation is four path prefixes plus `.anyRequest().authenticated()`. Six route families carry no role check at all: `/v1/contracts`, `/v1/documents`, `/v1/legal-cases`, `/v1/visitors`, `/v1/facilities`, `/v1/ai/**`. The single `@PreAuthorize` in the codebase sits in the unscanned orphan package and is dead code.

R8 says reuse the existing JWT + RBAC middleware. The JWT half is sound and will be reused unchanged. The RBAC half is *present but unenforced* — so "reuse" for new endpoints means **applying `@PreAuthorize` on every new controller method using the existing role vocabulary**, which extends the mechanism rather than replacing it. No change to `SecurityConfig`'s filter chain is required for new modules.

The role vocabulary to use is the **`BootstrapAdmin` set** (`SUPER_ADMIN`, `ADMIN`, `FACILITIES_MANAGER`, `FACILITIES_OFFICER`, `COMPLIANCE_OFFICER`), because that is what real users actually hold and what both `SecurityConfig` and the frontend guards test. The V4-seeded set is unreachable. Reconciling the two vocabularies is a D16 refactor, not a prerequisite.

## 2.4 Data architecture — the dual-source-of-truth problem

This is the single largest architectural risk in the repository.

| | Flyway (`backend/.../db/migration`) | Supabase (`supabase/migrations/00001`) |
|---|---|---|
| Consumer | Spring Boot / Hibernate | Browser via `supabase-js`, PostgREST |
| Tables | 31 | 13 |
| Overlapping names | — | 12 of the 13 collide with Flyway names |
| Shapes | UUID PK, `TIMESTAMP`, audit + soft-delete columns | UUID PK, `timestamptz`, `created_at` only |
| RLS | none | all 13, `using (true) with check (true)` |
| Authority | **Authoritative for the application** | Divergent copy |

The two schemas are **not** two views of one database — they describe *different column sets for identically-named tables*. Any code that reads `reservations` through `supabase-js` sees `start_time`/`employee_name`; the same table through JPA has `start_datetime`/`requester_id`. Whichever database a given deployment points at, one of the two access paths is wrong.

**Position taken for all subsequent deliverables:** Flyway is the schema authority (R7). Supabase's role is narrowed to **Realtime transport only** — the two tables in `realtime.sql` plus any future broadcast-only tables. D11 specifies this boundary. No existing Supabase object is dropped (R7); the divergent `00001` file is left in place and marked deprecated in documentation rather than deleted.

## 2.5 The `ddl-auto` profile split

| Profile | Flyway | `ddl-auto` | Consequence |
|---|---|---|---|
| `default` | enabled | `validate` | **Fails to start** — 6 entities have no table (P0-1) |
| `docker` | enabled | inherits | same exposure |
| `test` | disabled | `create-drop` | H2, isolated |
| `local` | **disabled** | **`update`** | starts, Hibernate invents the missing tables |
| `supabase` | **disabled** | **`update`** | starts, Hibernate mutates the Supabase database directly |

The `local` and `supabase` profiles work around P0-1 rather than fixing it, and `ddl-auto: update` against Supabase means **the JVM is silently issuing DDL to the shared cloud database** — schema changes land without ever passing through a migration file. This directly undermines R7's additive-migration guarantee.

Fixing this is `V6` (backfill the six missing tables) followed by re-enabling Flyway on `local`/`supabase`. That is additive and is scheduled as the first PR in D14.

## 2.6 Realtime architecture — two parallel paths

| Path | Mechanism | Producer | Consumer |
|---|---|---|---|
| A | STOMP over SockJS at `/ws-endpoint` | `RealtimeDashboardService` `@Scheduled(fixedRate = 2000/3000/5000)` aggregating 14 repositories | `dashboardStore`, `SysAdminDashboard` |
| B | Supabase `postgres_changes` | backend inserts/upserts into `user_activity_events` / `online_users` | `realtimeSyncStore`, `useLiveActivities`, layout "Realtime" status pills |

Both are live simultaneously. Path A polls the primary database every 2 seconds regardless of whether any client is connected — a fixed-cost background load that scales with repository count, not with users. Path B depends on `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; `lib/supabase.ts` degrades to `supabase === null` when they are absent, and `supabaseAvailable` gates the callers, so the absence is handled gracefully.

**Decision for new work:** new realtime needs (compliance alerts, contract expiry notifications) use **Path A**, because it already runs behind the JWT-authenticated WebSocket handshake. Path B's anon-key access has no row-level protection (P0-7) and must not carry compliance or legal data.

## 2.7 AI architecture — what is real and what is not

| Component | Reality |
|---|---|
| `DocumentClassificationAiService` | **Not AI.** Logs "Classifying document content using AI Llama 3.3 model engine…" then runs a keyword `if/else` returning `LEGAL_CONTRACT`/`FINANCIAL_INVOICE`/`FACILITIES_DOCUMENT`/`SECURITY_VISITOR`/`OPERATIONAL_RECORD`. `summarizeDocument` returns `"AI Summary: " + content.substring(0, 250) + "..."` |
| `ContractAnalyticsAiService` | Same shape — deterministic heuristics presented as model output |
| `OcrService` | Real — wraps Tess4J/Tika |
| `ReservationLlmGateway` | **The only genuine LLM call.** OpenAI-compatible HTTP, defaults `https://api.openai.com/v1` + `gpt-4o`, guarded by `PLACEHOLDER_KEY = "sk-proj-default"`, falls back to heuristics on any failure |
| `AiStateManagementService` | Providers, module toggles and call logs held in `CopyOnWriteArrayList` + `AtomicLong`. **Zero repository usage — all state is lost on restart** |
| `app.ai.*` config | Points at Ollama (`http://ollama:11434`, `llama3.3`, `qwen2.5`, `nomic-embed-text`, dimension 768) — **read by no service**. The one real call goes to OpenAI-compatible endpoints instead |

So: the AI subsystem has a working *façade* (controller, provider registry, module toggles, logs, analytics) and a working *fallback strategy*, but essentially no inference. The graceful-degradation pattern in `ReservationLlmGateway` is the right pattern and §7.5 requires it — it is the piece worth reusing. D12 builds on that gateway rather than introducing a second AI client.

The `AiStateManagementService` in-memory store is a genuine defect for §7.5's "audit every AI call" requirement: audit records that vanish on restart are not audit records. D7 adds `ai_invocation_logs` to fix it.

## 2.8 Frontend architecture

- **Entry:** `main.tsx` → `App.tsx`. All 38 routes declared in one file with four guard components and one `ErrorBoundary` class component.
- **Route groups:** four, each with its own layout shell — SysAdmin (`AppLayout`), Facilities Manager, Facilities Officer, Compliance Officer.
- **State:** three Zustand stores. `authStore` rehydrates `accessToken` from `localStorage` at module load (`stores/authStore.ts:21`) **but not `user`** — so after a page refresh `accessToken` is truthy while `user` is `null`, and every role-testing guard sees an empty role array. `FacilitiesRoute`/`FacilitiesOfficerRoute`/`ComplianceOfficerRoute` then redirect to `/`, breaking deep links and bookmarks. `ProtectedRoute` is unaffected only because its role test is inert (P0-4).
- **Data access:** 8 axios service modules, one per domain, all through the shared `apiClient`. Consistent and worth preserving. `adminService.ts:10-13` wraps calls in `.catch(() => …)` returning empty shapes — a deliberate degradation choice that hides backend failures from the UI.
- **No component library.** No `components/ui/`. Page files carry all markup: `FacilitiesPages.tsx` 1,191 LOC, `FoReservationsPage.tsx` 1,155, `ComplianceOfficerPages.tsx` 952, `AiServicesPage.tsx` 894.

## 2.9 Architectural constraints for all new work

Derived from the above; these bind D7–D16.

1. Schema changes ship as **Flyway migrations starting at `V6`** — never Hibernate `update`, never a hand-run Supabase SQL file (R7).
2. New endpoints live at `/v1/<resource>` and return `ApiResponse<T>` (R2/R6).
3. Every new controller method carries `@PreAuthorize` with a `BootstrapAdmin`-vocabulary role (R8, §14).
4. New modules use the full `controller → service → repository` layering with DTOs at the boundary; entities are never accepted as request bodies.
5. Realtime for new features uses the authenticated STOMP path, not the Supabase anon path.
6. AI calls route through a gateway with the `ReservationLlmGateway` degradation contract, and every call is persisted to an audit table (§7.5).
7. New tables get RLS with an explicit, non-permissive policy decision (§9) — see D11 for the pattern, since none exists to copy.

---

# DELIVERABLE 3 — MISSING FEATURES ASSESSMENT `[VERIFIED]`

Assessed against §6 A–F. "Exists" means a reachable endpoint or route was found in the repository, not that it is fully correct.

## 3.1 Module A — Facilities Reservation

**Status: substantially built (~70%).** 25 endpoints across three controllers, 18 frontend routes.

| §6 capability | Status | Evidence |
|---|---|---|
| Room/facility CRUD | **Exists** | `FacilitiesManagerController` `GET/POST /rooms`, `PUT /rooms/{id}` |
| Availability search | **Exists** | `POST /facilities-officer/rooms/available`, `RoomAvailabilityService` |
| Reservation create/cancel | **Exists** | `POST /facilities-officer/reservations`, `POST .../{id}/cancel` |
| Approval workflow | **Exists** | `POST /facilities-manager/reservations/{id}/approve` \| `/reject`; `reservation_approvals` table (V5) |
| Calendar view | **Exists** | `GET /facilities-manager/calendar?year&month` |
| Maintenance scheduling | **Exists** | `POST /rooms/{id}/maintenance`, `maintenance_schedules` table |
| Analytics / reports | **Exists** | `GET /facilities-manager/analytics`, `/reports` |
| **Recurring reservations** | **Missing** | `reservations.parent_reservation_id` + `recurrence_type` columns exist in V2 but no endpoint reads or writes them |
| **Check-in / check-out** | **Missing** | `reservations.check_in_time`/`check_out_time`/`qr_code_token` columns exist; **no endpoint** |
| **Blackout dates** | **Missing** | no table, no endpoint |
| **Bookable time-slot model** | **Missing** | availability is computed ad hoc from start/end overlap; no `reservation_slots` |
| **Equipment booking** | **Missing** | `equipment` table exists (V2); no endpoint links equipment to a reservation |

## 3.2 Module B — Visitor Management (QR passes)

**Status: skeleton (~15%).** Three endpoints total.

| §6 capability | Status | Evidence |
|---|---|---|
| Visitor registration | **Exists** | `POST /v1/visitors/register` |
| Check-in / check-out | **Exists** | `POST /v1/visitors/{id}/check-in` \| `/check-out` |
| **QR pass issuance** | **Missing** | `visitors.qr_code_token` column exists and ZXing is on the classpath, but **no endpoint generates or renders a pass** |
| **QR pass validation/scan** | **Missing** | no scan endpoint; nothing validates a token at the door |
| **Pass lifecycle** (issued → active → expired → revoked) | **Missing** | no `visitor_passes` table; a visitor row has one `status` and no pass history |
| **Pre-registration / host approval** | **Missing** | `visitors.host_id` exists; no approval endpoint |
| **Blacklist / watchlist** | **Missing** | no table, no check |
| **Check-in audit trail** | **Missing** | check-in overwrites a timestamp on the visitor row; multi-visit history is unrecoverable |
| **Badge printing** | **Missing** | `badge_number` column exists; nothing populates it |
| **RBAC** | **Missing** | `/v1/visitors/**` has no role check — any authenticated user can register or check in a visitor (P0-2) |

## 3.3 Module C — Document Management

**Status: skeleton (~20%).**

| §6 capability | Status | Evidence |
|---|---|---|
| Document CRUD + upload | **Exists** | `DocumentController`; Tika/Tess4J wired |
| Text search | **Exists** | `GET /v1/documents/search` |
| OCR extraction | **Exists** | `OcrService`; `documents.ocr_extracted_text` |
| AI classification (façade) | **Exists** | `documents.ai_predicted_category`, `confidence_score` |
| Flat categories | **Exists** | `categories` table (V2) — **flat, no `parent_id`** |
| Tags | **Exists** | `tags` + `document_tags` join table |
| Folders | **Partial** | `folders` table has `parent_id` + `path`, but **no folder-tree API and no UI** |
| **Versioning** | **Missing** | `documents.version_number INT DEFAULT 1` exists but **there is no `document_versions` table** — the column can only ever be 1. No version history, diff, or restore |
| **Hierarchical categories** | **Missing** | §6 requires a category tree; `categories` is flat |
| **Multi-category assignment** | **Missing** | `documents.category_id` is single-valued |
| **Smart search** (semantic/AI) | **Missing** | `/search` is a literal match. `app.ai.embedding` is configured (`nomic-embed-text`, dim 768) but **no embedding is ever computed or stored**; no `pgvector` |
| **Check-out / lock** | **Missing** | concurrent edits silently overwrite |
| **Access control per document** | **Missing** | `classification_level` column exists but is never enforced; endpoint has no role check |

## 3.4 Module D — Records Retention & Compliance

**Status: partially built (~55%).** 18 endpoints — the best-covered non-facilities module.

| §6 capability | Status | Evidence |
|---|---|---|
| Retention policy CRUD | **Exists** | `POST/PUT /compliance/retention-policies`, `/{id}/toggle` |
| Disposal request workflow | **Exists** | `POST /compliance/documents/{id}/disposal`, `/disposals/{id}/approve` \| `/reject` |
| Compliance alerts | **Exists** | `GET /compliance/alerts`, `/{id}/acknowledge`, `/{id}/dismiss` |
| Audit log viewing | **Exists** | `GET /compliance/audit-logs`; `audit_logs` table has `old_values`, `new_values`, `severity`, `module`, `entity_type` |
| Document approve/archive | **Exists** | `POST /compliance/documents/{id}/approve` \| `/archive` |
| Dashboard summary | **Exists** | `GET /compliance/dashboard/summary` |
| **Retention schedules** (per-record clocks) | **Missing** | `retention_policies` defines rules; **nothing computes a due date per document**. No `retention_schedules` table |
| **Automated retention enforcement** | **Missing** | `app.scheduler.retention-check-cron` is configured but **read by no code** |
| **Legal hold** | **Missing** | no way to suspend disposal for litigation — a hard compliance requirement |
| **Certificate of destruction** | **Missing** | disposals are approved but produce no immutable record |
| **AI Compliance Command Center** (§7.2 flagship) | **Missing** | no such page or endpoint exists |
| **Compliance reporting/export** | **Missing** | no report generation |
| **Backing tables for 3 of these endpoints** | **Broken** | `compliance_alerts` and `disposal_requests` entities have **no Flyway migration** (P0-1) — these endpoints only work under `ddl-auto: update` |

## 3.5 Module E — Legal Management

**Status: stub (~5%).**

| §6 capability | Status | Evidence |
|---|---|---|
| `legal_cases` table | **Exists** | V2 |
| Case CRUD endpoints | **Missing** | `LegalCaseController` declares `@RequestMapping("/v1/legal-cases")` and **no method mappings** |
| Any frontend route | **Missing** | zero routes under `/legal` in `App.tsx` |
| Case events / timeline | **Missing** | no table |
| Hearings calendar | **Missing** | no table, no endpoint |
| Legal document repository | **Missing** | no link between `legal_cases` and `documents` |
| Resolutions / outcomes | **Missing** | no table |
| Counsel assignment | **Missing** | `lead_counselor` is free text in the Supabase copy; no FK to `users` |
| Legal hold integration | **Missing** | see D |

## 3.6 Module F — Contract Management

**Status: stub (~20%).**

| §6 capability | Status | Evidence |
|---|---|---|
| List + create contracts | **Exists** | `GET /v1/contracts`, `POST /v1/contracts` |
| AI risk analysis (façade) | **Exists** | `GET /v1/contracts/{id}/analyze`; `ai_assessed_risk_level`, `ai_risk_summary` |
| Clause storage | **Exists** | `contract_clauses` table (V2) |
| Renewal date tracking | **Partial** | `renewal_notice_date` column exists; nothing reads it |
| **Get / update / delete by id** | **Missing** | `ContractController` has no `GET /{id}`, `PUT /{id}`, or `DELETE /{id}` — contracts can be created but never corrected |
| **Approval workflow** | **Missing** | no `contract_approvals` table |
| **Renewal workflow** | **Missing** | no `contract_renewals` table; `app.scheduler.contract-expiry-cron` is orphaned |
| **Vendor/counterparty master** | **Missing** | counterparty is free text; no `vendors` table |
| **Document linkage** | **Partial** | `contracts.document_id` exists; no endpoint populates or resolves it |
| **Expiry alerting** | **Missing** | §8 workflow 1 target — nothing exists |
| **RBAC** | **Missing** | `/v1/contracts` has no role check — any authenticated user can create a contract (P0-2) |

## 3.7 Cross-cutting gaps

| Gap | Impact | Where addressed |
|---|---|---|
| No endpoint RBAC on 6 route families (P0-2) | Any employee can read/write contracts, documents, legal cases, visitors | D8, D16-R1 |
| `ProtectedRoute` inert (P0-4) | Every authenticated user reaches SysAdmin pages | D9, D16-R2 |
| `user` not rehydrated (§2.8) | Deep links break on refresh | D9, D16-R3 |
| 6 entities without migrations (P0-1) | App cannot start on default profile | D7, D14 PR-1 |
| No RLS on authoritative schema (P0-7) | Direct DB access is unrestricted | D11 |
| AI state in memory | §7.5 audit requirement unmeetable | D7, D12 |
| No `document_versions` | §6C core requirement absent | D7 |
| No n8n at all | All five §8 workflows greenfield | D13 |
| Zero tests, no CI | §14 DoD unverifiable | D16-R7 |
| Committed secrets (P0-5) | Credential exposure | Open Questions |
| Fabricated demo data in UI | Several dashboards show invented numbers as if live | D5, D16-R6 |

---

# DELIVERABLE 4 — DATABASE GAP ANALYSIS `[VERIFIED]`

## 4.1 Existing tables — Flyway (authoritative), 31 total

| Migration | Tables |
|---|---|
| `V1` (154 ln) | `roles`, `permissions`, `users`, `user_roles`, `role_permissions`, `refresh_tokens`, `audit_logs`, `notifications` |
| `V2` (364 ln) | `facilities`, `rooms`, `equipment`, `reservations`, `maintenance_schedules`, `visitors`, `folders`, `categories`, `tags`, `documents`, `document_tags`, `retention_policies`, `legal_cases`, `contracts`, `contract_clauses` |
| `V3` (106 ln) | `security_logs`, `login_history`, `active_sessions`, `blocked_ips`, `security_alerts`, `api_request_logs` |
| `V4` (44 ln) | `user_module_scopes` (+ seeds 7 roles) |
| `V5` (42 ln) | `facility_amenities`, `reservation_approvals` (+ ALTERs `rooms`) |

## 4.2 Gap class 1 — entities with no table (P0-1, **startup-blocking**)

Six `@Entity` classes map to tables that no migration creates:

| Entity table | Owning module | Consequence |
|---|---|---|
| `admin_notifications` | admin | `GET /v1/admin/notifications` |
| `backup_records` | admin | `GET /v1/admin/backups` |
| `compliance_alerts` | compliance | `GET /compliance/alerts` + acknowledge/dismiss |
| `disposal_requests` | compliance | `GET /compliance/disposals` + approve/reject |
| `integration_status` | admin | `GET /v1/admin/integrations` |
| `system_configurations` | admin | `GET/PUT /v1/admin/config` |

Under `ddl-auto: validate` (default profile) Hibernate aborts startup. Under `local`/`supabase` Hibernate creates them with inferred DDL — **no indexes, no FK constraints, no audit-column defaults, and a shape that differs per environment.**

**Resolution:** `V6__backfill_missing_module_tables.sql` — pure `CREATE TABLE IF NOT EXISTS`, matching each entity's mapped columns, with the V1/V2 audit + soft-delete convention. Additive, R7-compliant. This is PR-1 in D14 and everything else depends on it.

## 4.3 Gap class 2 — columns with no supporting table

Columns that exist and imply a feature that has no storage:

| Column | Implies | Missing table |
|---|---|---|
| `documents.version_number` | version history | `document_versions` |
| `reservations.qr_code_token`, `check_in_time`, `check_out_time` | reservation check-in | (endpoint only — columns suffice) |
| `reservations.parent_reservation_id`, `recurrence_type` | recurring bookings | (endpoint only) |
| `visitors.qr_code_token`, `badge_number` | issued passes | `visitor_passes` |
| `contracts.renewal_notice_date` | renewal workflow | `contract_renewals` |
| `contracts.document_id` | contract↔document link | (endpoint only) |
| `documents.classification_level` | per-document access control | `document_permissions` |

## 4.4 Gap class 3 — tables required by §6 that do not exist

| Module | Missing table | Purpose |
|---|---|---|
| A | `reservation_slots` | bookable time-slot model |
| A | `reservation_blackout_dates` | holidays / closures |
| A | `reservation_equipment` | equipment attached to a booking |
| B | `visitor_passes` | QR pass lifecycle (issue/expire/revoke) |
| B | `visitor_checkins` | per-visit history |
| B | `visitor_blacklist` | watchlist |
| C | `document_versions` | version history |
| C | `document_categories` (hierarchical) | category tree — current `categories` is flat |
| C | `document_category_links` | many-to-many document↔category |
| C | `document_permissions` | per-document ACL |
| D | `retention_schedules` | per-record retention clock |
| D | `legal_holds` | disposal suspension |
| D | `disposal_certificates` | immutable destruction record |
| D | `compliance_reports` | generated report artefacts |
| E | `case_events` | case timeline |
| E | `hearings` | hearing calendar |
| E | `case_documents` | case↔document link |
| E | `case_resolutions` | outcomes |
| F | `contract_approvals` | approval chain |
| F | `contract_renewals` | renewal cycle |
| F | `vendors` | counterparty master |
| §7.5 | `ai_invocation_logs` | persistent AI audit (replaces in-memory state) |
| §8 | `workflow_executions` | n8n callback audit |

Full DDL specification is Deliverable 7.

## 4.5 Gap class 4 — schema convention drift

| Issue | Detail | Risk |
|---|---|---|
| V3 uses a different convention | `BIGSERIAL` PK, `TIMESTAMPTZ`, `INET`, `JSONB`, no audit/soft-delete columns | Its 6 tables cannot use `AuditorAwareImpl`; joins to UUID-keyed tables require casts |
| `blocked_ips` keyed on `ip_address INET` | natural key, not surrogate | Cannot soft-delete or re-block the same IP historically |
| Supabase `00001` redefines 12 tables | different column names and types for the same names | Client and server disagree about the same table |
| `categories` is flat | no `parent_id` | §6C hierarchical requirement unmeetable without a new table |
| `documents.category_id` single-valued | one category per document | §6C multi-category unmeetable |

## 4.6 Gap class 5 — RLS and indexing

- **RLS:** zero policies across all 31 Flyway tables. The 13 Supabase tables have `using (true) with check (true)` — enabled but not restrictive. `realtime.sql:16-19` states RLS is intentionally off for its two tables. §9 requires an explicit RLS decision on every new table; **there is no existing policy to copy**, so D11 defines the pattern.
- **Indexing:** V1/V2/V5 do create indexes on FK columns (e.g. `idx_facility_amenities_room`, `idx_reservation_approvals_reservation`), so the convention exists and D7 follows it. Hibernate-generated tables (gap class 2) have **none**.

## 4.7 Migration sequencing constraint

`V1` … `V5` are applied and immutable (R7 — never rewrite). All new schema begins at **`V6`** and is strictly additive: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. No `DROP`, no `ALTER … TYPE`, no column renames on existing tables anywhere in the plan.

---

# DELIVERABLE 5 — UI CONSISTENCY ANALYSIS `[VERIFIED]`

## 5.1 What is already consistent (preserve — R4)

- **Design tokens are centralised and genuinely used.** `tailwind.config.js` defines a complete semantic scale — `brand.50…950` (emerald), `surface.*` (dark shell + light variants), `content.*`, `border.*`, `accent`, `success`/`error`/`warning`, `rounded-card` (1rem), and a six-step `shadow` scale. New UI must consume these tokens, never raw hex.
- **Typography:** `font-sans: Inter`, `font-heading: Outfit`.
- **Iconography:** `lucide-react` throughout, no mixing.
- **Shell anatomy:** all four layouts share the same structure — fixed dark sidebar with brand mark, nav list with active-state pill, footer status pills, top bar with breadcrumbs and user menu.
- **Nav item shape:** all four use the identical object literal `{ id, label, path, icon }` (`AppLayout.tsx:64`, `FacilitiesManagerLayout.tsx:39`, `FacilitiesOfficerLayout.tsx:39`, `ComplianceOfficerLayout.tsx:40`). `AppLayout` adds an `exact` flag and one nested-children entry.
- **API access:** one axios instance, one service module per domain, uniform `ApiResponse` unwrapping.

## 5.2 Inconsistency 1 — four near-duplicate layouts

`FacilitiesManagerLayout` (180 ln), `FacilitiesOfficerLayout` (178 ln) and `ComplianceOfficerLayout` (182 ln) are approximately 73% identical: same imports, same sidebar markup, same active-state computation (`const navIsActive = isActive(item.path)` at :70 / :66 / equivalent), same status-pill footer. They differ only in the `navItems` array, the brand label, and the logout redirect.

`AppLayout` (299 ln) is a superset — it adds `exact` matching (`isExactActive`), a nested nav group for Security Center, and a hardcoded four-item status array (`AppLayout.tsx:178-181`, all `'operational'`).

**Effect:** a change to nav behaviour, active styling, or the status footer must be made in four places. The three officer/manager layouts already drifted — two of them compute `Realtime` status from `syncConnected` while `AppLayout` hardcodes `'operational'`.

## 5.3 Inconsistency 2 — no shared component library

There is no `components/ui/` directory and no shared primitives. Every page hand-rolls its own controls. Concretely, ~14 modal implementations exist across the page files, each with its own overlay, close handling and focus behaviour. Tables, status badges, empty states, KPI cards, pagination and form fields are similarly re-implemented per page.

This is why four files exceed 890 lines:

| File | LOC |
|---|---|
| `components/facilities/FacilitiesPages.tsx` | 1,191 |
| `components/facilities-officer/FoReservationsPage.tsx` | 1,155 |
| `components/compliance/ComplianceOfficerPages.tsx` | 952 |
| `components/sysadmin/AiServicesPage.tsx` | 894 |
| `components/sysadmin/AddAiProviderModal.tsx` | 658 |

Adding modules B/C/E/F under this pattern would add several thousand more lines of duplicated markup. D6 addresses this with an extraction plan that is additive only.

## 5.4 Inconsistency 3 — barrel files mixing many pages

`FacilitiesPages.tsx` exports 10 page components; `ComplianceOfficerPages.tsx` exports 8; `AdminPages.tsx` exports 10; `FacilitiesOfficerPages.tsx` exports 5. Meanwhile `FoReservationsPage.tsx`, `AiServicesPage.tsx` and the dashboards are single-page files. Two conventions coexist with no rule distinguishing them.

**Position:** new pages are one file per page. Existing barrels are left alone (R4) — splitting them is an optional D16 refactor.

## 5.5 Inconsistency 4 — fabricated data presented as live

Several surfaces display invented values indistinguishable from real data:

| Location | Issue |
|---|---|
| `AiServicesPage.tsx` | chart series are hardcoded arrays |
| `AddAiProviderModal.tsx:176-182` | reports connection **success** even when the test call fails |
| `FoReservationsPage.tsx:120` | occupancy hardcoded to 68% |
| `FoReservationsPage.tsx:593-634` | static calendar grid, not date-driven |
| `AppLayout.tsx:178-181` | all four subsystem status pills hardcoded `'operational'` |
| `authService.ts:33-60` | fabricates a demo JWT when the login network call fails |
| `LoginPage.tsx:99-140` | ships plaintext demo credentials in the rendered page |
| `adminService.ts:10-13` | `.catch(() => empty)` silently converts backend failures into empty-but-successful UI states |

The `authService` fallback is the most serious: a user whose backend is down still lands inside the app holding a token the server will never accept, so every subsequent call 401s and the interceptor bounces them to `/login` — an unexplained loop. These are UI-honesty defects, not layout defects; remediation is D16-R6.

## 5.6 Inconsistency 5 — type definitions

`types/reservationSystem.ts` is a complete canonical type module that **nothing imports**. `FoReservationsPage.tsx:13-31` redeclares a conflicting local reservation type instead. New reservation work must adopt the canonical module and the redeclaration must not be copied.

## 5.7 Inconsistency 6 — dead code in the source tree

- `frontend/unused_security/` — non-compiling, excluded from the build, still present.
- `frontend/src/lib/supabaseClient.ts` — 0 bytes, alongside the working `lib/supabase.ts`.
- `backend/.../com/photonicomega/security/**` — orphan package duplicating six entities and one controller (P0-6).

## 5.8 UI rules binding all new pages

1. Reuse `tailwind.config.js` tokens exclusively — no raw hex, no ad-hoc colours (R5).
2. Reuse the existing layout shell for the relevant role group — do not introduce a fifth shell.
3. One file per page; place under `components/<role-group>/`.
4. Consume shared primitives from the D6 extraction as they land; do not hand-roll a new modal or table.
5. Icons from `lucide-react` only.
6. No fabricated data. Empty state, error state, and loading state are each rendered explicitly.
7. Import canonical types from `types/`; never redeclare a domain type inside a page.

---

# DELIVERABLE 6 — COMPONENT REUSE PLAN `[VERIFIED]`

Purpose: maximise reuse (R1/R6) while adding modules B, C, E, F. Everything below is **additive** — no existing component is deleted or rewritten, and no existing page is forced to migrate.

## 6.1 Backend — reuse directly, unchanged

| Asset | Reuse for |
|---|---|
| `ApiResponse<T>` | every new endpoint's response envelope |
| `SecurityConfig` filter chain, JWT filter, `CustomUserDetailsService` | all new endpoints authenticate with zero config change (R8) |
| `@EnableMethodSecurity` (already on) | `@PreAuthorize` on new controller methods works immediately |
| `AuditorAwareImpl` + `@EnableJpaAuditing` | `created_by`/`updated_by` auto-populated on new entities |
| `AuditService` | audit writes for new state changes (§14 DoD) |
| `audit_logs` table | already carries `old_values`, `new_values`, `severity`, `module`, `entity_type`, `entity_id` — no new audit table needed |
| `OcrService` | document text extraction for module C |
| ZXing (on classpath) | QR generation for module B passes |
| `ReservationLlmGateway` degradation pattern | template for all §7 AI gateways |
| Caffeine `@EnableCaching` | caching new read-heavy endpoints |
| `RealtimeDashboardService` / STOMP broker | pushing new alert types |
| springdoc `@Tag`/`@Operation` | documenting new endpoints |

## 6.2 Backend — extend, do not replace

| Existing | Extension | Rationale |
|---|---|---|
| `VisitorController` (3 endpoints) | add pass issuance, validation, blacklist endpoints **to the same controller** | R9 — do not re-implement the module |
| `ContractController` | add `GET /{id}`, `PUT /{id}`, `DELETE /{id}`, approvals, renewals; introduce `ContractService` behind it | fills the CRUD hole without touching existing methods |
| `DocumentController` | add versions, folder tree, categories, permissions | same |
| `LegalCaseController` | add the method mappings the class declaration already anticipates | the shell exists; only methods are missing |
| `ComplianceController` | add retention schedules, legal holds, command-center summary | 18 endpoints already there — extend |
| `ContractAnalyticsAiService`, `DocumentClassificationAiService` | keep the public method signatures, replace the keyword `if/else` internals with a real gateway call plus the existing heuristic as fallback | callers unchanged; §7.5 degradation preserved |

## 6.3 Frontend — shared primitives to extract (new `components/ui/`)

Extracted from patterns that already repeat across the four page barrels. Each is styled purely from existing Tailwind tokens, so extraction produces **no visual change** (R2/R5).

| Primitive | Extracted from | Consumers |
|---|---|---|
| `Modal` | ~14 hand-rolled modals across the barrels | every new create/edit/confirm dialog |
| `DataTable` | repeated table markup in `FacilitiesPages`, `ComplianceOfficerPages`, `AdminPages` | contracts, documents, cases, visitors lists |
| `StatusBadge` | inline status pill markup in all four barrels | reservation, contract, case, pass statuses |
| `KpiCard` | dashboard stat cards in all four dashboards | new module dashboards |
| `EmptyState` | ad-hoc "no data" blocks | all new list pages |
| `PageHeader` | title + action-button row repeated per page | all new pages |
| `FormField` / `Select` / `DateRangePicker` | inline form markup | all new forms |
| `ConfirmDialog` | inline confirm patterns | destructive actions |
| `Pagination` | inline paging controls | all new list pages |
| `FileDropzone` | upload markup in document pages | document versions, contract attachments |
| `QrDisplay` | **new** — no precedent | visitor pass rendering |
| `Timeline` | **new** — no precedent | case events, document version history |

**Migration policy:** new pages use these from day one. Existing pages are migrated only opportunistically, one component at a time, in dedicated refactor PRs with no behaviour change (D16-R5). No big-bang rewrite.

## 6.4 Frontend — shared layout extraction

Extract a single `RoleLayout` component parameterised by `{ navItems, brandLabel, homePath }`, containing the sidebar, active-state logic, status footer and top bar shared by the four existing shells.

The four existing layouts then become thin configuration wrappers. This removes ~400 lines of duplication and gives modules B/C/E/F a single place to add nav entries.

**Sequencing:** because `AppLayout` is a superset (nested nav groups, `exact` matching), `RoleLayout` must support both before any layout migrates. Migrate the three sibling layouts first — they are near-identical — and `AppLayout` last, or leave `AppLayout` unmigrated if the nested-group support proves invasive. Both outcomes are acceptable; the goal is one shell for *new* role groups, not forced uniformity.

## 6.5 Frontend — reuse directly, unchanged

| Asset | Reuse for |
|---|---|
| `api/client.ts` (`apiClient`, `extractErrorMessage`, `safeFetchJson`) | all new service modules |
| `stores/authStore.ts` incl. `getDashboardPath()` | role-aware landing for new role groups |
| `stores/realtimeSyncStore.ts` | new realtime subscriptions |
| `components/layout/Breadcrumbs.tsx` | new pages |
| `ErrorBoundary` (`App.tsx:56-80`) | wrap new route groups |
| `FacilitiesRoute` guard pattern (`App.tsx:94-101`) | the correct template for new role guards — **not** `ProtectedRoute`, which is inert |
| `types/reservationSystem.ts` | canonical reservation types (currently unused) |
| Tailwind token scale | all new styling |
| `lib/supabase.ts` null-guard pattern | any new optional-service client |

## 6.6 Reuse targets

| Area | Target | Basis |
|---|---|---|
| New endpoint response envelope | 100% `ApiResponse<T>` | already universal |
| New endpoint auth | 100% existing JWT chain, 0 new auth code | R8 |
| New table audit/soft-delete columns | 100% V1/V2 convention | already universal |
| New page styling | 100% existing Tailwind tokens | R5 |
| New page primitives | ≥80% from `components/ui/` once extracted | D6.3 |
| New nav integration | 100% via existing layout shells | R4 |
| Net-new UI patterns | 2 (`QrDisplay`, `Timeline`) | no precedent exists |

## 6.7 What must NOT be reused

| Anti-pattern | Where it lives | Why |
|---|---|---|
| Controller → repository directly | `contracts`, `documents`, `legal`, `visitor`, `admin` | no transaction boundary, no audit hook |
| JPA entity as request/response body | `ContractController` | exposes `is_deleted`, `created_by` to clients |
| Endpoints without `@PreAuthorize` | 6 route families | P0-2 |
| `ProtectedRoute`'s inert role check | `App.tsx:82-92` | P0-4 |
| In-memory service state | `AiStateManagementService` | lost on restart; breaks §7.5 audit |
| Fabricated fallback data | `authService.ts:33-60`, `AddAiProviderModal.tsx:176-182`, etc. | misrepresents system state |
| Hand-run Supabase SQL as schema change | `supabase/migrations/00001` | bypasses Flyway authority (R7) |
| Hardcoded `/api/...` in `@GetMapping` | `SecurityThreatMapController` | double-prefixes to `/api/api/...` |
| Redeclaring domain types in a page | `FoReservationsPage.tsx:13-31` | conflicts with `types/reservationSystem.ts` |

---

*End of Phase 1. Deliverables 7–13 continue in `TNVS-Phase2-Deliverables.md`.*
