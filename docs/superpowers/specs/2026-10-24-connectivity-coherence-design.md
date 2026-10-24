# Connectivity coherence design

## Context

The 2026-10-24 audit found that the deployed frontend/Edge architecture is broadly connected, but five user/data flows are only partially connected and several unused implementations create misleading or unsafe parallel contracts. The approved scope is the full coherence pass: complete every supported connection and remove every confirmed dead flow. The room approval workflow and Team 8 guest-pass workflow remain distinct.

## Goals

- Make password recovery executable end to end without account enumeration.
- Route facility permit notifications to active assigned Compliance Officers and then to the relevant review record.
- Make notification navigation carry a validated entity identifier to authorized target pages.
- Prevent the archive UI from offering file actions for metadata-only records.
- Enforce visitor workflow relationships in Postgres without losing audit history.
- Remove user-visible placeholders and unreachable duplicate contracts with no valid producer/consumer.

## Password recovery

Create a shared Resend transport used by reservation invitations and authentication. It accepts an injected fetch implementation for deterministic tests and returns `SENT`, `SIMULATED`, or `FAILED` without logging credentials or full reset URLs.

The forgot-password handler always gives the same non-enumerating response. For an active account it creates a cryptographically random token, stores only the SHA-256 digest and a 30-minute expiry, builds a reset URL from `PORTAL_PUBLIC_URL`, and attempts delivery. The response text remains truthful when mail is unconfigured or fails by directing users to HR if the message does not arrive. Failures are logged without exposing the token.

Public `/forgot-password` and `/reset-password` screens reuse the existing login visual language. The reset screen accepts the token from the query string, enforces the server password rules before submit, and returns to sign-in on success. Token invalidation and session revocation stay server-owned.

## Notifications

Facility permit routing calls the existing `phase5_notify_roles` database function for all active `COMPLIANCE_OFFICER` assignments with a deterministic deduplication key. No email address is embedded in application code.

`getNotificationDestination` accepts an optional entity ID. It recognizes only UUIDs and adds `focus=<uuid>` to an allowlisted role/entity destination. `FacilityComplianceDocument` maps to `/compliance/documents`. Malformed IDs are ignored and unknown entity types retain the dashboard fallback.

Target list pages use a small focus helper: after authorized rows load, they find the matching ID, scroll it into view, and apply the existing highlight colors. The helper never fetches an arbitrary ID and never expands authorization. The first supported set covers the live notification entities: Reservation, Visitor, EmployeeRequest, Document, Contract, and FacilityComplianceDocument.

## Document availability

Archive DTOs expose `fileAvailable`, derived from a valid private-storage object path. View, preview, print, and download actions require both authorization and `fileAvailable`. Metadata, access requests, retention, archive, and restore actions remain available. The UI labels records without a stored file as metadata-only.

## Visitor constraints

Add indexes for each referencing column that does not already have a suitable leading-column index. Add idempotent foreign keys as `NOT VALID`, then validate them in the same migration after explicit orphan prechecks. Use the default restrictive delete behavior for visitor, verification, watchlist, and user audit relationships. The application uses soft deletion, so physical parent deletion must not silently erase or detach audit evidence.

Relationships:

- `visitor_verifications.visitor_id → visitors.id`
- `visitors.current_verification_id → visitor_verifications.id`
- `visitor_verifications.matched_watchlist_entry_id → visitor_watchlist.id`
- `visitor_verifications.reviewed_by → users.id`
- `visitor_clearance_reviews.visitor_id → visitors.id`
- `visitor_clearance_reviews.verification_id → visitor_verifications.id`
- `visitor_clearance_reviews.reviewer_id → users.id`
- `visitor_workflow_events.visitor_id → visitors.id`
- `visitor_workflow_events.verification_id → visitor_verifications.id`
- `visitor_workflow_events.actor_id → users.id`

The migration raises an exception with a relationship-specific message if an orphan exists. This prevents partially valid constraints from masking inconsistent production data.

## Cleanup

Remove the Integrations sidebar item, route, page, client method, and read endpoints because `integration_status` has no producer or probe. Keep the table for external ownership/history.

Remove unused API modules (`complianceService`, `dashboardService`, `legalService`, `procurementService`, `supabaseMonitoringService`), unreachable Facilities Officer profile/settings exports, and unrouted duplicate Admin, Facilities, Legal, and Procurement handlers. Preserve scheduled/public/dynamic/compatibility routes identified as intentional in the audit.

## Error handling and security

- Password reset never discloses whether an account exists.
- Raw reset tokens are never persisted, returned by the API, or logged.
- Notification focus IDs are accepted only when UUID-shaped and only applied to already-authorized rows.
- Database constraints use restrictive deletion to preserve workflow evidence.
- No production or staging mutation is part of implementation; deployment remains a separate authorized step.

## Verification

Each behavior starts with a failing focused test. Finish with all frontend tests, lint, TypeScript/Vite build, Edge/Deno tests, migration contract checks, the static connectivity inventory, and an authenticated browser pass when a valid session is available.
