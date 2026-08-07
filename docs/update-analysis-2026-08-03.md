# Update Analysis — TNVS-Team-8
**Date:** 2026-08-03  
**Commits merged:** `9e1c1f4` → `af52f0b` (3 commits, 53 files, +9 259 lines)

---

## 1. Summary of Changes

Three new role portals were added end-to-end: **Legal Officer**, **Procurement / Contract Officer**, and **Employee**. Each portal ships a backend module (controller + service + domain + repositories), a frontend layout/dashboard/pages bundle, an API service layer, and route guards wired into the app router.

### 1.1 Backend — New Modules

| Module | Controller | Service (lines) | New Domain Objects |
|---|---|---|---|
| `employee` | `EmployeeController` | `EmployeeService` (633) | `EmployeeRequest`, `EmployeeNotification`, `NotificationType`, `RequestStatus`, `RequestType` |
| `legal` | `LegalOfficerController` | `LegalService` (490) | `LegalNotice`, `CaseType`, `NoticeSeverity`, `NoticeStatus`, `NoticeType` |
| `procurement` | `ProcurementOfficerController` | `ProcurementService` (589) | `Vendor`, `VendorObligation`, `ProcurementNotice`, `VendorCategory`, `VendorStatus`, `ObligationStatus`, `NoticeSeverity`, `NoticeStatus`, `NoticeType` |

### 1.2 Backend — Existing Module Changes

| File | Change |
|---|---|
| `Contract.java` | Added nullable `vendorId` (UUID) — intentionally loose reference, no JPA FK |
| `ContractRepository` | Added `findByVendorId`, `countByVendorId` |
| `DocumentRepository` | Added `findByCreatedByAndDeletedFalseOrderByCreatedAtDesc` |
| `LegalCase.java` | Added `caseType` (enum), `closedDate`, `resolutionNotes` |
| `LegalCaseRepository` | Added `findByStatusOrderByCreatedAtDesc`, `findAllByOrderByCreatedAtDesc` |
| `SecurityConfig.java` | Added role guards: `/v1/legal/**` → `LEGAL_OFFICER`, `/v1/procurement/**` → `CONTRACT_OFFICER`, `/v1/employee/**` → `EMPLOYEE` |
| `BootstrapAdmin.java` | Expanded to 426 lines — bootstraps users/roles for all new portals |

### 1.3 Frontend — New Files

| Area | Files Added | Approx. Lines |
|---|---|---|
| Legal portal | `LegalOfficerLayout`, `LegalOfficerDashboard`, `LegalOfficerPages` | ~1 636 |
| Procurement portal | `ProcurementOfficerLayout`, `ProcurementOfficerDashboard`, `ProcurementOfficerPages` | ~1 938 |
| Employee portal | `EmployeeLayout`, `EmployeeDashboard`, `EmployeePages` | ~1 228 |
| API services | `legalService.ts`, `procurementService.ts`, `employeeService.ts` | ~280 |

### 1.4 Frontend — Modified Files

- **`App.tsx`** — 3 new route guard components (`LegalOfficerRoute`, `ContractOfficerRoute`, `EmployeeRoute`) and their nested route trees under `/legal`, `/procurement`, `/employee`.
- **`authStore.ts`** — `getDashboardPath` extended with 3 new role → path mappings.
- **`LoginPage.tsx`** — 3 quick-login buttons added with hardcoded credentials (see Issues below).

---

## 2. Issues Found

### 🔴 Critical

#### 2.1 Database migration not updated
`ddl-auto` is set to `validate` in the production profile. The migration file `supabase/migrations/00001_create_all_tables.sql` was **not touched** by this update. The following tables and columns are required by the new JPA entities but do not exist in the migration:

**Missing tables:**
- `employee_requests`
- `employee_notifications`
- `vendors`
- `vendor_obligations`
- `procurement_notices`
- `legal_notices`

**Missing columns on existing tables:**
- `contracts.vendor_id` (UUID, nullable)
- `legal_cases.case_type` (VARCHAR)
- `legal_cases.closed_date` (DATE)
- `legal_cases.resolution_notes` (TEXT)

The backend will **fail to start** against the production database until a new migration is added.

#### 2.2 Hardcoded credentials in LoginPage.tsx
`frontend/src/components/auth/LoginPage.tsx` contains plaintext credentials for all three new roles:

```
legal@photonicomega.com / Legal2026!
contract@photonicomega.com / Contract2026!
employee@photonicomega.com / Employee2026!
```

These are visible in the browser source and in the git history. Even if intended only for development, they are now on the `main` branch and will be deployed. The quick-login buttons should be removed or gated behind a `VITE_DEV_MODE` environment flag before any production deployment.

---

### 🟡 Medium

#### 2.3 Duplicate enum types across modules
`NoticeSeverity`, `NoticeStatus`, and `NoticeType` are defined independently in both `module/legal/domain/` and `module/procurement/domain/`. They appear to carry the same values. This creates maintenance risk — a change to one copy will not propagate to the other.

**Recommendation:** Extract shared enums to a `module/shared/domain/` package and import from there.

#### 2.4 Role name inconsistency between frontend and backend
The backend security config registers the role as `CONTRACT_OFFICER` (`hasRole("CONTRACT_OFFICER")`). The frontend route guard checks for both `CONTRACT_OFFICER` and `ROLE_CONTRACT_OFFICER`. The `authStore.ts` dashboard path also checks both variants. This dual-check pattern works but is fragile — if the backend ever normalises to Spring's `ROLE_` prefix convention, the frontend will silently fall through to the wrong path.

**Recommendation:** Standardise on one convention (preferably without the `ROLE_` prefix in business logic) and remove the dual-check.

#### 2.5 No pagination on list endpoints
The new repositories return `List<T>` for all collection queries (e.g. `findAllByOrderByCreatedAtDesc()`, `findByVendorId()`). For tables that will grow (vendors, legal cases, procurement notices), this will cause full-table loads. Spring Data's `Pageable` support should be added before these tables accumulate significant data.

---

### 🟢 Minor / Enhancement Opportunities

#### 2.6 Vendor–Contract link is one-directional
`Contract.vendorId` stores a UUID but there is no corresponding `contractIds` or navigation on `Vendor`. Queries that start from a vendor and need its contracts must go through `ContractRepository.findByVendorId`. This is fine architecturally (the comment in the code explains the intentional loose coupling), but the `ProcurementService` should document this pattern so future developers do not add a JPA `@ManyToOne` that would re-introduce the cross-module dependency.

#### 2.7 Employee portal scope is narrow
The employee portal currently covers reservations, visitors, documents, requests, and notifications. Common self-service features that are likely to be requested next:
- View own facility bookings / room reservations
- Submit maintenance requests
- View payslips or HR documents (if in scope)
- Approval workflow status tracking for submitted requests

#### 2.8 Legal portal missing case timeline / history view
`LegalCase` now has `closedDate` and `resolutionNotes`, but the frontend `LegalOfficerPages` (1 186 lines) was added before these fields existed in the domain. Verify that the case detail view surfaces these new fields.

#### 2.9 No audit trail for Vendor CRUD
The existing modules (facilities, compliance) write to `security_logs` / audit tables on sensitive mutations. The new `ProcurementService` manages vendor onboarding and obligation tracking but there is no visible audit-log write in the service. Vendor data changes should be audited consistently with the rest of the system.

---

## 3. Recommended Next Steps (Priority Order)

| # | Action | Priority |
|---|---|---|
| 1 | Write and apply a new Supabase migration covering all missing tables and columns listed in §2.1 | 🔴 Blocker |
| 2 | Remove or env-gate the hardcoded quick-login credentials in `LoginPage.tsx` | 🔴 Before deploy |
| 3 | Extract `NoticeSeverity`, `NoticeStatus`, `NoticeType` to a shared module | 🟡 Soon |
| 4 | Add `Pageable` to `findAll*` and `findBy*` repository methods in all three new modules | 🟡 Soon |
| 5 | Standardise role name convention (drop dual-check in frontend) | 🟡 Soon |
| 6 | Add audit-log writes to `ProcurementService` for vendor create/update/delete | 🟡 Soon |
| 7 | Verify `LegalOfficerPages` case detail view renders `caseType`, `closedDate`, `resolutionNotes` | 🟢 QA |
| 8 | Plan employee self-service feature expansion (see §2.7) | 🟢 Backlog |

---

*Generated from diff `9e1c1f4..af52f0b` on branch `main` of `katsu-goi/TNVS-Team-8`.*
