# TNVS Team 8 - Integration & Feature Gap Analysis
**Date:** 2026-08-04
**Baseline:** commit `af52f0b` (post 2026-08-03 update, 53 files, 3 new portals)
**Scope:** Facilities & Administrative Management System - integration readiness with Teams 1, 5, 6, 7, 9, 10 and feature gaps across Team 8's own systems and AI services.

---

## 1. Executive Summary

- **The core modules exist, but the "integration layer" does not.** The only integration artefact is a read-only `integration_status` registry (`admin/controller/IntegrationController.java`) backed by a table no migration creates. There are no inbound webhooks, no cross-team ingest APIs, no sync jobs, no external-entity IDs, and no service-account scopes. Every team integration listed in this document is currently greenfield on the Team 8 side.
- **Documents cannot actually ingest files.** There is no `MultipartFile` anywhere in the backend. `DocumentController` creates metadata-only rows and calls `OcrService`, which returns a literal `"Simulated OCR Extracted Text..."` string. The `app.storage.*` (local + Supabase) configuration is unused. This is the single biggest blocker for every "auto-store document" integration (Teams 1, 5, 6, 7, 9, 10).
- **All five AI services are mock/heuristic.** `OcrService`, `ContractAnalyticsAiService` (hardcoded clause results), and the `AiController` live-execute branch for `VISITOR_OCR` are simulated. The only real LLM call is `ReservationLlmGateway`, gated behind a placeholder key. "Smart Search" is a SQL `LIKE` query (`DocumentRepository.searchDocuments`), not semantic search.
- **Automation is configured but not wired.** `@EnableScheduling` is on, and three cron expressions exist (`retention-check-cron`, `contract-expiry-cron`, `visitor-cleanup-cron`), but no `@Scheduled` method consumes them. `ComplianceService.generateAlerts()` runs only at bootstrap and on a manual endpoint.
- **Production startup is blocked.** 12 entity tables (including `vendors`, `legal_notices`, `compliance_alerts`, `integration_status`) and 4 columns are absent from Flyway V1-V5 and from the Supabase migration; the default profile uses `ddl-auto: validate` and will abort. The 2026-08-03 analysis already flagged 6 tables/4 columns; this analysis verifies the missing set is actually **12 tables**.

---

## 2. Baseline - What Exists Today (verified at `af52f0b`)

### 2.1 Modules and endpoints

| System | Backend | Endpoint families | Frontend | Notes |
|---|---|---|---|---|
| Facilities Reservation | `module/facilities` | `/v1/facilities-manager` (18), `/v1/facilities-officer` (9), `/v1/facilities` | Facilities Manager + Officer portals, Employee portal | Approval workflow, AI suggest/draft/validate, room availability, calendar, analytics |
| Visitor Management | `module/visitor` | `/v1/visitors` (4) | FO portal | Register, check-in/out, QR token. No ID OCR, no watchlist |
| Document Management | `module/documents` | `/v1/documents` (3) | FO / Employee / Legal / Procurement portals | Metadata-only; no file upload; OCR simulated |
| Records Retention & Compliance | `module/compliance` + `module/records` | `/v1/compliance` (18) | Compliance portal | Retention policies, disposal approval, stateful alerts; alerts generated on-demand only |
| Legal Management | `module/legal` | `/v1/legal` (25), `/v1/legal-cases` (2) | Legal portal | Contracts lifecycle + cases + notices; `caseType`, `closedDate`, `resolutionNotes` now exist |
| Contract Management | `module/contracts` + `module/procurement` | `/v1/contracts` (3), `/v1/procurement` (30) | Procurement portal | Contract lifecycle, vendor master, obligations; `vendorId` loose reference on contracts |
| Employee self-service | `module/employee` | `/v1/employee` (22) | Employee portal | Reservations, visitors, documents, requests, notifications |
| Security Center | `module/security` | `/v1/security/admin` | SysAdmin portal | Audit logs, sessions, IP blocks, alerts, threat map |
| Admin | `module/admin` | `/v1/admin/*` | SysAdmin portal | Users, config, backups, notifications, integrations (read-only) |

### 2.2 Roles (single source in `SecurityConfig.java`)
`ADMIN`, `SUPER_ADMIN`, `FACILITIES_MANAGER`, `FACILITIES_OFFICER`, `COMPLIANCE_OFFICER`, `LEGAL_OFFICER`, `CONTRACT_OFFICER`, `EMPLOYEE`.

### 2.3 AI services (`facilities/ai/`)

| # | AI feature | Implementation status |
|---|---|---|
| 1 | Document Classification & OCR | `OcrService` returns a simulated string; classification is a heuristic with hardcoded tags in `AiController` |
| 2 | Contract & Legal Risk Analysis | `ContractAnalyticsAiService` returns hardcoded clause results |
| 3 | Visitor Verification & ID Parsing | Mock payload only, inside `AiController` live-execute `VISITOR_OCR` branch |
| 4 | Legal Retention & Records Compliance | No AI engine; `ComplianceService` heuristics (expiry windows) |
| 5 | Smart Search & Metadata Tagging | `DocumentRepository.searchDocuments` = `LOWER LIKE` over title/OCR/summary; no embeddings |

Provider state is in-memory (`AiStateManagementService` - `CopyOnWriteArrayList`), default provider key is the placeholder `sk-proj-default`, so the real-LLM path is disabled.

---

## 3. Cross-Team Integration Analysis

Each section follows the same pattern: **intent** (from Team 8's integration brief) -> **exists** -> **missing** -> **build needed** -> **readiness**.

---

### 3.1 TEAM 1 - Human Resource Management

**Intent:** Employee records, new-hire documents, training certificates, and employee contracts land in Team 8's Document Management automatically (e.g. a new Operations Officer hire -> contract + personnel file auto-archived).

**Exists today:**
- `EmployeeController` self-service: view/submit documents, requests, notifications, profile.
- `users` table and `User` entity with email/roles - the only "employee" identity.
- `documents` store with `categories`/`tags` and AI classification stubs.

**Missing:**
- No personnel/employee master (employee number, department, position, hire date, supervisor, employment status). The `User` entity is an auth record, not an HR record.
- No HR-facing ingest endpoint or webhook - nothing for HR to push into.
- No `sourceSystem`/`externalId` on `Document`, so records cannot be mapped back to HR's employee ID.
- No training-certificate tracking, onboarding checklist, or separation/retention handling.
- No document-level retention assignment (personnel files have specific retention rules).

**Build needed:**
- `employee_profiles` table (or an external-ID mapping table) linked to `users`.
- Inbound integration API: `POST /v1/integrations/hr/documents` (or webhook) that creates a document, runs OCR/classification, assigns retention, and notifies the employee.
- Document categories for HR types: `PERSONNEL`, `TRAINING_CERTIFICATE`, `EMPLOYMENT_CONTRACT`.
- Separation workflow (offboarding -> retention hold -> disposal scheduling).

**Readiness: Low.** Only self-service exists; no data path from HR.

---

### 3.2 TEAM 5 - Financial Management

**Intent:** Vendor contracts and payment agreements originate in Finance; Team 8 owns archiving and renewal (e.g. office-equipment supplier contract from Finance -> Team 8 archiving + renewal tracking).

**Exists today:**
- Strong contract domain: `Contract` (number, type, value, counterparty, start/end, `renewalNoticeDate`, `vendorId`, status) and a full lifecycle in `LegalOfficerController`/`ProcurementOfficerController` (submit-review -> approve -> activate -> renew -> terminate).
- `Vendor` master with obligations (`VendorObligation`), status and performance.

**Missing:**
- No source-of-origin on contracts: no `sourceSystem`/`externalId`/`budgetCode`/`approvalReference` fields for Finance's PO or budget approval.
- No Finance ingest endpoint.
- Renewal automation is dormant: the expiry scan exists (`ComplianceService.generateAlerts`) but nothing runs it on a schedule.
- No payment-agreement model distinct from vendor contracts.

**Build needed:**
- Add `sourceSystem`, `externalId`, `budgetReference` to `Contract` (nullable, additive).
- `POST /v1/integrations/finance/contracts` ingest with idempotency.
- Wire `contract-expiry-cron` to a scheduled renewal scan + notification.

**Readiness: Medium.** Contract domain is solid; automation and ingest are the gaps.

---

### 3.3 TEAM 6 - Supply Chain & Inventory

**Intent:** Purchase Orders -> delivery receipts -> documents -> archived (e.g. delivered computers: PO -> Document Management -> archived).

**Exists today:**
- Generic document store with categories/tags/folders.
- `Equipment` (asset) entity with serial number, maintenance dates, tied to a `Room`.
- Compliance archiving (`approveDocument`/`archiveDocument`/disposal workflow).

**Missing:**
- No PO / delivery-receipt / supplier-agreement document types or required fields (PO number, supplier, expected vs. received date, line items).
- No receiving workflow (match PO -> DR -> asset creation/link).
- No link between a document and an asset/equipment.
- No supplier-agreement link from documents to `Vendor`.

**Build needed:**
- Document categories `PURCHASE_ORDER`, `DELIVERY_RECEIPT`, `SUPPLIER_AGREEMENT` + structured fields.
- `PO_number` and optional `asset_id`/`vendor_id` columns on documents.
- Receiving workflow endpoint: `POST /v1/integrations/supply-chain/receipts`.

**Readiness: Low.** Generic document store only.

---

### 3.4 TEAM 7 - Fleet Management (largest integration)

**Intent:** Vehicle OR/CR, insurance, LTFRB documents, maintenance records, vehicle contracts shared with Team 8; AI compliance checks expiry -> notifies Fleet Manager.

**Exists today:**
- **Nothing fleet-specific.** No vehicle, fleet, insurance, LTFRB, or vehicle-maintenance entity/table/endpoint (verified by search). `Equipment` is office assets only.
- `ComplianceService.generateAlerts` proves the alert pattern (dedup key, acknowledge/dismiss) that fleet expiry monitoring would reuse.
- The 2026-08-03 update added `EmployeeNotification`/`AdminNotification`, which could carry fleet alerts, but no delivery channel (email/SMS) is wired.

**Missing:**
- `vehicles`, `vehicle_documents` (OR/CR, insurance, LTFRB), `fleet_maintenance` domains.
- Expiration-aware fields and a scheduled compliance scan per vehicle document type.
- Notification path to a Fleet Manager role (role does not exist today).
- An integration endpoint for Team 7 to push vehicle documents.

**Build needed:**
- Full fleet module (or read-only sync from Team 7's system).
- Scheduled job: `retention-check-cron`/new `fleet-compliance-cron` scanning expiry dates -> `ComplianceAlert` + notification.
- New `FLEET_MANAGER` role and portal surface.

**Readiness: None.** Greenfield; needs an explicit scope decision (mirrors Phase-3 Open Question 8 - do not invent a module).

---

### 3.5 TEAM 9 - TNVS Operations & Driver Management

**Intent:** New driver: HR -> driver info -> contract -> legal verification -> archived -> driver activated. Shared: driver contracts, driver IDs, accreditation, incident reports, legal cases.

**Exists today:**
- `LegalCase` domain (can hold driver legal cases) with `caseType`, status, priority, `closedDate`, `resolutionNotes`.
- Contracts domain (can hold driver employment/operator contracts).
- Employee self-service request pattern (`EmployeeRequest`) as a template for onboarding checklists.

**Missing:**
- `drivers` entity, `driver_accreditations` (expiry-aware), `driver_incidents` domains.
- Driver ID parsing (the `VISITOR_OCR`/ID-parsing AI is mock).
- The onboarding pipeline: contract -> legal verification -> archive -> activate is not modeled anywhere.
- Link between a legal case and a driver/employee.

**Build needed:**
- Driver domain with accreditation expiry + incident reports.
- Onboarding workflow with a legal-clearance gate.
- Driver -> contract -> case document grouping.

**Readiness: None.** Same scope decision as Team 7.

---

### 3.6 TEAM 10 - Booking & Customer Experience

**Intent:** Passenger complaint -> CRM -> Legal Management -> case resolution -> archive. Shared: customer complaints, legal complaints, audit logs, investigation reports.

**Exists today:**
- `LegalCase` with full case workflow and `resolutionNotes`/`closedDate`.
- `audit_logs` and the Security audit trail.
- Document archiving + disposal.

**Missing:**
- No complaint/customer-case entity or `sourceSystem` on `LegalCase` (no way to know the complaint came from CRM/Team 10).
- No CRM ingest endpoint or webhook.
- No investigation-report workflow (documents linked to a case).
- No case timeline/history view (flagged in the 2026-08-03 analysis section 2.8).
- No escalation SLA or deadline reminders (hearing dates are stored but never scheduled).

**Build needed:**
- `complaints` table (or `sourceSystem` + `externalId` on `LegalCase`).
- `POST /v1/integrations/cx/complaints` -> creates `LegalCase` + linked documents + audit trail.
- Case timeline entity + UI.

**Readiness: Low-Medium.** The legal-case anchor exists; the ingest path and case timeline do not.

---

## 4. Feature Gap Analysis - Team 8's Own Systems

### 4.1 Facilities Reservation System
**Covered:** manager approval, officer operations, employee self-service, room availability, calendar, analytics, reports, AI suggest/draft/validate.
**Gaps:**
- No maintenance request from employees - only Facilities Manager can set a room into maintenance.
- No export of reservations/analytics.
- Interval-based availability only; slot-based booking is an open question (Phase-3 OQ5).
- No automatic conflict notification to affected bookers.

### 4.2 Visitor Management System
**Covered:** register, QR token, check-in/out.
**Gaps:**
- AI ID parsing is mock; no real OCR of Philippine IDs.
- No security watchlist/blacklist matching (the `VISITOR_OCR` mock claims `securityWatchlistStatus: CLEARED` but nothing stores a watchlist).
- No photo capture or badge print.
- No host notification on visitor arrival.
- `visitor-cleanup-cron` exists but no cleanup job is implemented (no auto-checkout/expiry purge).
- No pre-registration approval workflow.

### 4.3 Document Management / Archiving
**Covered:** metadata CRUD, categories/tags/folders, search, AI classification stub, compliance approve/archive/disposal.
**Gaps:**
- **No file upload/storage.** Zero `MultipartFile` usage; `app.storage.*` config unused. This undermines the "Archiving System" claim and every document integration.
- OCR is simulated; no Tesseract/Tika dependency actually used.
- No document-level permissions (classification is stored, never enforced).
- No version control workflow (field `versionNumber` exists, no UI/API flow).
- No retention assignment per document (policies exist but documents carry no `retention_policy_id`/`retention_expiry`).
- Search is literal `LIKE`, not semantic.

### 4.4 Records Retention & Compliance
**Covered:** retention policies, disposal approval, stateful deduplicated alerts (contract expiry 30-day window, expired contracts, review overdue, disposal pending), audit writes.
**Gaps:**
- No scheduled scan - `generateAlerts()` is bootstrap/manual only.
- Policies are not applied to documents automatically (no expiry date computed per document).
- No legal hold (e.g. freeze disposal while a case is open).
- No archival-to-disposal progression at policy expiry (alerts only).

### 4.5 Legal Management System
**Covered:** case CRUD + status, contract lifecycle, notices, retention policies, audit logs.
**Gaps:**
- No case timeline/history (fields `closedDate`/`resolutionNotes` exist; UI verification still pending per 2026-08-03 section 2.8).
- No hearing/event calendar or deadline reminders.
- No linked-evidence set per case.
- No complaint intake (see section 3.6).

### 4.6 Contract Management
**Covered:** contract CRUD, lifecycle, clauses, vendor link, heuristic risk analysis.
**Gaps:**
- Renewal automation dormant (no scheduled job).
- AI risk analysis is hardcoded.
- No payment/budget fields for Finance linkage.
- No counterparty (vendor) notification on renewal.
- No audit writes in `ProcurementService` vendor CRUD (inconsistent with `ComplianceService`, which audits everything).

### 4.7 AI Capabilities
All five AI features are at **demo/dashboard** maturity:
| Feature | Reality | To reach production |
|---|---|---|
| Document Classification & OCR | Simulated OCR + heuristic tags | Real OCR pipeline + classification service with audit; store provider/score per document |
| Contract & Legal Risk Analysis | Hardcoded clause results | LLM/heuristic hybrid with persisted per-clause results |
| Visitor Verification & ID Parsing | Mock JSON | OCR + watchlist store + match scoring + decision audit |
| Legal Retention & Records Compliance | Alert heuristics only | Rule engine applying policies to documents, computing expiry dates |
| Smart Search & Metadata Tagging | `LIKE` search | Embeddings (needs `pgvector`, Phase-3 OQ3) + auto-tagging pipeline |

Provider config is in-memory and resets on restart (`AiStateManagementService`). A real provider registry (persisted, with secrets managed outside git) is required before any of the five features can be trusted in production.

---

## 5. Cross-Cutting Infrastructure Gaps

| # | Gap | Evidence | Impact |
|---|---|---|---|
| I1 | **Schema out of sync - 12 tables + 4 columns missing** | Flyway V1-V5 + Supabase `00001_create_all_tables.sql` vs 38 entity tables | Production boot failure on `ddl-auto: validate` |
| I2 | **Two schema sources of truth** | Flyway migrations vs Supabase migration redefine 13 shared table names with different columns; RLS is `using (true)` for anon | Data drift, no RLS protection |
| I3 | **No integration platform** | Only read-only `IntegrationStatus`; no webhooks, ingest APIs, sync jobs, external IDs, service accounts | All 6 team integrations greenfield |
| I4 | **No file upload** | No `MultipartFile`; `app.storage.*` unused; `OcrService` simulated | No real archiving; blocks all doc integrations |
| I5 | **Automation dormant** | `@EnableScheduling` + 3 orphaned crons; no `@Scheduled` consumers | No automated retention/expiry/cleanup |
| I6 | **AI is mock** | `ContractAnalyticsAiService`, `OcrService`, `AiController` live-execute | AI features are demo-grade |
| I7 | **Hardcoded credentials** | `LoginPage.tsx` quick-login buttons; `BootstrapAdmin` passwords in `POSTGRES_PROFILE.md` | Credential leak in production bundle |
| I8 | **Secrets in git** | `application.yml` tracked (JWT secret, Supabase keys, mail password) | Credential compromise |
| I9 | **Unguarded route families** | `/v1/ai/**`, `/v1/documents/**`, `/v1/contracts/**`, `/v1/visitors/**`, `/v1/legal-cases/**`, `/v1/facilities/**` fall to `.anyRequest().authenticated()` | Any logged-in role can read/write; no scoped integration access |
| I10 | **No pagination** | `List<T>` returns on all collection endpoints | Full-table loads as vendors/cases/docs grow |
| I11 | **Inconsistent audit** | `ProcurementService` vendor CRUD un-audited | No accountability for vendor changes |
| I12 | **Role-name dual convention** | Frontend checks `CONTRACT_OFFICER` and `ROLE_CONTRACT_OFFICER` | Fragile redirects if backend normalizes |
| I13 | **No outbound notification channel** | Mail config present, no `JavaMailSender` usage; notifications are in-app only | Fleet/compliance alerts never reach managers |
| I14 | **No n8n / workflow engine** | Zero n8n artefacts | Workflow automation requires build (Spring `@Scheduled` is lower risk) |

---

## 6. Recommended Roadmap (Priority Order)

### Blocker - before any integration work
| # | Action | Details |
|---|---|---|
| 1 | Write `V6__backfill_missing_module_tables.sql` (+ Supabase equivalent) | 12 tables + 4 columns per I1; additive `IF NOT EXISTS` |
| 2 | Remove/env-gate quick-login credentials | `VITE_DEV_MODE` flag in `LoginPage.tsx` |
| 3 | Reconcile or delete the Supabase migration | Pick Flyway as the single source of truth; fix RLS from `using (true)` |
| 4 | Rotate credentials and untrack secrets | Move to env-only config; add `application*.yml` to `.gitignore` |
| 5 | Role-guard the six unguarded route families | `@PreAuthorize` starting with `/v1/ai/**` |

### High - integration enablers
| # | Action | Details |
|---|---|---|
| 6 | Build the integration platform | `integration_events` table, ingest API `POST /v1/integrations/{team}/{resource}`, webhook auth, idempotency by `(sourceSystem, externalId)`, sync status write endpoint |
| 7 | Add `sourceSystem` + `externalId` to `Document`, `Contract`, `LegalCase` | The universal mapping key for all 6 teams |
| 8 | Implement real file upload/storage | Multipart endpoint -> local/Supabase storage -> OCR -> classification |
| 9 | Wire the 3 orphaned crons | Scheduled `generateAlerts`, contract-expiry, visitor cleanup |
| 10 | Extract shared enums + pagination + procurement audit | Per 2026-08-03 sections 2.3/2.5/2.9 |

### Medium - per-team build-out
| # | Team | Action |
|---|---|---|
| 11 | T1 HR | `employee_profiles`, HR document ingest, personnel categories + retention |
| 12 | T5 Finance | Contract source/budget fields, Finance ingest, renewal notifications |
| 13 | T6 Supply Chain | PO/DR doc types + fields, receiving workflow |
| 14 | T10 CX | Complaint intake -> `LegalCase` creation, case timeline UI |
| 15 | T7/T9 Fleet & Drivers | Scope decision first (Phase-3 OQ8); then fleet/driver domains + expiry automation |

### Low - hardening
| # | Action |
|---|---|
| 16 | Standardise role convention (drop dual-check) |
| 17 | Document-level permissions & versioning |
| 18 | Email/SMS notification delivery |
| 19 | Persist AI provider registry + replace mocks incrementally |
| 20 | Pagination + export for reservations/reports |

---

## 7. Proposed Standard Integration Contract

Every team integration should share one envelope instead of bespoke endpoints:

```
POST /v1/integrations/{system}/events          # HR, FINANCE, SUPPLY_CHAIN, FLEET, OPERATIONS, CX
Authorization: Bearer <service-account JWT>    # scoped role: INTEGRATION_HR, INTEGRATION_FINANCE, ...
X-Idempotency-Key: <event uuid>

{
  "sourceSystem": "HR" | "FINANCE" | "SUPPLY_CHAIN" | "FLEET" | "OPERATIONS" | "CX",
  "externalId": "<primary key in the source system>",
  "eventType": "DOCUMENT_CREATED" | "CONTRACT_CREATED" | "CONTRACT_RENEWED" | "COMPLAINT_FILED" | "VEHICLE_EXPIRY",
  "entityType": "DOCUMENT" | "CONTRACT" | "LEGAL_CASE" | "DRIVER" | "VEHICLE",
  "payload": { ... }
}
```

Rules:
- Every ingested record stores `sourceSystem` + `externalId` for idempotent upserts.
- Every mutation writes an `integration_events` audit row (status: `RECEIVED`, `PROCESSED`, `FAILED`).
- Failure never leaves a half-state; retries are safe (idempotency key).
- Notifications derived from ingested data (expiry, renewal, case assignment) are deduplicated per `(entityType, externalId, notificationType, date)`.
- Service accounts get role-scoped access, so the unguarded route families in I9 must be closed first.

---

## 8. Open Questions for Team 8 / Project Lead

1. **Fleet & Driver scope (Teams 7 & 9):** does Team 8 own vehicle/driver domains, or should the system read them from Team 7/Team 9 systems? This decision gates the two largest integrations.
2. **Integration transport:** are the other teams' systems exposing REST APIs we call, or must Team 8 expose endpoints for them to push into? Webhooks vs pull scheduling determines the build.
3. **Service accounts:** will other teams authenticate with scoped JWT accounts, or is an API-key registry preferred?
4. **Storage:** is the Supabase bucket the sanctioned file store for archives, or the local file server (`app.storage.primary`)?
5. **AI provider:** which provider is actually reachable (OpenAI-compatible endpoint with a real key, or Ollama)? All five AI features stay demo-grade until this is answered.
6. **Email/SMS:** is there an approved channel for sending expiry/compliance notifications to Fleet Managers, employees, and vendor contacts?
7. **Who owns credentials rotation** for the secrets already in git history (JWT secret, Supabase keys)?

---

## 9. References

- `docs/update-analysis-2026-08-03.md` - prior update analysis (issues 2.1-2.9)
- `docs/analysis/TNVS-Phase0-Report.md` - P0 defects, role vocabulary split, schema dual-source
- `docs/analysis/TNVS-Phase2-Deliverables.md` - D7 tables, D8 endpoints, D12 AI services, D13 n8n workflows (workflows 2-3 blocked on fleet scope)
- `docs/analysis/TNVS-Phase3-Deliverables.md` - roadmap, PR plan, 10 open questions (OQ3 pgvector, OQ6 AI provider, OQ7 n8n, OQ8 fleet scope)
- `backend/src/main/java/com/photonicomega/facilities/security/SecurityConfig.java` - role guards
- `backend/src/main/java/com/photonicomega/facilities/module/admin/controller/IntegrationController.java` - read-only integration status
- `backend/src/main/java/com/photonicomega/facilities/ai/` - AI services (mock/heuristic)
- `backend/src/main/resources/db/migration/` and `supabase/migrations/00001_create_all_tables.sql` - schema sources of truth
- `frontend/src/components/auth/LoginPage.tsx` - hardcoded credentials
