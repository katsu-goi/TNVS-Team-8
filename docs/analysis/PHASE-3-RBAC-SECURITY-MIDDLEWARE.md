# PHASE-3: RBAC & SECURITY MIDDLEWARE FOR EDGE FUNCTIONS

**Status:** COMPLETE — live-verified against `dunijfrvfozwlykpkfhy`
**Date:** 2026-08-19
**Scope:** Shared auth guard + role/permission middleware for every module Edge Function, mirroring the Spring Security model exactly; proof deployed as `rbac-demo`; `auth` refactored onto the middleware.

---

## 1. Spring Security model (source of truth)

### 1.1 Path-based role buckets (`SecurityConfig.securityFilterChain`)
| Path | Required role |
|---|---|
| `/v1/admin/**`, `/v1/security/**` | `SUPER_ADMIN` |
| `/v1/facilities-manager/**` | `FACILITIES_MANAGER` |
| `/v1/facilities-officer/**` | `FACILITIES_OFFICER` |
| `/v1/compliance/**` | `COMPLIANCE_OFFICER` |
| `/v1/legal/**` | `LEGAL_OFFICER` |
| `/v1/procurement/**` | `CONTRACT_OFFICER` |
| `/v1/employee/**` | `EMPLOYEE` |
| `anyRequest()` | authenticated (no role) |

**Public endpoints (permitAll, exact):** `/v1/auth/login`, `/v1/auth/refresh`,
`/v1/auth/forgot-password`, `/v1/auth/reset-password`, `/v1/auth/hr/assistance`,
`/files/**`, `/ws-endpoint/**`, swagger/actuator docs, `/error`, `OPTIONS /**`.

### 1.2 Method-level `@PreAuthorize` (found across controllers)
- `AiController`: `hasRole('SUPER_ADMIN')`; `isAuthenticated()` (open AI chat).
- `ContractController`: `hasAnyRole('CONTRACT_OFFICER','LEGAL_OFFICER')`.
- `DashboardController`: `hasRole('SUPER_ADMIN')`.
- `RequestReviewController`: `hasAnyRole('SUPER_ADMIN','CONTRACT_OFFICER','LEGAL_OFFICER')`.
- `FacilityController`: `hasAnyRole('FACILITIES_MANAGER','FACILITIES_OFFICER')` (list/create/assign), `hasRole('FACILITIES_MANAGER')` (delete, manager-only ops).
- `LegalCaseController`: `hasRole('LEGAL_OFFICER')`.
- `VisitorController`: `hasRole('FACILITIES_OFFICER')`.

**Important fidelity fact:** Spring has **no `RoleHierarchy` bean**. Role checks are
exact-match on `ROLE_<NAME>` authorities. `SUPER_ADMIN` therefore does **not** implicitly
pass `hasAnyRole('FACILITIES_MANAGER','FACILITIES_OFFICER')` — verified in the live RBAC
matrix below (admin got 403 on `/rbac-demo/facilities`, matching Spring).

### 1.3 Per-request DB lookup (not just claims)
`JwtAuthenticationFilter.doFilterInternal` calls
`userDetailsService.loadUserByUsername(username)` → `CustomUserDetailsService`
(`findByEmailWithRolesAndPermissions`) on **every** request. Authorities are loaded fresh
from the DB each call. The Edge guard replicates this (fresh user + role/permission lookup
per request), so disabled/deleted users and permission changes take effect immediately —
not just at token expiry.

### 1.4 Error envelopes (must match byte-for-byte)
- **401** — `JwtAuthenticationEntryPoint`:
  `{"success":false,"message":"Authentication required. Please provide a valid token.","errorCode":"UNAUTHORIZED"}`
- **403** — `GlobalExceptionHandler.handleAccessDenied`:
  `{"success":false,"message":"Access denied: insufficient permissions","errorCode":"ACCESS_DENIED"}`
- (DocumentController uses a custom `"You do not have permission to download this document."` variant — noted for the documents module.)

### 1.5 CORS parity
Spring: `GET,POST,PUT,PATCH,DELETE,OPTIONS`; headers `*`; exposes `Content-Disposition`;
credentials allowed; max-age 3600. Edge `_shared/cors.ts` now exposes
`Content-Disposition` too (needed for document downloads), methods
`GET,POST,PUT,PATCH,DELETE,OPTIONS`.

### 1.6 Permission vocabulary (from live DB)
`permissions` table (7 rows) and `role_permissions` (7 rows):

| Role | Permission |
|---|---|
| `SUPER_ADMIN` | `ALL` |
| `COMPLIANCE_OFFICER` | `COMPLIANCE_OPERATIONS` |
| `CONTRACT_OFFICER` | `CONTRACT_OPERATIONS` |
| `EMPLOYEE` | `EMPLOYEE_OPERATIONS` |
| `FACILITIES_MANAGER` | `FACILITIES_MANAGE` |
| `FACILITIES_OFFICER` | `FACILITIES_OPERATIONS` |
| `LEGAL_OFFICER` | `LEGAL_OPERATIONS` |

JWT `roles` claim carries `ROLE_<name>` + permission names, comma-joined (matches
`JwtTokenProvider`). Guards parse role names by stripping `ROLE_`.

---

## 2. Deliverables

### 2.1 `supabase/functions/_shared/guard.ts` (new)
The reusable middleware every module function will import:

- **`AuthContext`** — `{ user, email, userId, roles, permissions, authorities, ip, userAgent }`.
- **`extractAuthContext(req)`** — parses `Bearer`, verifies via `verifyAccessToken`
  (jose, custom HS256 `JWT_SECRET`), loads user fresh via `findUserByEmail`, checks
  `isAccountActive` (disabled/deleted → treated as unauthenticated), resolves client IP.
  Returns `null` on any failure → router emits 401.
- **Role/permission predicates** — `hasAnyRole`, `hasRole`, `isSuperAdmin`,
  `hasAnyPermission`, `hasPermission` (case-insensitive, mirrors `hasRole`/`hasAnyRole`).
- **Route guards** — `public` | `auth` | `roles[]` | `permissions[]`.
- **`createHandler(routes, {name})`** — router factory used by `Deno.serve`. Handles, in order:
  1. CORS preflight (204) — same as Spring `OPTIONS permitAll`
  2. env assertion (config) — 500 `ENV_MISSING`
  3. route lookup (method + path-suffix match)
  4. JSON body parse for POST/PUT/PATCH (null on invalid)
  5. public → handler directly; auth/roles/permissions → extract ctx, 401 if absent,
     403 if role/permission check fails
  6. handler wrapped in `safeRun` → 500 `INTERNAL_SERVER_ERROR` envelope on thrown errors
  7. unmatched → 404 `NOT_FOUND` envelope
- **`unauthorizedResponse()` / `forbiddenResponse()`** — produce the exact Spring envelopes.
- Helpers: `mePayload(ctx)`, `readJson(req)`, `notFoundResponse`, `internalErrorResponse`.

### 2.2 `auth` refactored onto the middleware (proves pattern in production)
`supabase/functions/auth/index.ts` now registers its routes through `createHandler`
instead of a hand-rolled dispatcher:
- `POST /auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`,
  `/auth/hr/assistance` → `guard: public` (Spring PUBLIC_ENDPOINTS).
- `POST /auth/logout`, `/auth/heartbeat` → `guard: auth` (Spring: not public, so
  `anyRequest().authenticated()` applies).
- **NEW** `GET /auth/me` → `guard: auth`, returns the current user summary
  (same shape as the `user` block of login/refresh responses, via `userSummary`).
  Handlers now receive `ctx` (authenticated user) instead of doing their own token
  resolution — removes the Phase 2 `bearerUser` duplication.

### 2.3 `rbac-demo` function (new, deployed)
Proof of the middleware surface:
- `GET /rbac-demo/whoami` → `auth` (returns email/roles/permissions/authorities/summary)
- `GET /rbac-demo/admin` → `roles: ["SUPER_ADMIN"]`
- `GET /rbac-demo/facilities` → `roles: ["FACILITIES_MANAGER","FACILITIES_OFFICER"]`
- `GET /rbac-demo/permission` → `permissions: ["FACILITIES_MANAGE"]`

---

## 3. Live verification matrix (`--no-verify-jwt` deploy)

| Call | admin (SUPER_ADMIN) | fm (FACILITIES_MANAGER) | employee (EMPLOYEE) |
|---|---|---|---|
| `/whoami` | 200 | 200 | 200 |
| `/admin` | **200** | 403 `ACCESS_DENIED` | 403 `ACCESS_DENIED` |
| `/facilities` | 403 `ACCESS_DENIED` | **200** | 403 `ACCESS_DENIED` |
| `/permission` (FACILITIES_MANAGE) | 403 `ACCESS_DENIED` | **200** | 403 `ACCESS_DENIED` |

- No token → 401 `{"success":false,...,"errorCode":"UNAUTHORIZED"}` (byte-matches Spring entry point).
- Malformed token (`not.a.jwt`) → 401 `UNAUTHORIZED`.
- Wrong-role hits → 403 `{"success":false,...,"errorCode":"ACCESS_DENIED"}` (byte-matches GlobalExceptionHandler).
- `SUPER_ADMIN` failing `/facilities` is **correct per Spring** (no role hierarchy, exact match).

**Auth regression after refactor (all live):**
- `POST /auth/login` fm → 200, roles `FACILITIES_MANAGER`, perms `FACILITIES_MANAGE`.
- `GET /auth/me` → 200 full user summary.
- `POST /auth/refresh` → 200 new token; **reusing the old refresh token → 401 `INVALID_TOKEN`** (rotation intact).
- `POST /auth/heartbeat` (fresh token) → 200.
- `POST /auth/logout` → 200; envelope has no `data` field (Spring-faithful message-only `ok`).
- (Post-logout heartbeat with the same access token still 200 — matches Spring: access tokens are stateless and unrevoked; only the refresh token is revoked. Heartbeat/session refresh is therefore non-destructive, as in Spring.)

---

## 4. Conventions locked in for Phases 4+

1. **Every module function deploys with `--no-verify-jwt`** and uses `createHandler`
   with `guard: public/auth/roles/permissions` on each route.
2. **Module-level default from the path buckets** (Section 1.1) is the *minimum* guard
   for a module; per-route guards reproduce `@PreAuthorize` and may be stricter.
   `SERVICE_ROLE`/`PUBLIC` buckets do not exist at the platform level for these functions.
3. **Role names in guards** are plain (`SUPER_ADMIN`); the middleware uppercases and
   strips `ROLE_` so both token formats work.
4. **Fresh DB lookup per request** is intentional (mirrors Spring's filter), so role and
   account-status changes are effective immediately.
5. **Errors** flow through the guard envelope: 401 `UNAUTHORIZED`, 403 `ACCESS_DENIED`,
   404 `NOT_FOUND`, 500 `INTERNAL_SERVER_ERROR`, 500 `ENV_MISSING`.
6. **CORS** is centralized in `_shared/cors.ts` (methods, headers, `Content-Disposition`
   exposure) and applied by the router.

## 5. Follow-ups (tracked for later phases)
- **Rate limiting**: `_shared/rate-limit.ts` + `rate_limit_counts` RPC exist (Phase 1) but
  are not yet wired into the guard tiers. Phase 4 modules will apply per-route
  `consumeRateLimit` (e.g. strict for auth/login, generous for reads) with 429
  `RATE_LIMITED` envelope to match Spring's `RateLimitFilter` behavior.
- **DocumentController custom 403 message** (`"You do not have permission to download this document."`)
  must be used in the documents module.
- No email/SMTP provider yet (reset/HR notifications) — later phase.

## 6. Artifacts
- `supabase/functions/_shared/guard.ts` (new)
- `supabase/functions/auth/index.ts` (refactored; added `GET /auth/me`)
- `supabase/functions/rbac-demo/index.ts` (new)
- `supabase/functions/_shared/cors.ts` (added `Content-Disposition` exposure)
- Deployed: `auth`, `rbac-demo` (both `--no-verify-jwt`).
- Reference sources: `SecurityConfig.java`, `JwtAuthenticationFilter.java`,
  `JwtAuthenticationEntryPoint.java`, `GlobalExceptionHandler.java`, `CustomUserDetailsService.java`.
