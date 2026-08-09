# TNVS — Phase 2 Deliverables (D7–D13)

> **Companion documents:** `TNVS-Phase0-Report.md` · `TNVS-Phase1-Deliverables.md` (D1–D6) · `TNVS-Phase3-Deliverables.md` (D14–D16)
> **Labelling per §5:** `[VERIFIED]` = grounded in actual repository files · `[ASSUMED]` = design proposal requiring confirmation
> **Standing constraints:** R7 additive migrations only, never rewrite/drop existing tables · R8 reuse existing JWT + RBAC · R9 do not re-implement existing modules · §9 RLS + indexes on every new table

---

# DELIVERABLE 7 — REQUIRED TABLES `[VERIFIED baseline / ASSUMED design]`

All new schema is **additive** and begins at **`V6`** (`V1`–`V5` are applied and immutable). Every statement is `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, or `CREATE INDEX IF NOT EXISTS`. **No `DROP`, no type changes, no renames on existing tables anywhere in this plan.**

## 7.0 Standard column block

Every new table carries the V1/V2 convention, so `AuditorAwareImpl` and the soft-delete pattern work without new code:

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
-- … domain columns …
is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
deleted_at  TIMESTAMP,
deleted_by  VARCHAR(255),
created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMP,
created_by  VARCHAR(255),
updated_by  VARCHAR(255)
```

Referred to below as **`{audit block}`**. Every FK column gets an index, following `idx_facility_amenities_room` / `idx_reservation_approvals_reservation` from V5.

---

## 7.1 `V6__backfill_missing_module_tables.sql` — **P0-1 fix, highest priority**

Creates the six tables whose entities exist but whose migrations do not. Column sets are taken from the existing `@Entity` field mappings, so this is a *backfill of reality*, not a new design.

| Table | Purpose | Key columns |
|---|---|---|
| `system_configurations` | admin key/value config | `config_key VARCHAR(200) UNIQUE NOT NULL`, `config_value TEXT`, `description TEXT`, `{audit block}` |
| `admin_notifications` | admin notification feed | `title`, `message TEXT`, `type`, `severity`, `is_read BOOLEAN DEFAULT FALSE`, `read_at`, `recipient_id UUID REFERENCES users(id)`, `{audit block}` |
| `backup_records` | backup/DR history | `backup_name`, `backup_type`, `status`, `file_path`, `file_size BIGINT`, `started_at`, `completed_at`, `{audit block}` |
| `integration_status` | external system health | `system_name VARCHAR(200) UNIQUE NOT NULL`, `status`, `last_checked_at`, `last_error TEXT`, `endpoint_url`, `{audit block}` |
| `compliance_alerts` | compliance alerting | `title`, `description TEXT`, `alert_type`, `severity`, `status DEFAULT 'OPEN'`, `entity_type`, `entity_id UUID`, `acknowledged_by UUID REFERENCES users(id)`, `acknowledged_at`, `{audit block}` |
| `disposal_requests` | records disposal workflow | `document_id UUID REFERENCES documents(id)`, `requested_by UUID REFERENCES users(id)`, `reason TEXT`, `status DEFAULT 'PENDING'`, `reviewed_by UUID REFERENCES users(id)`, `reviewed_at`, `review_notes TEXT`, `{audit block}` |

Indexes: `idx_admin_notifications_recipient`, `idx_compliance_alerts_status`, `idx_compliance_alerts_entity`, `idx_disposal_requests_document`, `idx_disposal_requests_status`, `idx_integration_status_system`.

**Effect:** the default profile starts under `ddl-auto: validate`, and `local`/`supabase` can re-enable Flyway — closing the silent-DDL-to-cloud hole described in D2.5.

> **Verification requirement before this ships:** each entity's `@Column` names, nullability, lengths and types must be read field-by-field and mirrored exactly. A near-miss here fails `validate` just as hard as a missing table. This is the one migration where a column-by-column diff against the entity classes is mandatory.

---

## 7.2 `V7__visitor_management_schema.sql` — Module B

| Table | Purpose | Key columns |
|---|---|---|
| `visitor_passes` | QR pass lifecycle | `visitor_id UUID NOT NULL REFERENCES visitors(id)`, `pass_code VARCHAR(255) UNIQUE NOT NULL`, `qr_payload TEXT NOT NULL`, `status VARCHAR(30) DEFAULT 'ISSUED'` (ISSUED/ACTIVE/EXPIRED/REVOKED/USED), `valid_from TIMESTAMP NOT NULL`, `valid_until TIMESTAMP NOT NULL`, `issued_by UUID REFERENCES users(id)`, `revoked_by`, `revoked_at`, `revoke_reason TEXT`, `{audit block}` |
| `visitor_checkins` | per-visit history | `visitor_id UUID NOT NULL REFERENCES visitors(id)`, `pass_id UUID REFERENCES visitor_passes(id)`, `checked_in_at NOT NULL`, `checked_out_at`, `checkpoint VARCHAR(150)`, `checked_in_by UUID REFERENCES users(id)`, `checked_out_by`, `{audit block}` |
| `visitor_blacklist` | watchlist | `full_name NOT NULL`, `identifier VARCHAR(255)`, `reason TEXT NOT NULL`, `active BOOLEAN DEFAULT TRUE`, `added_by UUID REFERENCES users(id)`, `expires_at`, `{audit block}` |

Indexes: `idx_visitor_passes_visitor`, `idx_visitor_passes_code` (UNIQUE), `idx_visitor_passes_status`, `idx_visitor_checkins_visitor`, `idx_visitor_checkins_pass`, `idx_visitor_blacklist_active`.

**Reuses:** existing `visitors` table (unchanged), `visitors.qr_code_token` retained for backward compatibility, ZXing already on classpath.

---

## 7.3 `V8__document_management_schema.sql` — Module C

| Table | Purpose | Key columns |
|---|---|---|
| `document_versions` | **the core §6C gap** | `document_id UUID NOT NULL REFERENCES documents(id)`, `version_number INT NOT NULL`, `file_path TEXT NOT NULL`, `file_name`, `file_size BIGINT`, `checksum VARCHAR(128)`, `change_note TEXT`, `uploaded_by UUID REFERENCES users(id)`, `is_current BOOLEAN DEFAULT FALSE`, `{audit block}`, `UNIQUE(document_id, version_number)` |
| `document_categories` | hierarchical tree (the existing `categories` is flat and stays untouched) | `name NOT NULL`, `parent_id UUID REFERENCES document_categories(id)`, `path TEXT`, `depth INT DEFAULT 0`, `description`, `{audit block}` |
| `document_category_links` | many-to-many | `document_id UUID NOT NULL REFERENCES documents(id)`, `category_id UUID NOT NULL REFERENCES document_categories(id)`, `assigned_by UUID REFERENCES users(id)`, `is_primary BOOLEAN DEFAULT FALSE`, `{audit block}`, `UNIQUE(document_id, category_id)` |
| `document_permissions` | per-document ACL | `document_id UUID NOT NULL REFERENCES documents(id)`, `principal_type VARCHAR(20)` (USER/ROLE), `principal_id VARCHAR(255) NOT NULL`, `permission VARCHAR(20)` (READ/WRITE/DELETE/SHARE), `granted_by UUID REFERENCES users(id)`, `{audit block}` |
| `document_embeddings` `[ASSUMED]` | smart search (§7.4) | `document_id UUID NOT NULL REFERENCES documents(id)`, `chunk_index INT NOT NULL`, `chunk_text TEXT NOT NULL`, `embedding_model VARCHAR(100)`, `embedding_dim INT`, `embedding_vector TEXT`, `{audit block}` |

Indexes: `idx_document_versions_document`, `idx_document_versions_current`, `idx_document_categories_parent`, `idx_document_category_links_doc`, `idx_document_category_links_cat`, `idx_document_permissions_document`, `idx_document_permissions_principal`, `idx_document_embeddings_document`.

> **`document_embeddings` open decision — flagged, not assumed away.** `app.ai.embedding` declares `nomic-embed-text` at dimension 768, but **`pgvector` is not installed** and no embedding is computed anywhere today. The DDL above stores the vector as `TEXT` so the table is portable and requires no extension. If the project lead confirms `pgvector` is available on the target Postgres, the column becomes `VECTOR(768)` with an `ivfflat` index and search becomes a true ANN query. Without it, semantic ranking must be done in the JVM over a candidate set. **This choice materially changes §7.4's implementation and is Open Question 3.**

---

## 7.4 `V9__retention_compliance_schema.sql` — Module D

| Table | Purpose | Key columns |
|---|---|---|
| `retention_schedules` | per-record retention clock — the missing link between `retention_policies` and actual documents | `policy_id UUID NOT NULL REFERENCES retention_policies(id)`, `entity_type VARCHAR(50) NOT NULL`, `entity_id UUID NOT NULL`, `retention_start_date DATE NOT NULL`, `disposal_due_date DATE NOT NULL`, `status VARCHAR(30) DEFAULT 'ACTIVE'` (ACTIVE/ON_HOLD/DUE/DISPOSED), `last_evaluated_at`, `{audit block}` |
| `legal_holds` | suspends disposal for litigation | `title NOT NULL`, `description TEXT`, `case_id UUID REFERENCES legal_cases(id)`, `entity_type`, `entity_id UUID`, `status VARCHAR(30) DEFAULT 'ACTIVE'`, `issued_by UUID REFERENCES users(id)`, `issued_at NOT NULL`, `released_by`, `released_at`, `release_reason TEXT`, `{audit block}` |
| `disposal_certificates` | immutable destruction record | `disposal_request_id UUID NOT NULL REFERENCES disposal_requests(id)`, `certificate_number VARCHAR(100) UNIQUE NOT NULL`, `disposed_at NOT NULL`, `disposal_method VARCHAR(100)`, `witnessed_by UUID REFERENCES users(id)`, `authorised_by UUID REFERENCES users(id)`, `checksum VARCHAR(128)`, `{audit block}` |
| `compliance_reports` | generated report artefacts | `report_type NOT NULL`, `title NOT NULL`, `period_start DATE`, `period_end DATE`, `status DEFAULT 'GENERATING'`, `file_path TEXT`, `generated_by UUID REFERENCES users(id)`, `summary_json TEXT`, `{audit block}` |

Indexes: `idx_retention_schedules_entity`, `idx_retention_schedules_due` (on `disposal_due_date` — drives the nightly job), `idx_retention_schedules_status`, `idx_legal_holds_entity`, `idx_legal_holds_status`, `idx_disposal_certificates_request`, `idx_compliance_reports_type`.

**Critical rule enforced in the service layer:** a `retention_schedules` row with any `ACTIVE` matching `legal_holds` row can never transition to `DISPOSED`. Legal hold beats retention, always — and this must be a database-backed check, not a UI guard.

---

## 7.5 `V10__legal_management_schema.sql` — Module E

| Table | Purpose | Key columns |
|---|---|---|
| `case_events` | case timeline | `case_id UUID NOT NULL REFERENCES legal_cases(id)`, `event_type NOT NULL`, `title NOT NULL`, `description TEXT`, `event_date NOT NULL`, `recorded_by UUID REFERENCES users(id)`, `{audit block}` |
| `hearings` | hearing calendar | `case_id UUID NOT NULL REFERENCES legal_cases(id)`, `hearing_date TIMESTAMP NOT NULL`, `court_name`, `hearing_type`, `location`, `status DEFAULT 'SCHEDULED'`, `outcome TEXT`, `presiding_officer`, `{audit block}` |
| `case_documents` | case ↔ document link | `case_id UUID NOT NULL REFERENCES legal_cases(id)`, `document_id UUID NOT NULL REFERENCES documents(id)`, `document_role VARCHAR(50)` (EVIDENCE/PLEADING/CORRESPONDENCE/RULING), `attached_by UUID REFERENCES users(id)`, `{audit block}`, `UNIQUE(case_id, document_id)` |
| `case_resolutions` | outcomes | `case_id UUID NOT NULL REFERENCES legal_cases(id)`, `resolution_type NOT NULL`, `resolution_date DATE NOT NULL`, `summary TEXT`, `financial_impact NUMERIC(15,2)`, `recorded_by UUID REFERENCES users(id)`, `{audit block}` |
| `case_assignments` | counsel assignment (replaces free-text `lead_counselor`) | `case_id UUID NOT NULL REFERENCES legal_cases(id)`, `user_id UUID NOT NULL REFERENCES users(id)`, `role VARCHAR(50)` (LEAD/SUPPORT/EXTERNAL), `assigned_at`, `{audit block}` |

Indexes: `idx_case_events_case`, `idx_case_events_date`, `idx_hearings_case`, `idx_hearings_date`, `idx_case_documents_case`, `idx_case_documents_document`, `idx_case_resolutions_case`, `idx_case_assignments_case`, `idx_case_assignments_user`.

**Note:** `legal_cases` itself is untouched. `case_assignments` supplements the existing free-text counsel field rather than migrating it (R7).

---

## 7.6 `V11__contract_management_schema.sql` — Module F

| Table | Purpose | Key columns |
|---|---|---|
| `vendors` | counterparty master | `name NOT NULL`, `vendor_code VARCHAR(50) UNIQUE`, `contact_person`, `email`, `phone`, `address TEXT`, `tax_id`, `status DEFAULT 'ACTIVE'`, `risk_rating VARCHAR(20)`, `{audit block}` |
| `contract_approvals` | approval chain | `contract_id UUID NOT NULL REFERENCES contracts(id)`, `approver_id UUID REFERENCES users(id)`, `sequence_order INT NOT NULL`, `decision VARCHAR(30) DEFAULT 'PENDING'`, `comments TEXT`, `decided_at`, `{audit block}` |
| `contract_renewals` | renewal cycle | `contract_id UUID NOT NULL REFERENCES contracts(id)`, `renewal_number INT NOT NULL`, `previous_end_date DATE`, `new_end_date DATE`, `renewal_status DEFAULT 'PENDING'`, `value_change NUMERIC(15,2)`, `initiated_by UUID REFERENCES users(id)`, `decided_at`, `notes TEXT`, `{audit block}` |
| `contract_milestones` `[ASSUMED]` | obligation tracking | `contract_id UUID NOT NULL REFERENCES contracts(id)`, `title NOT NULL`, `due_date DATE NOT NULL`, `status DEFAULT 'PENDING'`, `completed_at`, `owner_id UUID REFERENCES users(id)`, `{audit block}` |

Plus additive column: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);` — the existing free-text counterparty column is **retained untouched** (R7); `vendor_id` is optional and backfilled over time.

Indexes: `idx_vendors_code`, `idx_vendors_status`, `idx_contract_approvals_contract`, `idx_contract_approvals_approver`, `idx_contract_renewals_contract`, `idx_contract_milestones_contract`, `idx_contract_milestones_due`, `idx_contracts_vendor`, `idx_contracts_end_date` (drives the expiry job).

---

## 7.7 `V12__reservation_enhancements_schema.sql` — Module A gap closure

| Table | Purpose | Key columns |
|---|---|---|
| `reservation_blackout_dates` | holidays / closures | `facility_id UUID REFERENCES facilities(id)`, `room_id UUID REFERENCES rooms(id)`, `blackout_date DATE NOT NULL`, `start_time TIME`, `end_time TIME`, `reason TEXT`, `recurring_annually BOOLEAN DEFAULT FALSE`, `{audit block}` |
| `reservation_equipment` | equipment attached to a booking | `reservation_id UUID NOT NULL REFERENCES reservations(id)`, `equipment_id UUID NOT NULL REFERENCES equipment(id)`, `quantity INT DEFAULT 1`, `{audit block}`, `UNIQUE(reservation_id, equipment_id)` |

Indexes: `idx_reservation_blackout_date`, `idx_reservation_blackout_room`, `idx_reservation_equipment_reservation`, `idx_reservation_equipment_equipment`.

> **`reservation_slots` deliberately omitted.** D3.1 lists it as a §6 gap, but the existing implementation computes availability from `start_datetime`/`end_datetime` overlap in `RoomAvailabilityService`, and that works. Introducing a slot table would be a **redesign of a working module (R2 violation)**. Recurring reservations and check-in/check-out are delivered as *endpoints over existing columns* (`parent_reservation_id`, `recurrence_type`, `qr_code_token`, `check_in_time`, `check_out_time`) — no new table needed. Flagged as Open Question 5 if the lead specifically wants slot-based booking.

---

## 7.8 `V13__ai_and_workflow_audit_schema.sql` — §7.5 and §8 governance

| Table | Purpose | Key columns |
|---|---|---|
| `ai_invocation_logs` | **§7.5 requirement: audit every AI call.** Replaces the in-memory `AiStateManagementService` log | `invocation_id UUID NOT NULL`, `service_name NOT NULL`, `provider VARCHAR(100)`, `model VARCHAR(100)`, `module VARCHAR(50)`, `entity_type`, `entity_id UUID`, `prompt_hash VARCHAR(128)`, `input_tokens INT`, `output_tokens INT`, `latency_ms INT`, `status VARCHAR(30)` (SUCCESS/FALLBACK/ERROR), `degraded BOOLEAN DEFAULT FALSE`, `error_message TEXT`, `invoked_by UUID REFERENCES users(id)`, `invoked_at TIMESTAMP NOT NULL DEFAULT NOW()`, `{audit block}` |
| `ai_providers` | persist the provider registry currently held in `CopyOnWriteArrayList` | `name UNIQUE NOT NULL`, `base_url`, `model`, `provider_type`, `is_default BOOLEAN DEFAULT FALSE`, `enabled BOOLEAN DEFAULT TRUE`, `{audit block}` |
| `ai_module_settings` | persist per-module AI toggles | `module_key VARCHAR(100) UNIQUE NOT NULL`, `enabled BOOLEAN DEFAULT TRUE`, `provider_id UUID REFERENCES ai_providers(id)`, `{audit block}` |
| `ai_decisions` | §7.5: no AI-only legal/compliance/retention action — records the human confirmation | `invocation_id UUID NOT NULL`, `decision_type NOT NULL`, `entity_type`, `entity_id UUID`, `ai_recommendation TEXT`, `ai_confidence NUMERIC(5,2)`, `human_decision VARCHAR(30)` (ACCEPTED/REJECTED/MODIFIED), `decided_by UUID REFERENCES users(id)`, `decided_at`, `{audit block}` |
| `workflow_executions` | §8: audit n8n callbacks | `workflow_name NOT NULL`, `execution_id VARCHAR(255)`, `trigger_type`, `status VARCHAR(30)`, `payload_summary TEXT`, `started_at`, `finished_at`, `error_message TEXT`, `{audit block}` |

Indexes: `idx_ai_invocation_logs_invoked_at`, `idx_ai_invocation_logs_service`, `idx_ai_invocation_logs_entity`, `idx_ai_decisions_entity`, `idx_ai_decisions_invocation`, `idx_workflow_executions_name`, `idx_workflow_executions_status`.

---

## 7.9 Summary

| Migration | Module | New tables | Additive ALTERs |
|---|---|---|---|
| `V6` | admin + compliance backfill (P0-1) | 6 | 0 |
| `V7` | B — Visitor | 3 | 0 |
| `V8` | C — Document | 5 | 0 |
| `V9` | D — Retention | 4 | 0 |
| `V10` | E — Legal | 5 | 0 |
| `V11` | F — Contract | 4 | 1 (`contracts.vendor_id`) |
| `V12` | A — Reservation gaps | 2 | 0 |
| `V13` | AI + workflow governance | 5 | 0 |
| **Total** | | **34** | **1** |

Existing tables dropped or restructured: **zero** (R7).

---

# DELIVERABLE 8 — REQUIRED API ENDPOINTS `[ASSUMED design on VERIFIED conventions]`

**Universal rules for every endpoint below:**
- Path `/v1/<resource>` under `context-path: /api` → public URL `/api/v1/...`
- Returns `ApiResponse<T>`
- Carries `@PreAuthorize` with a `BootstrapAdmin`-vocabulary role (D2.3)
- Documented with `@Tag` / `@Operation`
- State changes write to `audit_logs` via the existing `AuditService` (§14 DoD)
- Accepts and returns **DTOs**, never JPA entities

**Legend:** `[EXTEND]` add to an existing controller (R9) · `[NEW]` new controller

## 8.1 Module B — Visitor Management `[EXTEND VisitorController]`

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/v1/visitors` | FACILITIES_OFFICER, FACILITIES_MANAGER, ADMIN | list/filter visitors |
| `GET` | `/v1/visitors/{id}` | same | visitor detail |
| `PUT` | `/v1/visitors/{id}` | FACILITIES_OFFICER, ADMIN | update visitor |
| `POST` | `/v1/visitors/{id}/passes` | FACILITIES_OFFICER, ADMIN | **issue QR pass** (ZXing) |
| `GET` | `/v1/visitors/{id}/passes` | FACILITIES_OFFICER, FACILITIES_MANAGER, ADMIN | pass history |
| `GET` | `/v1/visitor-passes/{passCode}` | FACILITIES_OFFICER, ADMIN | resolve pass by code |
| `POST` | `/v1/visitor-passes/{passCode}/validate` | FACILITIES_OFFICER, ADMIN | **scan/validate at door** |
| `POST` | `/v1/visitor-passes/{id}/revoke` | FACILITIES_OFFICER, FACILITIES_MANAGER, ADMIN | revoke pass |
| `GET` | `/v1/visitors/{id}/checkins` | FACILITIES_OFFICER, FACILITIES_MANAGER, ADMIN | visit history |
| `GET` | `/v1/visitor-blacklist` | FACILITIES_MANAGER, ADMIN | list watchlist |
| `POST` | `/v1/visitor-blacklist` | FACILITIES_MANAGER, ADMIN | add entry |
| `DELETE` | `/v1/visitor-blacklist/{id}` | FACILITIES_MANAGER, ADMIN | deactivate entry |
| `GET` | `/v1/visitors/dashboard/summary` | FACILITIES_OFFICER, FACILITIES_MANAGER, ADMIN | KPIs |

**Retained unchanged:** `POST /register`, `POST /{id}/check-in`, `POST /{id}/check-out` — but each gains `@PreAuthorize`, and check-in now also writes a `visitor_checkins` row and enforces a blacklist check.

## 8.2 Module C — Document Management `[EXTEND DocumentController]`

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/v1/documents` | authenticated + doc permission | list/filter |
| `GET` | `/v1/documents/{id}` | permission-checked | detail |
| `PUT` | `/v1/documents/{id}` | permission-checked WRITE | update metadata |
| `DELETE` | `/v1/documents/{id}` | permission-checked DELETE | soft delete |
| `POST` | `/v1/documents/{id}/versions` | WRITE | **upload new version** |
| `GET` | `/v1/documents/{id}/versions` | READ | version history |
| `GET` | `/v1/documents/{id}/versions/{n}/download` | READ | download a version |
| `POST` | `/v1/documents/{id}/versions/{n}/restore` | WRITE | restore version as current |
| `GET` | `/v1/document-categories/tree` | authenticated | **hierarchical tree** |
| `POST` | `/v1/document-categories` | RECORDS/COMPLIANCE_OFFICER, ADMIN | create category |
| `PUT` | `/v1/document-categories/{id}` | same | update |
| `POST` | `/v1/documents/{id}/categories` | WRITE | assign categories (multi) |
| `GET` | `/v1/document-folders/tree` | authenticated | folder tree (`folders` table exists, unused) |
| `POST` | `/v1/document-folders` | authenticated | create folder |
| `POST` | `/v1/documents/{id}/permissions` | OWNER, ADMIN | grant permission |
| `GET` | `/v1/documents/{id}/permissions` | OWNER, ADMIN | list permissions |
| `POST` | `/v1/documents/search/smart` | authenticated | **§7.4 semantic search** |
| `POST` | `/v1/documents/{id}/classify` | authenticated | §7.1 classification (persisted to `ai_invocation_logs`) |

**Retained:** `GET /v1/documents/search` (literal) — unchanged, now `@PreAuthorize`-gated.

## 8.3 Module D — Retention & Compliance `[EXTEND ComplianceController]`

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/v1/compliance/retention-schedules` | COMPLIANCE_OFFICER, ADMIN | list per-record clocks |
| `POST` | `/v1/compliance/retention-schedules` | COMPLIANCE_OFFICER, ADMIN | apply policy to entity |
| `POST` | `/v1/compliance/retention-schedules/evaluate` | COMPLIANCE_OFFICER, ADMIN | recompute due dates |
| `GET` | `/v1/compliance/retention-schedules/due` | COMPLIANCE_OFFICER, ADMIN | due for disposal |
| `GET` | `/v1/compliance/legal-holds` | COMPLIANCE_OFFICER, ADMIN | list holds |
| `POST` | `/v1/compliance/legal-holds` | COMPLIANCE_OFFICER, ADMIN | **issue hold** |
| `POST` | `/v1/compliance/legal-holds/{id}/release` | COMPLIANCE_OFFICER, ADMIN | release hold |
| `POST` | `/v1/compliance/disposals/{id}/certificate` | COMPLIANCE_OFFICER, ADMIN | issue destruction certificate |
| `GET` | `/v1/compliance/disposal-certificates/{id}` | COMPLIANCE_OFFICER, ADMIN | retrieve certificate |
| `GET` | `/v1/compliance/command-center` | COMPLIANCE_OFFICER, ADMIN | **§7.2 flagship aggregate** |
| `GET` | `/v1/compliance/command-center/risks` | COMPLIANCE_OFFICER, ADMIN | ranked risk feed |
| `POST` | `/v1/compliance/reports` | COMPLIANCE_OFFICER, ADMIN | generate report |
| `GET` | `/v1/compliance/reports` | COMPLIANCE_OFFICER, ADMIN | list reports |
| `GET` | `/v1/compliance/reports/{id}/download` | COMPLIANCE_OFFICER, ADMIN | download |

**Retained:** all 18 existing compliance endpoints, each gaining explicit `@PreAuthorize` (currently covered only by the `/v1/compliance/**` path rule — which is correct today but becomes fragile as sub-paths grow).

## 8.4 Module E — Legal Management `[EXTEND LegalCaseController]`

The controller class exists with zero method mappings. All of these are additions to it.

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/v1/legal-cases` | LEGAL/COMPLIANCE_OFFICER, ADMIN | list/filter |
| `POST` | `/v1/legal-cases` | LEGAL/COMPLIANCE_OFFICER, ADMIN | create case |
| `GET` | `/v1/legal-cases/{id}` | same | detail |
| `PUT` | `/v1/legal-cases/{id}` | same | update |
| `DELETE` | `/v1/legal-cases/{id}` | ADMIN | soft delete |
| `GET` | `/v1/legal-cases/{id}/events` | same | timeline |
| `POST` | `/v1/legal-cases/{id}/events` | same | add event |
| `GET` | `/v1/legal-cases/{id}/hearings` | same | hearings |
| `POST` | `/v1/legal-cases/{id}/hearings` | same | schedule hearing |
| `PUT` | `/v1/hearings/{id}` | same | update/record outcome |
| `GET` | `/v1/legal-cases/{id}/documents` | same | linked documents |
| `POST` | `/v1/legal-cases/{id}/documents` | same | attach document |
| `POST` | `/v1/legal-cases/{id}/resolution` | same | record outcome |
| `POST` | `/v1/legal-cases/{id}/assignments` | same | assign counsel |
| `GET` | `/v1/legal-cases/dashboard/summary` | same | KPIs |
| `GET` | `/v1/hearings/calendar` | same | calendar view |

## 8.5 Module F — Contract Management `[EXTEND ContractController]`

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/v1/contracts/{id}` | COMPLIANCE_OFFICER, ADMIN | **detail — currently impossible** |
| `PUT` | `/v1/contracts/{id}` | COMPLIANCE_OFFICER, ADMIN | **update — currently impossible** |
| `DELETE` | `/v1/contracts/{id}` | ADMIN | soft delete |
| `GET` | `/v1/contracts/expiring` | COMPLIANCE_OFFICER, ADMIN | expiry feed (drives §8 workflow 1) |
| `POST` | `/v1/contracts/{id}/approvals` | COMPLIANCE_OFFICER, ADMIN | submit for approval |
| `POST` | `/v1/contract-approvals/{id}/decide` | approver | approve/reject |
| `GET` | `/v1/contracts/{id}/approvals` | COMPLIANCE_OFFICER, ADMIN | approval chain |
| `POST` | `/v1/contracts/{id}/renewals` | COMPLIANCE_OFFICER, ADMIN | initiate renewal |
| `POST` | `/v1/contract-renewals/{id}/decide` | COMPLIANCE_OFFICER, ADMIN | decide renewal |
| `GET` | `/v1/contracts/{id}/milestones` | COMPLIANCE_OFFICER, ADMIN | obligations |
| `POST` | `/v1/contracts/{id}/milestones` | COMPLIANCE_OFFICER, ADMIN | add milestone |
| `GET` | `/v1/vendors` | COMPLIANCE_OFFICER, ADMIN | vendor list |
| `POST` | `/v1/vendors` | COMPLIANCE_OFFICER, ADMIN | create vendor |
| `PUT` | `/v1/vendors/{id}` | COMPLIANCE_OFFICER, ADMIN | update vendor |
| `GET` | `/v1/contracts/dashboard/summary` | COMPLIANCE_OFFICER, ADMIN | KPIs |

**Retained:** `GET /v1/contracts`, `POST /v1/contracts`, `GET /v1/contracts/{id}/analyze` — behaviour unchanged, `@PreAuthorize` added, entity request body replaced with a DTO.

## 8.6 Module A — Reservation gap closure `[EXTEND FacilitiesOfficerController / FacilitiesManagerController]`

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/v1/facilities-officer/reservations/{id}/qr` | FACILITIES_OFFICER | issue reservation QR (column exists, endpoint doesn't) |
| `POST` | `/v1/facilities-officer/reservations/{id}/check-in` | FACILITIES_OFFICER | **populates the unused `check_in_time`** |
| `POST` | `/v1/facilities-officer/reservations/{id}/check-out` | FACILITIES_OFFICER | populates `check_out_time` |
| `POST` | `/v1/facilities-officer/reservations/recurring` | FACILITIES_OFFICER | **uses existing `parent_reservation_id`/`recurrence_type`** |
| `GET` | `/v1/facilities-manager/blackout-dates` | FACILITIES_MANAGER | list |
| `POST` | `/v1/facilities-manager/blackout-dates` | FACILITIES_MANAGER | create |
| `DELETE` | `/v1/facilities-manager/blackout-dates/{id}` | FACILITIES_MANAGER | remove |
| `POST` | `/v1/facilities-officer/reservations/{id}/equipment` | FACILITIES_OFFICER | attach equipment |

## 8.7 AI endpoints `[EXTEND AiController]`

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/v1/ai/invocations` | ADMIN | **persisted** call audit (replaces in-memory) |
| `GET` | `/v1/ai/decisions` | ADMIN, COMPLIANCE_OFFICER | AI recommendation vs human decision log |
| `POST` | `/v1/ai/decisions/{invocationId}/confirm` | role-appropriate | §7.5 human confirmation gate |
| `GET` | `/v1/ai/health` | ADMIN | provider reachability + degradation state |

**Critical:** `/v1/ai/**` currently has **no role check at all**. Every existing AI endpoint — including `POST /v1/ai/execute` — gains `@PreAuthorize`. This is the highest-severity item in D8.

## 8.8 Workflow callbacks `[NEW WorkflowCallbackController]`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/workflows/{name}/callback` | shared-secret header, **not** user JWT | n8n reports execution result |
| `GET` | `/v1/workflows/executions` | ADMIN | execution audit |

n8n is a server-to-server caller with no user identity, so a bearer JWT is the wrong mechanism. A dedicated header secret validated in the controller — with the path added to the `SecurityConfig` public allowlist — is the minimal correct approach. **This is the only place in the plan that touches `SecurityConfig`, and it is an allowlist addition, not a change to existing rules.**

## 8.9 Endpoint totals

| Module | New | Extended existing | Gaining `@PreAuthorize` |
|---|---|---|---|
| B Visitor | 13 | 3 | 16 |
| C Document | 18 | 1 | 19 |
| D Compliance | 14 | 18 | 32 |
| E Legal | 16 | 0 | 16 |
| F Contract | 15 | 3 | 18 |
| A Reservation | 8 | 0 | 8 |
| AI | 4 | 16 | 20 |
| Workflow | 2 | 0 | 2 (secret-based) |
| **Total** | **90** | **41** | **131** |

---

# DELIVERABLE 9 — REQUIRED FRONTEND PAGES `[ASSUMED design on VERIFIED conventions]`

All pages: one file per page, under the existing role-group directory, using the existing layout shell, styled exclusively from `tailwind.config.js` tokens, consuming `components/ui/` primitives from D6.3, and reached through a **correctly role-guarded route**.

## 9.1 Prerequisite route-layer fixes

Before any new page is added:

1. **Fix `ProtectedRoute` (P0-4)** — implement the real role test using the `FacilitiesRoute` pattern (`App.tsx:94-101`), so the SysAdmin group is actually restricted to `SUPER_ADMIN`/`ADMIN`.
2. **Rehydrate `user` in `authStore` (D2.8)** — persist and restore the user object alongside `accessToken`, so role guards survive a refresh and deep links work.

Without these two, every new guarded route inherits the same defects. They are PR-2 in D14.

## 9.2 Module B — Visitor Management (Facilities Officer group)

| Route | File | Purpose |
|---|---|---|
| `/facilities-officer/visitors` | *(existing `FoVisitorManagementPage`)* | **extend** — list, filter, register |
| `/facilities-officer/visitors/:id` | `FoVisitorDetailPage.tsx` | profile, visit history, passes |
| `/facilities-officer/visitors/passes` | `FoVisitorPassesPage.tsx` | issue/revoke passes, `QrDisplay` |
| `/facilities-officer/visitors/scan` | `FoVisitorScanPage.tsx` | validate pass code at the door |
| `/facilities-manager/visitors/blacklist` | `FmVisitorBlacklistPage.tsx` | watchlist management |

## 9.3 Module C — Document Management (Facilities Officer + Compliance groups)

| Route | File | Purpose |
|---|---|---|
| `/facilities-officer/documents` | *(existing `FoDocumentsPage`)* | **extend** — folder tree + list |
| `/facilities-officer/documents/:id` | `FoDocumentDetailPage.tsx` | metadata, preview, categories |
| `/facilities-officer/documents/:id/versions` | `FoDocumentVersionsPage.tsx` | `Timeline` of versions, restore |
| `/facilities-officer/documents/search` | `FoSmartSearchPage.tsx` | §7.4 smart search |
| `/compliance/document-categories` | `CoDocumentCategoriesPage.tsx` | hierarchical category admin |
| `/compliance/documents/:id/permissions` | `CoDocumentPermissionsPage.tsx` | per-document ACL |

## 9.4 Module D — Retention & Compliance (Compliance group)

| Route | File | Purpose |
|---|---|---|
| `/compliance/command-center` | `CoComplianceCommandCenterPage.tsx` | **§7.2 flagship** — risk feed, due retention, expiring contracts, open holds, AI-flagged items |
| `/compliance/retention-schedules` | `CoRetentionSchedulesPage.tsx` | per-record clocks, due list |
| `/compliance/legal-holds` | `CoLegalHoldsPage.tsx` | issue/release holds |
| `/compliance/disposals/:id/certificate` | `CoDisposalCertificatePage.tsx` | destruction certificate |
| `/compliance/reports` | `CoComplianceReportsPage.tsx` | generate/download reports |

**Retained unchanged:** the 9 existing compliance routes.

## 9.5 Module E — Legal Management (**new route group**)

Module E has no frontend at all today. It needs a role group, reusing the existing layout shell pattern rather than inventing a fifth design.

| Route | File | Purpose |
|---|---|---|
| `/legal` | `LegalDashboard.tsx` | KPIs, upcoming hearings, active cases |
| `/legal/cases` | `LegalCasesPage.tsx` | list/filter/create |
| `/legal/cases/:id` | `LegalCaseDetailPage.tsx` | detail + tabs |
| `/legal/cases/:id/events` | `LegalCaseEventsPage.tsx` | `Timeline` |
| `/legal/cases/:id/documents` | `LegalCaseDocumentsPage.tsx` | attached documents |
| `/legal/hearings` | `LegalHearingsPage.tsx` | hearing calendar |
| `/legal/profile`, `/legal/settings` | `LegalProfilePage.tsx`, `LegalSettingsPage.tsx` | parity with other groups |

Guard: `LegalRoute` — copy of the `ComplianceOfficerRoute` pattern testing `LEGAL_OFFICER`/`COMPLIANCE_OFFICER`/`ADMIN`.

> **Open Question 2:** `LEGAL_OFFICER` exists only in the V4 seed vocabulary, which is unreachable (P0-3). Until the vocabularies are reconciled, the legal group must gate on `COMPLIANCE_OFFICER` + `ADMIN`, or `BootstrapAdmin` must be extended with a real `LEGAL_OFFICER` user. This needs a decision before Module E ships.

## 9.6 Module F — Contract Management (Compliance group)

| Route | File | Purpose |
|---|---|---|
| `/compliance/contracts` | *(existing `CoContractsPage`)* | **extend** — full CRUD, not read-only |
| `/compliance/contracts/:id` | `CoContractDetailPage.tsx` | detail, clauses, AI risk |
| `/compliance/contracts/:id/approvals` | `CoContractApprovalsPage.tsx` | approval chain |
| `/compliance/contracts/:id/renewals` | `CoContractRenewalsPage.tsx` | renewal history |
| `/compliance/contracts/expiring` | `CoExpiringContractsPage.tsx` | expiry dashboard |
| `/compliance/vendors` | `CoVendorsPage.tsx` | vendor master |

## 9.7 Module A — Reservation gap closure (existing groups)

| Route | File | Purpose |
|---|---|---|
| `/facilities-officer/reservations/:id` | `FoReservationDetailPage.tsx` | detail, QR, check-in/out |
| `/facilities-manager/blackout-dates` | `FmBlackoutDatesPage.tsx` | closures |

Plus in-place enhancement of `FoReservationsPage.tsx` for recurring bookings — **and removal of its hardcoded 68% occupancy (`:120`) and static calendar (`:593-634`)**, which currently misrepresent live state (D5.5).

## 9.8 Admin (SysAdmin group)

| Route | File | Purpose |
|---|---|---|
| `/admin/ai-invocations` | `AiInvocationsPage.tsx` | persisted AI audit trail |
| `/admin/workflows` | `WorkflowExecutionsPage.tsx` | n8n execution log |

Plus correcting `AiServicesPage.tsx`'s hardcoded charts and `AddAiProviderModal.tsx:176-182`'s false success report (D5.5).

## 9.9 Page totals

| Module | New pages | Extended existing | New route group |
|---|---|---|---|
| A Reservation | 2 | 1 | — |
| B Visitor | 4 | 1 | — |
| C Document | 6 | 1 | — |
| D Compliance | 5 | 0 | — |
| E Legal | 8 | 0 | **yes** |
| F Contract | 5 | 1 | — |
| Admin | 2 | 2 | — |
| **Total** | **32** | **6** | **1** |

---

# DELIVERABLE 10 — REQUIRED BACKEND SERVICES `[ASSUMED design on VERIFIED conventions]`

Five of the six §6 modules currently have **no service layer** (D2.2). Every service below is `@Service` + `@RequiredArgsConstructor`, holds the `@Transactional` boundary, writes audit events via the existing `AuditService`, and returns DTOs.

## 10.1 Module B — `module/visitor/service/`

| Service | Responsibility |
|---|---|
| `VisitorService` | visitor CRUD; blacklist check on registration and check-in; wraps the three existing controller-inline operations |
| `VisitorPassService` | pass issuance (ZXing QR generation), validation, expiry, revocation; enforces `valid_from`/`valid_until` |
| `VisitorCheckinService` | check-in/out recording into `visitor_checkins`; prevents double check-in; resolves the active pass |
| `VisitorBlacklistService` | watchlist CRUD; single `isBlacklisted(...)` used by both registration and check-in |

## 10.2 Module C — `module/documents/service/`

| Service | Responsibility |
|---|---|
| `DocumentService` | document CRUD; permission enforcement on every read/write; soft delete |
| `DocumentVersionService` | version upload, checksum, `is_current` flip, restore; **guarantees `documents.version_number` finally means something** |
| `DocumentCategoryService` | hierarchical tree CRUD; maintains `path`/`depth`; cycle prevention |
| `DocumentFolderService` | activates the unused `folders` table; tree build; move |
| `DocumentPermissionService` | ACL grant/revoke; `canAccess(user, document, permission)` used by `DocumentService` |
| `SmartSearchService` | §7.4 — embedding-backed candidate ranking with literal-search fallback |

## 10.3 Module D — `module/compliance/service/` (extends existing `ComplianceService`)

| Service | Responsibility |
|---|---|
| `RetentionScheduleService` | apply a policy to an entity; compute `disposal_due_date`; nightly re-evaluation; **must consult `LegalHoldService` before any DUE transition** |
| `LegalHoldService` | issue/release holds; `isOnHold(entityType, entityId)` — the disposal veto |
| `DisposalCertificateService` | certificate generation, numbering, checksum |
| `ComplianceReportService` | report generation and artefact storage |
| `ComplianceCommandCenterService` | **§7.2 flagship aggregate** — composes retention-due, expiring contracts, open holds, unacknowledged alerts, AI-flagged risks into one ranked feed |

## 10.4 Module E — `module/legal/service/`

| Service | Responsibility |
|---|---|
| `LegalCaseService` | case CRUD; status transitions |
| `CaseEventService` | timeline append (append-only — events are not edited) |
| `HearingService` | scheduling, conflict detection, outcome recording |
| `CaseDocumentService` | attach/detach documents; **auto-creates a `legal_holds` entry when a document is attached as EVIDENCE** |
| `CaseAssignmentService` | counsel assignment |

## 10.5 Module F — `module/contracts/service/`

| Service | Responsibility |
|---|---|
| `ContractService` | full CRUD (currently absent); DTO boundary; wraps existing create/list |
| `ContractApprovalService` | sequential approval chain; advances to the next approver |
| `ContractRenewalService` | renewal initiation and decision; extends `end_date` on approval |
| `ContractMilestoneService` | obligation tracking; overdue detection |
| `VendorService` | vendor master CRUD; contract linkage |
| `ContractExpiryService` | `@Scheduled` — **finally consumes the orphaned `app.scheduler.contract-expiry-cron`**; feeds §8 workflow 1 |

## 10.6 Module A — `module/facilities/service/` (extends existing)

| Service | Responsibility |
|---|---|
| `ReservationCheckinService` | QR issuance + check-in/out over the existing unused columns |
| `RecurringReservationService` | expands a recurrence into child reservations via `parent_reservation_id` |
| `BlackoutDateService` | closure management; consulted by `RoomAvailabilityService` |

## 10.7 Cross-cutting services

| Service | Responsibility |
|---|---|
| `AiInvocationAuditService` | **§7.5** — persists every AI call to `ai_invocation_logs`; replaces `AiStateManagementService`'s in-memory log |
| `AiDecisionService` | §7.5 — records AI recommendation vs. human decision; **blocks AI-only action on legal/compliance/retention entities** |
| `AiProviderService` | persists the provider registry and module toggles currently held in `CopyOnWriteArrayList` |
| `WorkflowCallbackService` | validates the n8n shared secret; records `workflow_executions` |
| `RetentionSchedulerJob` | `@Scheduled` — **consumes the orphaned `app.scheduler.retention-check-cron`** |
| `VisitorCleanupJob` | `@Scheduled` — **consumes the orphaned `app.scheduler.visitor-cleanup-cron`**; expires stale passes |

## 10.8 Service totals

| Module | New services | Notes |
|---|---|---|
| A Reservation | 3 | extends an existing service layer |
| B Visitor | 4 | **introduces** a layer where none exists |
| C Document | 6 | **introduces** |
| D Compliance | 5 | extends `ComplianceService` |
| E Legal | 5 | **introduces** |
| F Contract | 6 | **introduces** |
| Cross-cutting | 6 | 3 of them activate orphaned cron config |
| **Total** | **35** | |

---

# DELIVERABLE 11 — REQUIRED SUPABASE CHANGES `[VERIFIED]`

## 11.1 Position

D2.4 established that Flyway is the schema authority and Supabase's `00001_create_all_tables.sql` is a divergent second schema describing different columns for identically-named tables. Under R7 nothing is dropped. Therefore:

**Supabase's role is narrowed to Realtime transport only.** No business table is read or written through the anon key. The Spring Boot backend remains the sole writer of business data, and it reaches Postgres through JDBC, not PostgREST.

## 11.2 Change 1 — stop Hibernate issuing DDL to the cloud database

The `supabase` profile currently runs `flyway.enabled: false` + `ddl-auto: update`, which means **the JVM alters the shared Supabase database at every startup, with no migration record**. This is the most direct violation of R7 in the repository, and it is in configuration rather than in a migration file.

**Change:** after `V6` lands (which removes the reason the workaround exists), set the `supabase` and `local` profiles to `flyway.enabled: true` + `ddl-auto: validate`, matching the default profile.

This is a configuration change to `application.yml`, additive in effect, and it is the single highest-value Supabase-related action in the plan.

## 11.3 Change 2 — RLS policy pattern for new tables (§9)

§9 requires RLS with an explicit policy decision on every new table. **There is no existing pattern to copy** — Flyway tables have no RLS, and the Supabase tables use `using (true) with check (true)`, which grants everything.

Because the backend connects as the Postgres role (not `anon`/`authenticated`), the correct decision for all 34 new business tables is **RLS enabled with no anon/authenticated policy** — deny-by-default at the PostgREST boundary, with all legitimate access flowing through the authenticated Spring API where `@PreAuthorize` already applies. This is one line per table and is genuinely restrictive, rather than the theatrical `using (true)`.

Shipped as `V14__enable_rls_on_new_tables.sql`:

```sql
ALTER TABLE visitor_passes ENABLE ROW LEVEL SECURITY;
-- no policy created for anon/authenticated: PostgREST access denied by default.
-- Backend access is unaffected: it connects as the table owner, which bypasses RLS.
```

…repeated for all 34 tables from D7.

> **Verification requirement:** confirm the application's database role is in fact the table owner (or `BYPASSRLS`) on the target deployment before this ships. If the app connects as a restricted role, enabling RLS without a policy would lock the application out of its own tables. This must be tested on a non-production database first. **Open Question 4.**

## 11.4 Change 3 — Realtime channel additions

Extend `supabase/realtime.sql` (additively) for the two new broadcast needs identified in D2.6, keeping business data out of the anon path by publishing **notification envelopes, not records**:

| Table | Payload |
|---|---|
| `compliance_alert_events` | `{alert_id, severity, module, created_at}` — no document content, no case detail |
| `contract_expiry_events` | `{contract_id, days_remaining, severity}` — no contract value, no counterparty |

Both get `replica identity full` and are added to the `supabase_realtime` publication using the existing `do $$ … pg_publication_tables` guard pattern already in `realtime.sql:58-77`.

> **Note:** `realtime.sql:16-19` documents that its tables intentionally run with RLS disabled so the anon key works. For these two new envelope tables that is acceptable **precisely because they carry no business content** — an ID and a severity. This is a deliberate, documented trade-off, not an oversight.

## 11.5 Change 4 — deprecate, do not delete, the divergent schema

`supabase/migrations/00001_create_all_tables.sql` is left byte-for-byte intact (R7). A header comment is added marking it deprecated and pointing to the Flyway migrations as authoritative, and a `supabase/README.md` records the boundary:

- Flyway `backend/src/main/resources/db/migration/` — **authoritative business schema**
- `supabase/realtime.sql` — **realtime transport only**
- `supabase/migrations/00001_create_all_tables.sql` — **deprecated; do not extend**

## 11.6 What is explicitly NOT changed

| Item | Why |
|---|---|
| Existing Supabase tables | R7 — no drops, no restructuring |
| Existing permissive policies on those 13 tables | changing them could break the running frontend; they are deprecated instead |
| `user_activity_events`, `online_users` | working as designed |
| The anon key's existing grants | out of scope for a code change; covered by the credential-rotation item |

---

# DELIVERABLE 12 — REQUIRED AI SERVICES `[VERIFIED baseline / ASSUMED design]`

## 12.1 Honest baseline

| Component | Reality |
|---|---|
| `DocumentClassificationAiService` | keyword `if/else`, logged as "AI Llama 3.3 model engine" |
| `ContractAnalyticsAiService` | same deterministic-heuristic shape |
| `ReservationLlmGateway` | **the only real LLM call** — OpenAI-compatible, disabled by `PLACEHOLDER_KEY = "sk-proj-default"`, heuristic fallback on any failure |
| `OcrService` | real (Tess4J/Tika) |
| `AiStateManagementService` | in-memory only; lost on restart |
| `app.ai.*` | configured for Ollama; **read by no service** |

So there is a working *façade* and a working *degradation pattern*, and essentially no inference. The plan keeps the façade and the degradation contract, and puts real inference behind them.

## 12.2 Foundation — `AiGateway` (extends the `ReservationLlmGateway` pattern)

A single gateway all AI services call, generalising the existing one rather than adding a second client:

- Reads `app.ai.*` (Ollama base URL + model) **which is currently configured and unused**, with the OpenAI-compatible path retained as an alternate provider.
- Preserves the placeholder-key guard and heuristic fallback semantics exactly.
- Every call is wrapped by `AiInvocationAuditService` → one `ai_invocation_logs` row, including `status = FALLBACK` and `degraded = true` when the model is unreachable.
- Returns a result object carrying `{value, confidence, degraded, provider, model}` so callers and the UI can tell model output from heuristic output.

> **Open Question 6:** which provider is actually reachable in the target environment — the configured Ollama host, or an OpenAI-compatible endpoint with a real key? The repository configures one and calls the other. §7 cannot be implemented for real until this is answered; until then everything runs in documented fallback mode, which is a legitimate §7.5-compliant state.

## 12.3 §7.1 — Document classification

**Extends `DocumentClassificationAiService`, signature unchanged** (R9). Internals become: gateway call → structured category + confidence → **existing keyword heuristic as fallback**. Writes `documents.ai_predicted_category` and `confidence_score` as today, plus an `ai_invocation_logs` row.

Governance: classification is advisory. Below a confidence threshold the document is flagged for human review rather than auto-filed.

## 12.4 §7.2 — Compliance monitoring + **AI Compliance Command Center (flagship)**

`ComplianceCommandCenterService` (D10.3) composes a single ranked risk feed from data that already exists plus the new retention/hold tables:

| Signal | Source |
|---|---|
| Retention due / overdue | `retention_schedules.disposal_due_date` |
| Contracts expiring | `contracts.end_date`, `renewal_notice_date` |
| Open legal holds | `legal_holds` |
| Unacknowledged alerts | `compliance_alerts` |
| Documents lacking classification | `documents.ai_predicted_category IS NULL` |
| Low-confidence AI classifications | `documents.confidence_score < threshold` |
| Overdue contract milestones | `contract_milestones` |

The AI layer **ranks and narrates** this feed; it does not decide. Every item links to the underlying record and to the human action that resolves it.

**§7.5 hard rule, enforced in `AiDecisionService`:** no AI-only legal, compliance, or retention action. Disposal, hold release, and case resolution always require a recorded human decision in `ai_decisions`. The API has no code path that performs these from an AI result alone.

## 12.5 §7.3 — Contract analytics

**Extends `ContractAnalyticsAiService`, signature unchanged.** Gateway-backed clause extraction into the existing `contract_clauses` table, risk scoring into the existing `ai_assessed_risk_level` / `ai_risk_summary` columns, with the current heuristic as fallback. Renewal recommendations surface as suggestions on `contract_renewals` — never auto-renewal.

## 12.6 §7.4 — Smart search

`SmartSearchService` (D10.2), two-tier:

1. **Tier 1 — literal.** The existing `GET /v1/documents/search`, unchanged, always available.
2. **Tier 2 — semantic.** Chunk + embed documents into `document_embeddings` (D7.3) using the configured `nomic-embed-text`/768; rank candidates by similarity; merge with Tier 1 results.

If embeddings are unavailable — no `pgvector`, no reachable model — Tier 2 is skipped and the response is marked `degraded: true`. **The search box never returns an error because AI is down.** This depends on Open Question 3 (`pgvector` availability).

## 12.7 §7.5 — Governance rules, and how each is enforced

| Rule | Enforcement |
|---|---|
| Audit every AI call | `AiInvocationAuditService` writes `ai_invocation_logs` on **every** gateway invocation, including failures and fallbacks. Not optional, not in-memory |
| No AI-only legal/compliance/retention action | `AiDecisionService` requires a recorded human decision; no service method performs these actions from an AI result alone |
| Graceful degradation | Every AI service has a deterministic fallback (the current heuristics, retained rather than deleted). Degradation is reported in the response, not hidden |
| Transparency | Responses carry `{degraded, provider, model, confidence}` so the UI can distinguish model output from heuristic output — directly addressing the D5.5 fabrication problem |
| Persistence | `ai_providers` and `ai_module_settings` replace the `CopyOnWriteArrayList` state |

## 12.8 AI service totals

| Item | Count | Nature |
|---|---|---|
| `AiGateway` | 1 | new, generalises `ReservationLlmGateway` |
| Extended existing AI services | 2 | signatures unchanged (R9) |
| New AI services | 3 | `SmartSearchService`, `ComplianceCommandCenterService`, `AiDecisionService` |
| Governance services | 3 | audit, decision, provider persistence |
| New AI tables | 4 | `ai_invocation_logs`, `ai_providers`, `ai_module_settings`, `ai_decisions` |

---

# DELIVERABLE 13 — REQUIRED n8n WORKFLOWS `[VERIFIED absence / ASSUMED design]`

## 13.1 Baseline: nothing exists

Repository-wide search (excluding `node_modules`) returns **zero** occurrences of `n8n`, `webhook`, or workflow JSON. There is no n8n instance, no credential, no callback endpoint, no `docker-compose` entry.

**All five §8 workflows are greenfield.** §3's premise that there is an automation layer to extend is incorrect (see Phase 0 §0.1).

## 13.2 Integration contract (shared by all five)

Because n8n does not exist, the integration contract must be defined before any workflow:

| Concern | Decision |
|---|---|
| Direction | n8n **pulls** from the API on a schedule; it does not read the database directly |
| Auth (n8n → API) | dedicated service account with a scoped role, standard JWT — reuses the existing auth chain (R8) |
| Auth (API ← n8n callback) | shared-secret header on `POST /v1/workflows/{name}/callback`, allowlisted in `SecurityConfig` (D8.8) |
| Audit | every execution writes `workflow_executions` (D7.8) |
| Idempotency | every workflow is safe to re-run; notification dispatch is deduplicated by `(entity_id, notification_type, date)` |
| Failure | a failed workflow records `status = FAILED` with `error_message`; it never leaves a half-completed state |
| Degradation | if n8n is down, nothing in the core system breaks — these are **notification** workflows, not transactional ones |

> **Open Question 7:** is an n8n instance actually available to this project (self-hosted, cloud, or not at all)? If not, every workflow below can be implemented as a Spring `@Scheduled` job instead — the repository already has `@EnableScheduling` and three orphaned cron expressions waiting for exactly this. **That would be simpler, would need no new infrastructure, and would satisfy the same functional requirement.** The n8n design is provided because §8 requires it; the scheduled-job alternative is noted as the lower-risk path.

## 13.3 Workflow 1 — Contract expiry notification

| | |
|---|---|
| Trigger | Cron, daily 08:00 — matches the orphaned `app.scheduler.contract-expiry-cron: "0 0 8 * * ?"` |
| Reads | `GET /v1/contracts/expiring?days=90,60,30,7` |
| Logic | for each contract, resolve owner and compliance officer; dedupe against prior notifications for the same threshold |
| Actions | email owner + compliance officer; `POST` a `compliance_alerts` row; push a `contract_expiry_events` realtime envelope |
| Escalation | at 7 days, escalate to `FACILITIES_MANAGER`/`ADMIN` |
| Callback | `POST /v1/workflows/contract-expiry/callback` |
| Depends on | D7.6 (`contract_renewals`), D8.5 (`/contracts/expiring`), D10.5 (`ContractExpiryService`) |

## 13.4 Workflow 2 — Driver accreditation expiry

> **Grounding note (R10):** §8 names this workflow, but the repository contains **no driver, accreditation, or licence table, entity, or endpoint** — verified by search. Nothing here can be built by extension; it requires a new domain that no other deliverable covers.

| | |
|---|---|
| Prerequisite | a `driver_accreditations` table + endpoints, which are **not in D7/D8** because no baseline exists to extend |
| Trigger | Cron, daily |
| Reads | `GET /v1/drivers/accreditations/expiring?days=60,30,14,7` *(does not exist yet)* |
| Actions | notify driver and fleet administrator; raise a compliance alert; flag the driver as non-compliant at expiry |
| Callback | `POST /v1/workflows/driver-accreditation/callback` |

**Open Question 8:** is driver/fleet accreditation genuinely in scope for this system? If yes it is a seventh module requiring its own schema and endpoints, and should be scoped explicitly rather than smuggled in as a workflow. If no, §8 workflow 2 should be struck. **This is not something to invent (R10).**

## 13.5 Workflow 3 — Vehicle compliance monitoring

> **Same grounding problem.** No vehicle, fleet, or inspection table exists anywhere in the repository.

| | |
|---|---|
| Prerequisite | a `vehicles` + `vehicle_inspections` domain, not present and not in D7 |
| Trigger | Cron, daily |
| Reads | `GET /v1/vehicles/compliance/due` *(does not exist yet)* |
| Actions | notify fleet administrator; raise alerts for overdue inspections/registrations/insurance |
| Callback | `POST /v1/workflows/vehicle-compliance/callback` |

**Open Question 8 (continued):** workflows 2 and 3 together describe a fleet-management module that the "Facilities & Administrative Management System" does not currently contain. Both need a scope decision before any work begins.

## 13.6 Workflow 4 — Compliance alert dispatch

| | |
|---|---|
| Trigger | Cron every 15 min, plus optional webhook from `POST /v1/workflows/compliance-alerts/trigger` |
| Reads | `GET /v1/compliance/alerts?status=OPEN` and `GET /v1/compliance/retention-schedules/due` |
| Logic | route by severity — CRITICAL immediate, HIGH hourly digest, MEDIUM/LOW daily digest |
| Actions | email compliance officers; push `compliance_alert_events` envelope; escalate unacknowledged CRITICAL alerts after 4 hours |
| Callback | `POST /v1/workflows/compliance-alerts/callback` |
| Depends on | D7.1 (`compliance_alerts` — **currently has no table at all**, P0-1), D7.4 (`retention_schedules`), D10.3 |

**This is the workflow with the strongest existing foundation** — 18 compliance endpoints already exist. It is also blocked until `V6` creates the `compliance_alerts` table.

## 13.7 Workflow 5 — Document review reminders

| | |
|---|---|
| Trigger | Cron, daily 09:00 |
| Reads | `GET /v1/compliance/retention-schedules/due?days=30` and documents pending approval |
| Logic | dedupe per document per cycle; **skip anything under an active legal hold** |
| Actions | remind document owners; remind compliance officers of pending approvals; escalate documents overdue > 14 days |
| Callback | `POST /v1/workflows/document-review/callback` |
| Depends on | D7.4 (`retention_schedules`, `legal_holds`), D10.3 |

## 13.8 Summary

| # | Workflow | Foundation in repo | Blocking dependency |
|---|---|---|---|
| 1 | Contract expiry | Partial — `contracts` table + `end_date`, `renewal_notice_date` | `V11`, `/contracts/expiring` |
| 2 | Driver accreditation | **None — domain does not exist** | **Scope decision (OQ 8)** |
| 3 | Vehicle compliance | **None — domain does not exist** | **Scope decision (OQ 8)** |
| 4 | Compliance alerts | Good — 18 endpoints exist | `V6` (`compliance_alerts` has no table) |
| 5 | Document review | Partial — documents + retention policies exist | `V9` (`retention_schedules`) |

Three of five are buildable on the existing domain. Two describe a fleet-management capability that does not exist in this system and must not be invented (R10).

---

*End of Phase 2. Deliverables 14–16 continue in `TNVS-Phase3-Deliverables.md`.*
