# Claude Coding Prompt — TNVS Team 8 System Enhancement
*Copy the entire file below into Claude (Claude Code / vibe coding session). Then give Claude ONE task from the Priority Queue at a time.*

---

## Role

Act as a senior full-stack engineer (Spring Boot 3 + React 19 + TypeScript) working on the existing **TNVS Team 8 — Facilities & Administrative Management System**. You have full read/write access to this repository. Work incrementally, make **additive, non-breaking changes only**, and always preserve existing behavior.

## Before writing any code, read these files

- `docs/integration-feature-gap-analysis-2026-08-04.md` — integration readiness, feature gaps, prioritized roadmap
- `docs/update-analysis-2026-08-03.md` — latest update analysis (issues + recommendations)
- `docs/analysis/TNVS-Phase0-Report.md` — blocking defects (boot failure, schema dual-source, RBAC gaps)
- `docs/analysis/TNVS-Phase3-Deliverables.md` — roadmap and open questions (OQ3 pgvector, OQ6 AI provider, OQ7 n8n, OQ8 fleet scope)
- `backend/src/main/resources/application.yml` — Spring profiles, database config, scheduler crons
- `backend/src/main/java/com/photonicomega/facilities/security/SecurityConfig.java` — role guards

## System identity

- **Purpose:** Facilities & Administrative Management for TNVS (Team 8). The core system must be ~70% complete and demoable at a pre-oral defense; integrations with other teams are a planned future capability, not a current dependency.
- **Backend:** Spring Boot 3.3.5, Java 21, Spring Security (JWT), Spring Data JPA, PostgreSQL, Lombok, Flyway (default/local profile only).
- **Frontend:** Vite 6 + React 19 + TypeScript, React Router, Zustand stores (`frontend/src/stores/authStore.ts`), API services under `frontend/src/api/`.
- **Database:** Supabase PostgreSQL (project ref `nlzfosfyyqileruosebi`). The `supabase` Spring profile connects to Supabase with `ddl-auto: update` and Flyway **disabled**. Local dev uses `local`/`default` profiles with Flyway migrations in `backend/src/main/resources/db/migration/`. Supabase schema migrations live in `supabase/migrations/` (currently only `00001_create_all_tables.sql`).
- **Realtime:** Supabase Realtime for live user activity / online users (backend `SupabaseRealtimePublisher`, frontend `realtimeSyncStore.ts`).

## Current modules (baseline state, do not re-verify exhaustively)

| Module | What works | Rough completeness |
|---|---|---|
| Facilities Reservation | Manager approval, officer ops, employee self-service, AI suggest/draft/validate, room availability, calendar, analytics, reports | ~80% |
| Visitor Management | Register, QR token, check-in/out | ~45% |
| Document Management / Archiving | Metadata CRUD, categories/tags/folders, LIKE search, approve/archive/disposal | ~40% |
| Records Retention & Compliance | Retention policies, disposal approval, stateful compliance alerts (manual trigger only) | ~55% |
| Legal Management | Contract lifecycle, cases, notices, retention policies, audit logs | ~60% |
| Contract Management (+ Procurement) | Contract lifecycle, vendor master, vendor obligations | ~60% |
| Employee self-service | Reservations, visitors, documents, requests, notifications, profile | ~50% |
| AI (5 modules) | All mock/heuristic; provider registry is in-memory, default key is placeholder `sk-proj-default` | ~20% |
| Integration platform | Read-only `integration_status` registry only | 0% |

Roles: `ADMIN`, `SUPER_ADMIN`, `FACILITIES_MANAGER`, `FACILITIES_OFFICER`, `COMPLIANCE_OFFICER`, `LEGAL_OFFICER`, `CONTRACT_OFFICER`, `EMPLOYEE`.

## Verified gaps (trust the docs; do not re-derive)

1. **Schema out of sync.** 12 tables + 4 columns are missing from `supabase/migrations/00001_create_all_tables.sql`: `admin_notifications`, `backup_records`, `compliance_alerts`, `disposal_requests`, `employee_notifications`, `employee_requests`, `integration_status`, `legal_notices`, `procurement_notices`, `system_configurations`, `vendor_obligations`, `vendors`; and `contracts.vendor_id`, `legal_cases.case_type`, `legal_cases.closed_date`, `legal_cases.resolution_notes`. The `supabase` profile hides this with `ddl-auto: update`; the `default` profile fails to boot with `ddl-auto: validate`.
2. **No real file upload.** Zero `MultipartFile` usage in the backend; `DocumentController` stores metadata only; `OcrService` returns a simulated string; `app.storage.*` config is unused.
3. **AI is mock.** `ContractAnalyticsAiService` returns hardcoded clause results; `OcrService` and the `AiController` live-execute branches are simulated; document search is a SQL `LIKE` query, not semantic.
4. **Automation dormant.** `@EnableScheduling` is on and three crons exist (`retention-check-cron`, `contract-expiry-cron`, `visitor-cleanup-cron`) but no `@Scheduled` method consumes them; `ComplianceService.generateAlerts()` runs only at bootstrap/manual endpoint.
5. **No integration platform.** `IntegrationController` is read-only; no webhooks, ingest APIs, sync jobs, external-entity IDs, or scoped service accounts.
6. **Security.** Hardcoded quick-login credentials in `frontend/src/components/auth/LoginPage.tsx`; secrets in tracked `application.yml`; six route families are unguarded beyond authentication: `/v1/ai/**`, `/v1/documents/**`, `/v1/contracts/**`, `/v1/visitors/**`, `/v1/legal-cases/**`, `/v1/facilities/**`.
7. **Engineering debt.** No pagination on list endpoints; `ProcurementService` vendor CRUD is not audited; duplicate enums (`NoticeSeverity/Status/Type` in `legal` and `procurement`); frontend checks both `CONTRACT_OFFICER` and `ROLE_CONTRACT_OFFICER`.
8. **Product gaps.** No case timeline UI, no complaint intake, no employee maintenance requests, no visitor watchlist/ID OCR/host notifications, no document-level permissions/versioning, no email/SMS delivery.

## Mission and priority queue

Goal: bring the core system to a **demoable ~70%** for the pre-oral, using an **integration-ready shell** (real ingest API + a built-in simulator) instead of live cross-team connections. Execute in this order; complete one step before the next.

1. **Schema fix (first).** Create `supabase/migrations/00002_create_module_tables.sql` for the 12 missing tables + 4 missing columns, mirroring the JPA entities. Pure additive DDL.
2. **Document pipeline.** Real upload endpoint (`MultipartFile`) → local/Supabase storage → OCR (heuristic acceptable for now) → classification with confidence + audit → approve → archive → disposal. Make Document Management the centerpiece.
3. **Compliance automation.** Wire the 3 orphaned crons: scheduled `generateAlerts()`, contract expiry, visitor cleanup. Auto-assign retention policies to document categories and compute per-document expiry dates.
4. **Visitor upgrade.** ID-parse flow (heuristic + optional OCR), watchlist check, host notification on arrival, auto-checkout via cron.
5. **Contract upgrade.** Renewal automation + notifications, audit vendor CRUD, persist per-clause risk analysis results.
6. **Legal upgrade.** Case timeline UI (fields already exist), deadline/hearing reminders, evidence-document linking, complaint intake.
7. **AI upgrade.** Make all 5 AI modules produce real input → scored output → persisted result with audit trail → visible in UI. Heuristic fallback is acceptable; a real provider is optional and must stay behind env-gated config.
8. **Facilities polish.** Employee maintenance requests, conflict notifications, exports.
9. **Integration shell.** `integration_events` table; generic idempotent `POST /v1/integrations/{system}/events`; add nullable `sourceSystem`/`externalId` to `Document`/`Contract`/`LegalCase`; a built-in simulator that posts into the same endpoint; seed `integration_status` for the 6 teams (HR, Finance, Supply Chain, Fleet, Ops/Driver, Booking/CX); update the SysAdmin Integration Management page to show per-team status/sync/event counts.
10. **Hardening.** Role-guard the unguarded route families, add pagination, extract shared enums, standardize role convention, remove/env-gate hardcoded credentials.

## Hard rules

1. **Additive schema only.** New migrations are new numbered files only. Never edit existing migrations (`V1`–`V5`, `00001_create_all_tables.sql`). Use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`. No `DROP`, `TRUNCATE`, or in-place `ALTER` of existing columns.
2. **No endpoint contract breaks.** Do not change existing paths, HTTP methods, or request/response shapes. Add new endpoints instead.
3. **Prefer new files.** New controllers/services/components over editing existing ones. When editing is necessary, keep it minimal and consistent with surrounding code.
4. **No secrets.** Never write real credentials into code, config, or logs. Use `${ENV_VAR:placeholder}`. Do not commit `.env` files or real keys. Flag any secret already present in git history rather than expanding its use.
5. **Do not enable Flyway on the `supabase` profile** unless explicitly instructed. The Supabase schema is managed via `supabase/migrations/` + the SQL editor.
6. **Do not build live integrations to other teams.** Build the ingest API and the simulator only.
7. **Do not create fleet/driver tables** (Teams 7/9). That scope is pending a decision; simulate fleet expiry alerts through the existing compliance pipeline instead.
8. **Match existing conventions.** Lombok entities extend `BaseEntity`; responses use `ApiResponse.success(...)`; package-per-module layout under `com.photonicomega.facilities.module.*`; role guards consistent with `SecurityConfig`.
9. **One logical change per step**, then verify before continuing.
10. **No big-bang refactors.** No renames of existing classes/tables, no UI redesigns, no framework swaps.
11. **Ask before inventing scope.** If a task requires the fleet/driver domain, real third-party integrations, or schema changes to existing tables, stop and ask instead of guessing.

## Verification (after each step)

- Backend compiles and tests pass: run `mvn -q verify` from `backend/`.
- Frontend builds when frontend files change: run `npm run build` from `frontend/`.
- Backend boots cleanly with `SPRING_PROFILES_ACTIVE=supabase` (and `local`) — context loads, no validation errors.
- After any SQL migration: give me the exact statements to run in the Supabase SQL editor, and confirm the backend still boots against the updated schema.
- Report what changed (files), how you verified it, and what to demo.

## Definition of done

- All changes are additive and reversible (new files + optional additive columns only).
- `mvn -q verify` and `npm run build` pass.
- The pre-oral demo shows the feature end-to-end in the UI with real data created through the normal flow (or through the integration simulator for cross-team flows).
- No hardcoded credentials introduced; no new secrets in git.
