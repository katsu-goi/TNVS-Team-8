# Super Admin analytics repair — 2026-09-26

## Root cause

Production `https://tnvs-team-8-rho.vercel.app/super-admin` loads `SysAdminDashboard-DdbT9KHO.js`. That deployed bundle contains both reported messages. `SysAdminDashboard` calls `fetchAnalytics({ preset: 'today' })`, then throws if `analytics.operational` is missing. Its catch labels this local exception “Database Connection Error”.

The deployed analytics Edge Function (version 18) selects `SUPER_ADMIN` and calls `phase9_super_admin_enterprise_analytics`. This RPC returns `{ scope: 'SUPER_ADMIN', enterprise: ... }`, with no `operational` property. `SYSTEM_ADMIN` receives operational analytics from `phase6_analytics_snapshot`. The frontend was still expecting the older shared response. The analytics reporting page and PDF generator also assumed operational data and could manufacture zero-valued summaries for enterprise responses.

This is a frontend/API contract mismatch, not evidence of a broken database connection. The original workspace is at `b9274c2`; the repair is based on current remote main `1b7c18f` in `.worktrees/super-admin-analytics`, branch `fix/super-admin-analytics`. Production backend code is newer than the checked-in analytics Edge Function; this repair must be deployed as a frontend change. Do not redeploy the older checked-in Edge Function over production.

## Request and query evidence

- Request: `GET https://dunijfrvfozwlykpkfhy.supabase.co/functions/v1/analytics?preset=today`.
- Flow: dashboard → `analyticsService.fetchAnalytics` → Axios client with application bearer token → analytics Edge Function guard → assigned/effective role selection → enterprise PostgreSQL RPC.
- The reported error is thrown after the response is returned to the component; it is not an HTTP or Supabase error message.
- Authenticated HTTP status/body were **not captured**: no authorized test session was available, and the user chose to continue with available verification. Do not describe the database check as an authenticated browser test.
- An actual anonymous HTTP probe returned **401**, body: `{"success":false,"message":"Authentication required. Please provide a valid token.","errorCode":"UNAUTHORIZED",...}`.
- Read-only execution of the deployed RPC under `SET LOCAL ROLE service_role`, using an existing active Super Admin identity selected inside SQL, succeeded. Scope: `SUPER_ADMIN`; `operational` absent; enterprise overview present.
- Observed current counts: active accounts 16; facilities 4; documents 16; active contracts 2; open requests 1; open legal matters 3; open compliance issues 3. Counts are a point-in-time snapshot.
- Security endpoint-equivalent queries succeeded: active sessions 3; legacy admin/user failed logins 0; active blocked IPs 0; unresolved security alerts 1.
- Database/Supabase error: **none in these queries**.

The repair reads enterprise analytics and obtains security cards through the existing `GET /security/admin/metrics` endpoint. Other dashboard requests remain `/security/admin/logs`, `/security/admin/sessions`, `/notifications`, and `/monitoring/admin/system-monitoring/subsystems`, plus the oversight panel and realtime subscriptions. Backups are loaded only for System Admin.

## RBAC, RLS, session, and configuration

- Actual database `roles.name` values include distinct `SUPER_ADMIN` and `SYSTEM_ADMIN` values.
- Frontend `isActorSuperAdmin` uses assigned roles and normalizes `ROLE_` prefixes. `/super-admin` is guarded by `SuperAdminRoute`.
- Edge authorization loads assigned roles from `user_roles` and `roles`; the deployed analytics handler prioritizes `SUPER_ADMIN` and selects the enterprise RPC.
- The security metrics route explicitly allows `SUPER_ADMIN` or `SECURITY_MONITOR` permission. No role grants are changed.
- The enterprise RPC allows execution by `service_role`; `anon` and `authenticated` cannot execute it directly. The Edge Function authenticates the application user before using its server database client. Read-only checks under that database role succeeded. No RLS bypass or policy change is introduced by this fix.
- Session bootstrap verifies the saved application session, and the Axios client retries expired access tokens via `/auth/refresh`. This is application JWT authentication, separate from Supabase realtime authentication. Browser login/refresh has not been tested with a live account.
- The public production bundle contains project URL `https://dunijfrvfozwlykpkfhy.supabase.co` and a publishable key. No `sb_secret_` key or service-role JWT was found in that bundle. Key values were not printed.
- Vite reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional `VITE_API_BASE_URL` at build time. The production bundle and CSP point to the same production project. Staging is a separate project (`jyuhyciumeputgznwkoz`). Local environment files were absent; intended developer project configuration cannot be inferred.
- Vercel dashboard environment settings and deployment permissions were not available. Inspecting the served bundle verifies the compiled project/key type, not all private Vercel settings.

## Metric mapping

All enterprise metrics require the Super Admin analytics scope. Soft-deleted rows are excluded where the RPC specifies `is_deleted = false`. Period counts use Manila calendar boundaries, inclusive start and exclusive end.

| Display | Actual source and filter |
|---|---|
| Active Accounts | `users`, not deleted, `status = 'ACTIVE'` |
| Facilities | `facilities`, not deleted |
| Documents | `documents`, not deleted |
| Active Contracts | `contracts`, not deleted, `status = 'ACTIVE'` |
| Open Requests | `employee_requests`, not deleted, `PENDING` or `PENDING_APPROVAL` |
| Open Legal Matters | `legal_cases`, not deleted, status excluding `CLOSED`, `RESOLVED`, `DISMISSED` |
| Open Compliance Issues | `compliance_alerts`, not deleted, `OPEN` or `ACKNOWLEDGED` |
| Registered Visitors | `visitors.created_at` within period, not deleted |
| Documents Uploaded | `documents.created_at` within period, not deleted |
| Audit Events | Period counts from `audit_logs.created_at`, `security_logs` timestamp/created_at, `admin_audit_logs.occurred_at` |
| Recorded Activity | RPC moduleActivity sum: reservations, maintenance schedules, visitors, visitor workflow events, documents, document AI classifications, compliance alerts, disposal requests, legal cases, legal employee requests, contracts, contract AI analyses, users, and the three audit sources; uses each source's recorded event timestamp |
| Active Sessions | `/security/admin/metrics`: `active_sessions.status = 'ACTIVE'` |
| Security Alerts | Same endpoint: `security_alerts.status = 'UNRESOLVED'` |
| Blocked IPs | Same endpoint: `blocked_ips.status = 'ACTIVE'` |
| Failed Logins | Same endpoint: `login_history.status = 'FAILED'`, username in `admin`, `user`; existing backend limitation is now stated in the card subtitle |
| Online Users / peak | Existing live activity hook seeded from authorized active sessions and refreshed by realtime markers; peak is maintained by that hook, not enterprise active-account count |
| Notifications | `/notifications`, recipient-scoped; unread count from returned rows |

Zero records render zero. Malformed/missing role payloads remain failures. Authentication, permission, network, and query errors receive distinct safe messages. Failed refreshes show an alert alongside the previous successful values.

## Changes

- `frontend/src/api/dashboardData.ts`: role-specific response adapter and error classification.
- `frontend/src/types/index.ts`: typed enterprise overview contract matching the deployed RPC.
- `frontend/src/components/sysadmin/SysAdminDashboard.tsx`: enterprise overview, authorized security data, accurate error display and stale-refresh feedback.
- `frontend/src/components/analytics/EnterpriseOverview.tsx`: shared current-state/selected-period display and metric mapping.
- `frontend/src/components/sysadmin/AnalyticsDashboard.tsx`: enterprise reporting instead of operational placeholders.
- `frontend/src/components/analytics/analyticsPdfReports.ts`: enterprise PDF summary.
- `frontend/src/components/sysadmin/SysAdminDashboard.test.tsx`: regression coverage.
- This audit report.

Database changes: **none**. Edge Function changes: **none**. Production deployment: **not performed**.

## Verification

- Production-mode build (`npm run build`, production Supabase URL supplied): **PASS**, TypeScript and Vite completed. This verifies compilation; Vercel deployment settings and runtime authentication are not proven by a local build.
- Live enterprise RPC and security count queries under the Edge Function database role: **PASS**.
- Direct execution of the TypeScript-transpiled response adapter: **PASS** for enterprise data, valid zero counts, security source mapping, rejection of a missing enterprise payload, System Admin scope isolation, and authentication/permission/query/network/Postgres permission error classification.
- Dashboard/analytics Vitest regressions: **PASS**, all 11 tests using `npm test -- --pool=forks --maxWorkers=1 src/components/sysadmin/SysAdminDashboard.test.tsx`. Earlier runs stalled during worker startup; a subsequent run completed successfully. Covers enterprise dashboard/report rendering, zero data, failed refresh, retry, role-specific sources, PDF metrics, and error categories.
- Super Admin dashboard: code repaired; browser end-to-end **NOT VERIFIED**.
- Super Admin analytics: database/adapter **PASS**; deployed frontend **NOT FIXED YET**.
- Login/session after browser refresh/authenticated HTTP end-to-end: **NOT VERIFIED**, by agreement to continue without a test account.

Production still serves the faulty frontend until the repair is deployed. Deploy the frontend from this worktree with the existing production Vercel environment variables; no database or Edge Function deployment is required.
