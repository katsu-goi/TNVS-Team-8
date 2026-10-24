# Connectivity coherence implementation plan

**Spec:** `docs/superpowers/specs/2026-10-24-connectivity-coherence-design.md`

## Global constraints

- Follow test-driven development for every behavior change.
- Keep `reservations` and `facility_reservations` separate.
- Treat Supabase Edge Functions as the hosted API contract.
- Do not deploy or mutate staging/production in this plan.
- Do not expose raw reset tokens, service credentials, or unauthorized entity IDs.

## Task 1: Password recovery

**Files:** shared email helper/test, auth reset helper/test, `auth/index.ts`, `reservation-portal/index.ts`, `authService.ts`, new auth pages/tests, `App.tsx`, login tests.

1. Add failing tests for Resend delivery states, reset URL/email content, forgot/reset client calls, the login recovery link, form validation, token submission, and success navigation.
2. Run focused Deno/Vitest commands and confirm failures are caused by missing behavior.
3. Extract the shared email transport, connect the auth handler, add public pages/routes, and reuse the transport from reservation invitations.
4. Run focused suites and the full frontend suite.

## Task 2: Notification delivery and record focus

**Files:** `facilities/index.ts`, `roleRegistry.ts` and test, `NotificationBell.tsx` and test, shared notification-focus helper/test, affected list pages/tests.

1. Add failing route tests for `FacilityComplianceDocument`, UUID focus preservation, and malformed-ID rejection.
2. Add a failing Edge contract test proving the permit route uses `phase5_notify_roles` and no hard-coded recipient.
3. Add failing focus-helper/component tests against authorized loaded rows.
4. Implement role notification RPC, destination construction, and row focus behavior.
5. Run focused and full suites.

## Task 3: Metadata-only documents

**Files:** document Edge DTO/contract test, `documentArchiveService.ts`, `EnterpriseDocumentArchive.tsx` and test.

1. Add failing tests proving metadata-only records show their label but no Preview/Download actions.
2. Add a failing Edge contract test for `fileAvailable` derived from a valid storage path.
3. Implement the DTO and UI gating.
4. Run focused and full suites.

## Task 4: Visitor relationship constraints

**Files:** new migration and migration contract test.

1. Add a failing contract test naming every required index, orphan precheck, foreign key, `NOT VALID`, validation, and restrictive delete behavior.
2. Add the idempotent migration with short statements and existing-data prechecks.
3. Run the migration contract test and all Edge tests.

## Task 5: Dead-flow removal

**Files:** role registry, `App.tsx`, `AdminPages.tsx`, `adminService.ts`, Admin/Facilities/Legal/Procurement Edge functions, Facilities Officer pages, five unused API modules, tests/inventory.

1. Add or adjust failing navigation/route contract tests that define the retained surface.
2. Remove the empty Integrations surface, unused modules, placeholder exports, and confirmed duplicate handlers.
3. Run the static connectivity inventory and verify no sidebar/browser mismatch, no true unmatched active call, and no targeted unused handler/module remains.
4. Run full frontend tests, lint, build, and Edge tests.

## Final review

Create the plan review package, obtain one fresh whole-branch code review, make one test-driven fix pass for Critical/Important findings, update `outputs/system-memory` with actual changes and verification, then use the development-branch finishing workflow. Pushing or updating the pull request is a separate external side effect and will follow the user’s existing publication authorization only after local verification.
