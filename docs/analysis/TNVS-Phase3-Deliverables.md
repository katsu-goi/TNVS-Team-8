# TNVS — Phase 3 Deliverables (D14–D16) + Implementation Proposal

> **Companion documents:** `TNVS-Phase0-Report.md` · `TNVS-Phase1-Deliverables.md` (D1–D6) · `TNVS-Phase2-Deliverables.md` (D7–D13)
> **Standing constraints:** R1–R11 · §10 GitHub protocol · §12 quality gates · §13 safe-refactoring guardrails · §14 Definition of Done

---

# DELIVERABLE 14 — DEVELOPMENT ROADMAP `[ASSUMED plan on VERIFIED findings]`

## 14.1 Sequencing principle

Two rules drive the ordering:

1. **Nothing ships on a foundation that cannot start.** P0-1 (six entities with no table) means the default profile cannot boot. That is fixed first, before any feature work.
2. **Security gaps are closed before the surface area grows.** P0-2 (no endpoint RBAC on six route families) and P0-4 (inert `ProtectedRoute`) get worse with every endpoint and page added. They are fixed second, not last.

Feature modules then land in dependency order, cheapest-foundation-first.

## 14.2 Priority tiers

### P0 — Foundation repair (blocking everything)

| PR | Scope | Files |
|---|---|---|
| **PR-1** | `V6__backfill_missing_module_tables.sql` — the 6 missing tables, column-for-column against their entities. Then re-enable Flyway + `ddl-auto: validate` on `local` and `supabase` profiles | 1 `[NEW]` migration, 1 `[MODIFIED]` `application.yml` |
| **PR-2** | Fix `ProtectedRoute` (P0-4) using the `FacilitiesRoute` pattern; rehydrate `user` in `authStore` so guards survive refresh | 2 `[MODIFIED]` |
| **PR-3** | `@PreAuthorize` on all existing unguarded endpoints — `/v1/contracts`, `/v1/documents`, `/v1/legal-cases`, `/v1/visitors`, `/v1/facilities`, **`/v1/ai/**`** (P0-2). No new endpoints, no behaviour change beyond denial of unauthorised access | ~8 `[MODIFIED]` controllers |

**Exit criteria:** app starts on the default profile; `mvn -q verify` passes; an authenticated non-admin user receives 403 on contracts/documents/legal/visitors/AI; a page refresh on a deep link keeps the user in place.

> PR-1 and PR-3 are independently valuable and independently reviewable. PR-3 will break any client that was relying on the absent checks — that is the point, and it is better surfaced in a small dedicated PR than inside a feature branch.

### P1 — Governance foundation

| PR | Scope |
|---|---|
| **PR-4** | `V13__ai_and_workflow_audit_schema.sql` + `AiInvocationAuditService` + `AiProviderService` — persist AI state and audit every call (§7.5). Replaces the in-memory `AiStateManagementService` store |
| **PR-5** | `AiGateway` generalising `ReservationLlmGateway`; wire `app.ai.*` (currently configured and unused); `{degraded, provider, model, confidence}` on every AI response |

**Exit criteria:** every AI call produces an `ai_invocation_logs` row that survives restart; provider registry survives restart; AI responses declare whether they are model output or heuristic fallback.

### P2 — Contract Management (Module F)

Chosen before B/C/E because `contracts`, `contract_clauses` and the AI analytics façade already exist, and the CRUD hole (`no GET/{id}`, `no PUT`) is the most obviously broken thing a user can hit.

| PR | Scope |
|---|---|
| **PR-6** | `V11__contract_management_schema.sql` — `vendors`, `contract_approvals`, `contract_renewals`, `contract_milestones`, `contracts.vendor_id` |
| **PR-7** | `ContractService` + full CRUD endpoints + DTO boundary (entity currently exposed as request body) |
| **PR-8** | Approvals + renewals + milestones + `VendorService`; `ContractExpiryService` consuming the orphaned `contract-expiry-cron` |
| **PR-9** | Frontend: contract detail, approvals, renewals, expiring, vendors pages |

### P3 — Retention & Compliance + Command Center (Module D)

| PR | Scope |
|---|---|
| **PR-10** | `V9__retention_compliance_schema.sql` — `retention_schedules`, `legal_holds`, `disposal_certificates`, `compliance_reports` |
| **PR-11** | `RetentionScheduleService` + `LegalHoldService` — including the **legal-hold-beats-retention** veto, enforced in the service, not the UI |
| **PR-12** | `ComplianceCommandCenterService` + `/v1/compliance/command-center` (§7.2 flagship) |
| **PR-13** | Frontend: **AI Compliance Command Center**, retention schedules, legal holds, certificates, reports |
| **PR-14** | `RetentionSchedulerJob` consuming the orphaned `retention-check-cron` |

### P4 — Document Management (Module C)

| PR | Scope |
|---|---|
| **PR-15** | `V8__document_management_schema.sql` — versions, hierarchical categories, links, permissions, embeddings |
| **PR-16** | `DocumentVersionService` — **makes `documents.version_number` meaningful for the first time** |
| **PR-17** | `DocumentCategoryService` + `DocumentFolderService` (activates the unused `folders` table) |
| **PR-18** | `DocumentPermissionService` — per-document ACL enforced in `DocumentService` |
| **PR-19** | `SmartSearchService` (§7.4) with literal-search fallback |
| **PR-20** | Frontend: document detail, versions timeline, categories admin, permissions, smart search |

### P5 — Visitor Management (Module B)

| PR | Scope |
|---|---|
| **PR-21** | `V7__visitor_management_schema.sql` — `visitor_passes`, `visitor_checkins`, `visitor_blacklist` |
| **PR-22** | `VisitorPassService` (ZXing QR — already on the classpath) + `VisitorCheckinService` + blacklist enforcement |
| **PR-23** | `VisitorCleanupJob` consuming the orphaned `visitor-cleanup-cron` |
| **PR-24** | Frontend: visitor detail, passes (`QrDisplay`), scan, blacklist |

### P6 — Legal Management (Module E)

Last among the modules because it needs a **new route group and a role-vocabulary decision** (Open Question 2), and has the least existing foundation.

| PR | Scope |
|---|---|
| **PR-25** | `V10__legal_management_schema.sql` — events, hearings, case documents, resolutions, assignments |
| **PR-26** | `LegalCaseService` + all 16 endpoints on the currently-empty `LegalCaseController` |
| **PR-27** | `CaseDocumentService` — auto-creates a legal hold when a document is attached as EVIDENCE |
| **PR-28** | Frontend: new `/legal` route group + 8 pages + `LegalRoute` guard |

### P7 — Reservation gaps, RLS, workflows

| PR | Scope |
|---|---|
| **PR-29** | `V12__reservation_enhancements_schema.sql` + check-in/out + recurring + blackout endpoints (all over **existing unused columns**) |
| **PR-30** | Frontend: reservation detail, blackout dates; **remove the hardcoded 68% occupancy and static calendar** |
| **PR-31** | `V14__enable_rls_on_new_tables.sql` (§9) — **must be validated on a non-production database first** (Open Question 4) |
| **PR-32** | `WorkflowCallbackController` + `workflow_executions` + `SecurityConfig` allowlist entry |
| **PR-33** | Workflows 1, 4, 5 (the three with a real foundation) |
| **PR-34** | Supabase boundary documentation + realtime envelope tables (D11.4, D11.5) |

**Workflows 2 and 3 are not scheduled.** They require a fleet-management domain that does not exist in this repository. Scheduling them would mean inventing a module (R10 violation). They are held pending Open Question 8.

## 14.3 Parallel track — refactoring (D16)

Runs alongside, never blocking:

| PR | Scope |
|---|---|
| **PR-R1** | ESLint config + fix the broken `lint` script; `mvn` build plugin config |
| **PR-R2** | `components/ui/` primitive extraction (D6.3) — additive, no page migrated |
| **PR-R3** | `RoleLayout` extraction; migrate the 3 sibling layouts (`AppLayout` last or not at all) |
| **PR-R4** | Test scaffolding — `backend/src/test` does not exist today |
| **PR-R5** | `.github/workflows/ci.yml` — build + lint + test gates (§10) |
| **PR-R6** | Remove fabricated demo data (D5.5): `authService` demo-JWT fallback, `AddAiProviderModal` false success, hardcoded charts and status pills |
| **PR-R7** | Delete dead code: `frontend/unused_security/`, 0-byte `lib/supabaseClient.ts`, orphan `com.photonicomega.security.**` |

## 14.4 Dependency graph

```
PR-1 (V6) ──┬─► PR-4/5 (AI governance) ──► all AI-touching work
            ├─► PR-6..9   (F Contract)  ──┐
            ├─► PR-10..14 (D Compliance) ─┼─► PR-33 (workflows 1,4,5)
            ├─► PR-15..20 (C Document)  ──┤
            ├─► PR-21..24 (B Visitor)     │
            └─► PR-25..28 (E Legal) ──────┘
PR-2, PR-3 (security) ──► every new endpoint and page
PR-31 (RLS) ──► after all schema PRs land
```

`PR-1`, `PR-2` and `PR-3` gate everything. After that, the five module tracks are independent and can be worked in parallel by different contributors.

## 14.5 Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `V6` column mismatch still fails `validate` | **High** | Column-by-column diff against each entity; test on a scratch database before merge |
| PR-31 RLS locks the app out of its own tables | **High** | Verify the app's DB role is table owner / `BYPASSRLS`; non-production test first (OQ 4) |
| PR-3 breaks a client that relied on absent checks | Medium | Small isolated PR; roles chosen from the vocabulary the frontend already tests |
| Role vocabulary split (P0-3) blocks Module E | Medium | Decide OQ 2 before P6; interim gate on `COMPLIANCE_OFFICER` + `ADMIN` |
| No AI provider reachable | Medium | Everything runs in documented fallback mode — a legitimate §7.5 state, not a blocker |
| `pgvector` unavailable | Medium | `TEXT` vector column + JVM-side ranking; smart search degrades to literal (OQ 3) |
| n8n unavailable | Low | Spring `@Scheduled` alternative already supported by `@EnableScheduling` + 3 orphaned crons (OQ 7) |
| Zero test coverage masks regressions | **High** | PR-R4/R5 early in the parallel track; §14 DoD requires tests per module |
| Single-contributor history, no PR norms | Medium | PR-R5 establishes CI gates; §10 protocol adopted from PR-1 onward |

---

# DELIVERABLE 15 — SPRINT BREAKDOWN `[ASSUMED plan]`

Twelve sprints (S1–S12) per §11. Two-week sprints assumed. Each sprint ends with a merged PR set, a green build, and a demonstrable increment.

| Sprint | Theme | PRs | Deliverable at sprint end |
|---|---|---|---|
| **S1** | **Foundation repair** | PR-1, PR-2, PR-3, PR-R1 | App boots on default profile. Unauthorised access returns 403 across all six previously-open route families. Deep links survive refresh. ESLint runs. |
| **S2** | **Quality gates + AI governance schema** | PR-R4, PR-R5, PR-4 | CI runs build + lint + test on every PR. AI calls audited to a table that survives restart. |
| **S3** | **AI gateway + UI primitives** | PR-5, PR-R2 | Real gateway wired to configured providers with honest degradation reporting. `components/ui/` available for all new pages. |
| **S4** | **Contract schema + CRUD** | PR-6, PR-7 | Contracts can be read individually, updated and deleted — the current CRUD hole closed. DTO boundary replaces entity exposure. |
| **S5** | **Contract workflows** | PR-8, PR-9 | Approval chains, renewals, milestones, vendors — backend and UI. `contract-expiry-cron` finally consumed. |
| **S6** | **Retention schema + legal holds** | PR-10, PR-11 | Per-record retention clocks. Legal hold vetoes disposal, enforced in the service layer. |
| **S7** | **AI Compliance Command Center** | PR-12, PR-13 | **§7.2 flagship shipped** — single ranked risk feed, every item traceable to a record and a human action. |
| **S8** | **Retention automation + document schema** | PR-14, PR-15, PR-16 | `retention-check-cron` consumed. Document versioning real for the first time. |
| **S9** | **Document organisation + search** | PR-17, PR-18, PR-19, PR-20 | Folder tree activated, hierarchical categories, per-document ACL, smart search with literal fallback. |
| **S10** | **Visitor Management** | PR-21, PR-22, PR-23, PR-24 | QR pass issue/validate/revoke, visit history, blacklist enforcement. `visitor-cleanup-cron` consumed. |
| **S11** | **Legal Management** | PR-25, PR-26, PR-27, PR-28 | `/legal` route group live; the empty `LegalCaseController` becomes a working module; evidence attachment auto-holds. |
| **S12** | **Reservation gaps, RLS, workflows, cleanup** | PR-29..34, PR-R3, PR-R6, PR-R7 | Check-in/out and recurring reservations over existing columns. RLS on all new tables. Workflows 1/4/5 live. Fabricated data and dead code removed. |

## 15.1 Sprint notes

- **S1 is non-negotiable and must not be compressed.** Everything downstream assumes a bootable app and enforced authorisation.
- **S2 before feature work.** Adding 90 endpoints to a repository with zero tests and no CI is how regressions become permanent. The test scaffolding is cheap now and expensive later.
- **S7 is the flagship milestone.** If the project needs a single demonstrable outcome, this is it — and it is reachable by sprint 7 because S1–S6 build exactly the data it aggregates.
- **S12 carries the RLS PR deliberately.** RLS is applied once, after all new tables exist, so the policy sweep is a single reviewable migration rather than a fragment in every schema PR.
- **Workflows 2 and 3 are absent from all twelve sprints** pending the fleet-domain scope decision (OQ 8).

## 15.2 Definition of Done, per §14 — applied to every PR

| Gate | Check |
|---|---|
| JWT enforced | endpoint reachable only with a valid token |
| RBAC enforced | `@PreAuthorize` present with a role from the **reachable** (`BootstrapAdmin`) vocabulary |
| Audit written | state changes produce an `audit_logs` row via `AuditService` |
| Additive schema only | migration contains no `DROP`, no type change, no rename on an existing table |
| RLS decided | new tables have an explicit, documented RLS decision |
| Response envelope | endpoint returns `ApiResponse<T>` |
| DTO boundary | no JPA entity as request or response body |
| Design tokens | new UI uses `tailwind.config.js` tokens, no raw hex |
| No fabricated data | loading, empty and error states rendered explicitly; AI degradation surfaced |
| Tests | happy path + authorisation-denied path per new endpoint |
| Build green | `mvn -q verify` and `npm run build` both pass |
| File labels | every changed file marked `[NEW]` / `[MODIFIED]` / `[REUSED]` in the PR body |

---

# DELIVERABLE 16 — SAFE REFACTORING RECOMMENDATIONS `[VERIFIED]`

Per §13, every item below is **behaviour-preserving except where it fixes a stated defect**, is independently revertable, and touches no working functionality (R6). Each is ranked by risk.

## R1 — Add `@PreAuthorize` to unguarded endpoints `[Risk: Low-Medium]`

**Defect:** P0-2 — six route families are authenticated-only.

**Change:** add `@PreAuthorize("hasAnyRole(...)")` to existing controller methods using the `BootstrapAdmin` vocabulary. No signature change, no logic change, no `SecurityConfig` change (`@EnableMethodSecurity` is already on).

**Why safe:** purely additive annotation. Reversible by deleting lines.

**Why not zero-risk:** it will start returning 403 where previously 200. That is the intended fix, but it must be a standalone PR so the blast radius is visible rather than buried in a feature branch.

## R2 — Fix `ProtectedRoute` `[Risk: Low]`

**Defect:** P0-4 — `App.tsx:82-92`, both branches return `children`.

**Change:** implement the role test following the already-correct `FacilitiesRoute` pattern at `App.tsx:94-101`.

**Why safe:** the correct pattern already exists in the same file, three times. This makes the fourth guard match its siblings.

## R3 — Rehydrate `user` in `authStore` `[Risk: Low]`

**Defect:** `stores/authStore.ts:21` restores `accessToken` from `localStorage` but not `user`, so after refresh every role guard sees an empty role array and redirects to `/`.

**Change:** persist the user object on `setAuthTokens` and restore it at module load, mirroring the existing token handling.

**Why safe:** extends a pattern already present in the same file. Fixes deep links and bookmarks.

## R4 — Introduce the missing service layer `[Risk: Low]`

**Defect:** D2.2 — `contracts`, `documents`, `legal`, `visitor`, `admin` call repositories from controllers; no transaction boundary, no audit hook.

**Change:** insert a `@Service` between controller and repository, moving existing logic **unchanged**, then add `@Transactional` and audit writes.

**Why safe:** mechanical extraction. Endpoint contracts unchanged. Done per module inside that module's feature PR, so it is reviewed alongside the code that needs it.

## R5 — Extract `components/ui/` primitives `[Risk: Low]`

**Defect:** D5.3 — no shared components; ~14 hand-rolled modals; four files over 890 LOC.

**Change:** create primitives styled from existing Tailwind tokens. **No existing page is migrated in the same PR.**

**Why safe:** purely additive — new files only. Existing pages keep working untouched. Migration happens opportunistically later, one component at a time, each with a visual diff check.

## R6 — Remove fabricated data `[Risk: Medium]`

**Defect:** D5.5 — eight locations present invented values as live data.

**Ranked by severity:**

| # | Location | Fix |
|---|---|---|
| 1 | `authService.ts:33-60` — fabricates a demo JWT on network failure | Surface the real error. **Highest priority:** users currently land inside the app holding a token the server rejects, producing an unexplained 401 → `/login` loop |
| 2 | `AddAiProviderModal.tsx:176-182` — reports success on failure | Report the actual result |
| 3 | `LoginPage.tsx:99-140` — plaintext demo credentials in the page | Remove from the rendered output |
| 4 | `adminService.ts:10-13` — `.catch(() => empty)` hides backend failures | Distinguish "empty" from "failed" in the UI |
| 5 | `AppLayout.tsx:178-181` — four status pills hardcoded `'operational'` | Drive from a real health endpoint |
| 6 | `FoReservationsPage.tsx:120` — occupancy hardcoded 68% | Compute from data |
| 7 | `FoReservationsPage.tsx:593-634` — static calendar | Make date-driven |
| 8 | `AiServicesPage.tsx` — hardcoded chart series | Drive from `ai_invocation_logs` (available after PR-4) |

**Why Medium risk:** these currently mask failures. Removing the masks will make previously-hidden backend problems visible — which is correct, but should be expected rather than mistaken for a regression.

## R7 — Add test scaffolding and CI `[Risk: Low]`

**Defect:** `backend/src/test` does not exist; frontend has no tests; no `.github/`; `"lint": "eslint ."` cannot run (no dependency, no config).

**Change:** ESLint config + dependency; `backend/src/test` with a context-load test; `.github/workflows/ci.yml` running `mvn -q verify` and `npm run build` + `npm run lint`.

**Why safe:** additive tooling only. **A context-load test alone would have caught P0-1** — it should be the first test written.

## R8 — Extract `RoleLayout` `[Risk: Medium]`

**Defect:** D5.2 — four layouts ~73% duplicated; already drifting (status pills computed in three, hardcoded in `AppLayout`).

**Change:** one shell parameterised by `{navItems, brandLabel, homePath}`; the four layouts become configuration.

**Why Medium:** touches every page's chrome. Mitigations: migrate the three near-identical sibling layouts first; `AppLayout` last, or leave it unmigrated — its nested nav groups and `exact` matching make it the outlier. Screenshot comparison per layout. **The goal is one shell for new role groups, not forced uniformity.**

## R9 — Delete dead code `[Risk: Low]`

| Target | Evidence it is dead |
|---|---|
| `frontend/unused_security/` | non-compiling, excluded from the build |
| `frontend/src/lib/supabaseClient.ts` | 0 bytes; working client is `lib/supabase.ts` |
| `com/photonicomega/security/**` | outside the scan base; duplicates six entities; contains the one unreachable `@PreAuthorize` |

**Why safe:** none of it participates in a build. Removing the orphan Java package also removes the P0-6 duplicate-mapping hazard.

**Caveat:** verify no active import references anything in these paths before deleting. Do it in a standalone PR so a revert is trivial.

## R10 — Reconcile role vocabularies `[Risk: High — defer]`

**Defect:** P0-3 — V4 seeds seven roles that no user can hold; `BootstrapAdmin` creates four different ones; `SecurityConfig` and all frontend guards gate on the latter.

**Why deferred:** any reconciliation touches authentication for every existing user, and R8 says do not rewrite auth. All new work uses the **reachable** vocabulary, which sidesteps the problem entirely.

**When it must be faced:** Module E wants `LEGAL_OFFICER`, which exists only in the unreachable set. Interim answer: gate `/legal` on `COMPLIANCE_OFFICER` + `ADMIN`. Proper answer requires a decision from the project lead — **Open Question 2**.

**If it proceeds:** additive only — insert missing roles via a new migration, add users via `BootstrapAdmin`. Never delete or rename an existing role row.

## R11 — Fix `SecurityThreatMapController` double prefix `[Risk: Low-Medium]`

**Defect:** `@GetMapping({"/api/security/ip-threats/...", "/api/v1/security/ip-threats/..."})` while `context-path: /api` already prepends `/api` → actual path `/api/api/security/...`.

**Change:** drop the `/api` prefix from the mappings.

**Why not Low:** if `securityService.ts` is currently calling the doubled path, both must change together. Verify the frontend call sites first — this is a two-file coordinated change, not a one-line fix.

## R12 — Refactoring guardrails (§13)

Binding on every item above:

1. **One refactor per PR.** Never mixed with a feature.
2. **No behaviour change** unless the PR title says it fixes a named defect.
3. **Independently revertable** — no refactor is a prerequisite for a feature PR.
4. **No existing endpoint contract changes** — no path, method, or response-shape changes to endpoints in use.
5. **No existing table changes** — additive migrations only (R7).
6. **No auth rewrites** — extend the existing chain (R8).
7. **Visual diff for UI refactors** — screenshot before/after for R5 and R8.
8. **Existing pages migrate opportunistically**, never in a big bang.
9. **`AppLayout` is the last thing touched** in any layout work — it is the outlier.
10. **Any refactor that cannot be reverted in one commit is out of scope.**

---

# IMPLEMENTATION PROPOSAL (§15)

## Branch and PR plan (§10)

Current state: single branch `main`, no PR history, 12 commits mostly titled `commit`, one contributor. §10's protocol is therefore adopted going forward rather than continued.

**Branch naming:**
```
fix/p0-missing-tables-v6
fix/p0-protected-route-guard
fix/p0-endpoint-authorization
feat/ai-governance-audit
feat/contract-management
feat/retention-compliance
feat/compliance-command-center
feat/document-management
feat/visitor-management
feat/legal-management
feat/reservation-gaps
chore/eslint-and-ci
refactor/ui-primitives
```

**One PR per module, per §4.** Every PR body labels each file `[NEW]` / `[MODIFIED]` / `[REUSED]` and states which R-rules it respects.

## First PR — scope and content

**Branch:** `fix/p0-missing-tables-v6`
**Why first:** the application cannot start on its own default profile. Nothing else can be verified until it does.

| File | Label | Change |
|---|---|---|
| `backend/src/main/resources/db/migration/V6__backfill_missing_module_tables.sql` | `[NEW]` | `CREATE TABLE IF NOT EXISTS` × 6, mirroring entity mappings column-for-column, with the V1/V2 audit + soft-delete block and FK indexes |
| `backend/src/main/resources/application.yml` | `[MODIFIED]` | `local` and `supabase` profiles: `flyway.enabled: true`, `ddl-auto: validate` — stops the JVM issuing silent DDL to the cloud database |
| `backend/src/test/java/.../FacilitiesManagementApplicationTests.java` | `[NEW]` | context-load test — the test that would have caught this defect |
| 6 entity classes | `[REUSED]` | read only, to derive the DDL; **not modified** |

**Verification before opening the PR:**
1. Read all six entity classes field-by-field; record every `@Column` name, type, length, nullability.
2. Apply `V1`–`V6` to a scratch database.
3. Start on the default profile with `ddl-auto: validate` — it must boot clean.
4. Confirm `mvn -q verify` passes.

**R-rule compliance:** R7 — additive only, zero `DROP`, zero changes to `V1`–`V5`. R8 — no auth touched. R1/R2 — no rebuild, no redesign.

## Then, in order

**PR-2** `fix/p0-protected-route-guard` — `App.tsx` guard + `authStore` rehydration.
**PR-3** `fix/p0-endpoint-authorization` — `@PreAuthorize` across the six unguarded route families, `/v1/ai/**` first.

After those three, module tracks open in parallel.

## Standing gate

**No implementation code is written until these analysis deliverables are acknowledged.** All 16 deliverables plus the Phase 0 report are now complete and documented in `docs/analysis/`. Nothing in `frontend/`, `backend/` or `supabase/` has been created or modified.

---

# OPEN QUESTIONS FOR THE PROJECT LEAD (§15)

Ranked by how much downstream work they block. Per R10, none of these has been guessed at.

### 1. Credential rotation (P0-5) — **most urgent, non-code**

`application.yml` is not in `.gitignore`, so git history contains the Supabase pooler password for `postgres.hffwvffqwjppecharqsd`, the anon key, the project URL, and the default JWT signing secret. `backend/POSTGRES_PROFILE.md` additionally documents three seed account passwords in plaintext.

Rotating these is an operational action outside a code PR. **Who owns it, and should `application.yml` move to environment-variable-only configuration?** Note that rotating the JWT secret invalidates all existing tokens — it needs a maintenance window.

### 2. Role vocabulary (P0-3) — blocks Module E

Two disjoint sets exist; the V4-seeded seven are unreachable. Module E wants `LEGAL_OFFICER`, which exists only in the unreachable set.

**Options:** (a) gate `/legal` on `COMPLIANCE_OFFICER` + `ADMIN` and defer reconciliation; (b) add a real `LEGAL_OFFICER` via `BootstrapAdmin` + an additive migration; (c) full reconciliation, which touches auth for every user and pushes against R8.

**Recommendation: (b)** — additive, unblocks Module E, no existing user affected.

### 3. `pgvector` availability — blocks §7.4 smart search

`app.ai.embedding` declares `nomic-embed-text` at dimension 768, but `pgvector` is not installed and no embedding is computed anywhere. **Is `pgvector` available on the target Postgres/Supabase instance?** If yes, `document_embeddings.embedding_vector` becomes `VECTOR(768)` with an `ivfflat` index. If no, it stays `TEXT` and ranking happens in the JVM over a candidate set — materially slower and capped in corpus size.

### 4. Database role and RLS — blocks PR-31

Enabling RLS without a policy is only safe if the application's database role owns the tables or has `BYPASSRLS`. **What role does the app connect as in each environment?** If it is a restricted role, PR-31 would lock the application out of its own tables. This must be tested on a non-production database before it merges.

### 5. Slot-based booking — affects Module A scope

D7.7 deliberately omits `reservation_slots`. `RoomAvailabilityService` computes availability from start/end overlap today and works; a slot table would be a redesign of a working module (R2). **Is slot-based booking a real requirement, or is interval-based availability sufficient?**

### 6. AI provider reality — affects all of §7

`app.ai.*` is configured for Ollama at `http://ollama:11434` and is **read by no code**. The one real LLM call (`ReservationLlmGateway`) targets an OpenAI-compatible endpoint and is disabled by `PLACEHOLDER_KEY`. **Which provider is actually reachable — a self-hosted Ollama, an OpenAI-compatible endpoint with a real key, or neither?** Until answered, all §7 services run in documented fallback mode. That is a legitimate §7.5-compliant state, but it means "AI features" are heuristics with an audit trail.

### 7. n8n availability — affects §8 approach

No n8n exists anywhere in the repository. **Is an instance available (self-hosted / cloud), or should these run as Spring `@Scheduled` jobs?** The repository already has `@EnableScheduling` and three orphaned cron expressions (`retention-check-cron`, `contract-expiry-cron`, `visitor-cleanup-cron`) that appear to have been written for exactly this purpose. **The scheduled-job path needs no new infrastructure, no service account, no callback endpoint, and no shared secret — it is materially lower risk and satisfies the same functional requirement.**

### 8. Fleet domain scope (§8 workflows 2 and 3) — **blocks two of five workflows**

§8 requires a driver-accreditation workflow and a vehicle-compliance workflow. The repository contains **no driver, vehicle, accreditation, licence, or inspection table, entity, or endpoint** — verified by search.

These describe a fleet-management capability this system does not have. Building them means creating a seventh module from scratch, which R10 forbids inventing.

**Options:** (a) strike workflows 2 and 3 from scope; (b) scope a fleet module explicitly, with its own schema, endpoints, pages and sprints; (c) confirm this data lives in an external system and the workflows should read from that instead.

**Recommendation: (a) or (c).** Both are currently excluded from D14 and D15, so answering this does not delay any other work.

### 9. Supabase's intended role — confirms D11

D11 narrows Supabase to realtime transport, because `00001_create_all_tables.sql` describes different columns for the same table names that Flyway owns, and RLS there is `using (true)`. **Is that narrowing correct, or is any part of the frontend expected to read business data through the anon key?** If the latter, the two schemas must be reconciled — which is a much larger piece of work than anything in this plan.

### 10. Existing seed data and environments

`BootstrapAdmin` creates four users on startup. **Which environments are live, and is there production data in the Supabase instance?** This determines whether PR-1's migrations can be applied freely or need a data-preserving rollout. It also determines whether `ddl-auto: update` has already created divergent versions of the six P0-1 tables that `V6` will now collide with — if so, `V6` needs `IF NOT EXISTS` plus a column reconciliation step.

---

*End of analysis. Awaiting acknowledgement before any implementation code is written.*
