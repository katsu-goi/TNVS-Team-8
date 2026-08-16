# TNVS Facilities & Administrative Management System — Phase 0 Reconnaissance Report

> **Status:** Phase 0 complete · **Repo:** `TNVS-Team-8` @ `main` (12 commits) · **Remote:** `github.com/katsu-goi/TNVS-Team-8.git`
> **Method:** read-only inventory. No files created or modified in `frontend/`, `backend/`, or `supabase/`.
> **Labelling:** every claim is `[VERIFIED]` (traceable to a file path + line) unless explicitly marked `[ASSUMED]`.

---

## 0.1 Dossier Reconciliation (Master Prompt §3 vs. reality)

§3 states the declared baseline "must be reconciled against the actual repository in Phase 0 and any discrepancies corrected in Deliverable 1 before proceeding." **Five of the declared stack facts are wrong.** This is the most consequential Phase 0 finding, because the §6–§8 requirements are meaningless if aimed at the wrong runtime.

| # | §3 Dossier claim | Repository reality | Evidence |
|---|---|---|---|
| 1 | PHP REST backend | **Spring Boot 3.3.5 / Java 21 / Maven.** Zero PHP files in the tree. | `backend/pom.xml` — `spring-boot-starter-parent:3.3.5`, `<java.version>21</java.version>`, artifactId `facilities-management` |
| 2 | Next.js frontend | **Vite 6 + React 19 + react-router-dom 7.** No `next` dependency; no `app/` or `pages/` directory. | `frontend/package.json:6-11` (`"dev": "vite"`); `frontend/src/App.tsx:123` (`<BrowserRouter>`) |
| 3 | ShadCN UI component library | **Absent.** No `@radix-ui/*`, no `class-variance-authority`, no `components/ui/`. UI is hand-written Tailwind. | `frontend/package.json:12-42` |
| 4 | OpenAI-backed AI | **Configured for Ollama** (`llama3.3`, `qwen2.5`, `nomic-embed-text`). The single live LLM call targets an OpenAI-compatible URL but is disabled behind a placeholder key. | `backend/src/main/resources/application.yml` → `app.ai.llama.base-url: http://ollama:11434`; `ReservationLlmGateway.java` → `PLACEHOLDER_KEY = "sk-proj-default"` |
| 5 | n8n workflow layer to "extend" | **Does not exist.** Zero occurrences of `n8n`, `webhook`, or workflow JSON anywhere outside `node_modules`. | Repo-wide grep with `node_modules` excluded — 0 hits |

**Consequence for §8:** all five required n8n workflows are **greenfield**, not extensions of an existing automation layer.

**Confirmed correct from §3:** repo layout is `frontend/` + `backend/` + `supabase/` (R3 honoured); PostgreSQL is the database; a Supabase project is wired in; JWT authentication exists; an RBAC concept exists.

---

## 0.2 Inventory

### Backend — `com.photonicomega.facilities` (plus one orphan tree `com.photonicomega.security`)

| Artifact | Count | Note |
|---|---|---|
| `@Entity` classes | 40 | |
| `*Repository.java` | 39 | |
| `*Controller.java` | 20 | one is dead code (see P0-2) |
| `*Service.java` | **14** | against 20 controllers — five modules have no service layer at all |
| Flyway migrations | 5 (`V1`–`V5`) | `backend/src/main/resources/db/migration/` |
| `@PreAuthorize` usages | **1** | and it is unreachable (see P0-2) |
| Test files | **0** | `backend/src/test/` does not exist |

### Frontend — 8,788 LOC across 30 `.ts` / `.tsx` files

| Artifact | Count | Note |
|---|---|---|
| Routes | 38 | `frontend/src/App.tsx:125-203` |
| Route guards | 4 | one is broken (see P0-4) |
| Layout shells | 4 | `AppLayout`, `FacilitiesManagerLayout`, `FacilitiesOfficerLayout`, `ComplianceOfficerLayout` |
| Shared component library | **0 files** | no `components/ui/`; largest single file is 1,191 LOC |
| API service modules | 8 | `frontend/src/api/` |
| Zustand stores | 3 | `authStore`, `dashboardStore`, `realtimeSyncStore` |
| ESLint config | **0** | despite `"lint": "eslint ."` in `package.json` scripts |
| Test files | **0** | |

### Database — two competing sources of truth

| Source | Tables | RLS |
|---|---|---|
| Flyway `V1`–`V5` (authoritative for the Java app) | 31 | **zero** RLS statements |
| `supabase/migrations/00001_create_all_tables.sql` | 13 (12 name-colliding with Flyway + `ip_threats`) | 13 tables, all `using (true) with check (true)` |
| `supabase/realtime.sql` | 2 (`user_activity_events`, `online_users`) | explicitly **disabled** — `realtime.sql:16-19` |

#### Flyway migration contents

| File | Lines | Tables created |
|---|---|---|
| `V1__create_auth_schema.sql` | 154 | `roles`, `permissions`, `users`, `user_roles`, `role_permissions`, `refresh_tokens`, `audit_logs`, `notifications` |
| `V2__create_facilities_and_domain_schemas.sql` | 364 | `facilities`, `rooms`, `equipment`, `reservations`, `maintenance_schedules`, `visitors`, `folders`, `categories`, `tags`, `documents`, `document_tags`, `retention_policies`, `legal_cases`, `contracts`, `contract_clauses` |
| `V3__security_center_schema.sql` | 106 | `security_logs`, `login_history`, `active_sessions`, `blocked_ips`, `security_alerts`, `api_request_logs` |
| `V4__add_module_admin_scopes.sql` | 44 | `user_module_scopes` + seeds 7 roles |
| `V5__room_availability_enhancements.sql` | 42 | `facility_amenities`, `reservation_approvals`; ALTERs `rooms` |

**Next migration number is `V6`.**

---

## 0.3 Existing module coverage vs. Master Prompt §6

| §6 Module | Backend | Frontend | Verdict |
|---|---|---|---|
| **A** Facilities Reservation | `FacilityController`, `FacilitiesManagerController` (16 endpoints), `FacilitiesOfficerController` (9), `RoomAvailabilityService` | 11 FM routes + 7 FO routes | **Substantially built** — the richest module |
| **B** Visitor Management | `VisitorController` — 3 endpoints only (`/register`, `/{id}/check-in`, `/{id}/check-out`) | `FoVisitorManagementPage` (1 route) | **Skeleton.** No pass issuance, no blacklist, no QR generation endpoint |
| **C** Document Management | `DocumentController` — `GET /search` plus basic CRUD; no versions, no folder-tree API | `FoDocumentsPage`, `CoDocumentsPage` | **Skeleton.** `documents.version_number` column exists but there is no `document_versions` table |
| **D** Records Retention & Compliance | `ComplianceController` — 18 endpoints (retention policies, disposals, alerts, audit logs) | 9 compliance routes | **Partially built** — best-covered non-facilities module |
| **E** Legal Management | `LegalCaseController` — class-level `@RequestMapping("/v1/legal-cases")` with no method mappings | **no route exists** | **Stub.** Table `legal_cases` exists; UI does not |
| **F** Contract Management | `ContractController` — `GET`, `POST`, `GET /{id}/analyze`. **No GET-by-id, no PUT, no DELETE** | `CoContractsPage` (read-only) | **Stub.** `ContractController.java:26-54` |

---

## 0.4 Blocking defects found in Phase 0

These gate any Phase 4 implementation work and are carried forward into Deliverables 4, 14 and 16.

### P0-1 — The application cannot start under its own default profile

Six entities declare `@Table` names with no corresponding Flyway migration:

`admin_notifications` · `backup_records` · `compliance_alerts` · `disposal_requests` · `integration_status` · `system_configurations`

The default profile runs `jpa.hibernate.ddl-auto: validate`, which fails on missing tables. This is precisely why both the `local` and `supabase` profiles disable Flyway and switch to `ddl-auto: update` — the drift is being routed around, not fixed.

### P0-2 — Effectively no endpoint-level RBAC

Authorization is four path prefixes in `backend/src/main/java/com/photonicomega/facilities/security/SecurityConfig.java`:

```java
.requestMatchers("/v1/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
.requestMatchers("/v1/facilities-manager/**").hasRole("FACILITIES_MANAGER")
.requestMatchers("/v1/facilities-officer/**").hasRole("FACILITIES_OFFICER")
.requestMatchers("/v1/compliance/**").hasRole("COMPLIANCE_OFFICER")
.anyRequest().authenticated()
```

Everything else — `/v1/contracts`, `/v1/documents`, `/v1/legal-cases`, `/v1/visitors`, `/v1/facilities`, `/v1/ai/**`, `/v1/security/admin/**` — is **authenticated-only, any role**. Any logged-in employee can delete a contract or read every legal case.

`@EnableMethodSecurity(prePostEnabled = true)` is enabled, but the codebase contains exactly one `@PreAuthorize`, at `com/photonicomega/security/controller/SecurityAdminController.java:18`. That class lives in `com.photonicomega.security.*`, which is **outside** the `@SpringBootApplication` scan base `com.photonicomega.facilities`. It is never registered as a bean. **The only role check in the codebase is dead code.**

### P0-3 — Two disjoint role vocabularies

| Source | Roles |
|---|---|
| `V4__add_module_admin_scopes.sql` (seeded into `roles`) | `ADMIN`, `MODULE_ADMIN`, `FACILITIES_STAFF`, `FRONT_DESK`, `RECORDS_OFFICER`, `LEGAL_OFFICER`, `EMPLOYEE` |
| `BootstrapAdmin.java` (creates actual users) | `SUPER_ADMIN` (:74), `FACILITIES_MANAGER` (:113), `FACILITIES_OFFICER` (:152), `COMPLIANCE_OFFICER` (:191) |

`SecurityConfig` and all four frontend guards gate on the **second** set. The seven V4-seeded roles are unreachable — no user can ever hold them.

### P0-4 — `ProtectedRoute` has identical branches

`frontend/src/App.tsx:82-92`:

```tsx
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  if (user?.roles && !user.roles.includes('FACILITIES_MANAGER')) {
    return <>{children}</>;
  }
  return <>{children}</>;
};
```

The role test is inert. Every authenticated user reaches the SysAdmin route group, including `/admin/settings`, `/admin/backup`, `/security`, and `/security/audit-logs`.

The other three guards — `FacilitiesRoute` (:94), `FacilitiesOfficerRoute` (:103), `ComplianceOfficerRoute` (:112) — are correctly written and serve as the reference pattern for the fix.

### P0-5 — Committed production secrets

`.gitignore` covers `.env` but **not** `application.yml`, so the following are in git history:

- Supabase pooler password `<redacted - rotated>` for user `postgres.<redacted - rotated>`
- Supabase anon key `<redacted - rotated>`
- Supabase project URL `<redacted - rotated>.supabase.co`
- Default JWT signing secret `<redacted - rotated>`

Seed credentials are additionally documented in plaintext in `backend/POSTGRES_PROFILE.md` (now redacted; bootstrap-only defaults, rotated in non-local environments).

**These require credential rotation, which is an operational action outside the scope of a code PR.** Raised to the project lead in Open Questions.

### P0-6 — Duplicate JPA mappings

`com.photonicomega.facilities.module.security.*` (live) and `com.photonicomega.security.*` (orphaned) both map the same six tables: `active_sessions`, `api_request_logs`, `blocked_ips`, `login_history`, `security_alerts`, `security_logs`.

Currently harmless only because the orphan tree is unscanned. Widening the component-scan base — a plausible future change — produces a Hibernate duplicate-mapping failure at startup.

### P0-7 — RLS is absent from the authoritative schema

All 31 Flyway tables have RLS off. The 13 Supabase tables have RLS on with `using (true) with check (true)`, which is functionally equivalent to off — the file's own comment reads `-- Permit all operations for anon key (development mode)`.

§9 requires RLS with an explicit policy decision on every new table. The existing baseline provides **no reusable pattern**, so Deliverable 11 must define one.

---

## 0.5 Collaboration state vs. Master Prompt §10

| §10 expectation | Reality |
|---|---|
| Feature branches | Single branch `main` |
| PR review | No PR history; 12 direct commits |
| Meaningful commit messages | 10 of 12 are the literal string `commit` |
| Multiple contributors | One author, "Administrator" |
| CI gates | None — no `.github/` directory |

§10 is therefore **aspirational, not established**. Deliverable 16 proposes the minimum branch/PR/CI scaffolding required to satisfy §10 and the §14 Definition of Done without disrupting the existing single-contributor flow.

---

*End of Phase 0 Report. Deliverables 1–16 follow in `TNVS-Deliverables.md`.*
