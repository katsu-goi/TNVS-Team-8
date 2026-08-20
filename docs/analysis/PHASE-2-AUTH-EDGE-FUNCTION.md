# Phase 2 — Auth Edge Function

**Date:** 2026-08-19
**Status:** COMPLETE — deployed to `dunijfrvfozwlykpkfhy` and verified E2E against the live DB.

## 1. Endpoints implemented (`supabase/functions/auth/index.ts`)

| Route | Mirrors | Notes |
|---|---|---|
| `POST /auth/login` | `AuthController.login` | bcrypt verify, progressive/permanent lockout, JWT issuance, session + realtime activity |
| `POST /auth/refresh` | `AuthController.refreshToken` | opaque refresh-token lookup + JWT signature check + rotation |
| `POST /auth/logout` | `AuthController.logout` | revoke all refresh tokens, sessions REVOKED, offline event |
| `POST /auth/heartbeat` | `AuthController.heartbeat` | upsert active session + online_users |
| `POST /auth/forgot-password` | `AuthController.forgotPassword` | token stored (30 min), generic response (no existence leak) |
| `POST /auth/reset-password` | `AuthController.resetPassword` | hash rotation, token cleared, tokens revoked |
| `POST /auth/hr/assistance` | `HrAssistanceController` | public request persistence + audit |

## 2. New shared libs

- `_shared/auth-users.ts` — user + roles + permissions load via service-role, `authorityString()` (ROLE_x + permission names, mirrors `CustomUserDetailsService`), `userSummary()` (mirrors `UserSummaryDto`), naive/tz timestamp helpers.
- `_shared/password.ts` — bcryptjs verify/hash (matches Spring `$2a$12$` hashes — verified against live admin/co hashes).
- `_shared/lockout.ts` — `LoginAttemptService` port: 3 attempts, progressive locks 10s/30s, permanent 365d; audit `LOGIN_FAILED`(WARNING), `ACCOUNT_LOCKED`(CRITICAL), HIGH `ACCOUNT_LOCKOUT` alert.
- `_shared/refresh-tokens.ts` — opaque refresh-token store, rotation, revoke-all, expiry.
- `_shared/sessions.ts` — `UserActivityService` port: active_sessions upsert/revoke, `user_activity_events` inserts, `online_users` upsert/remove, UA parsing.

## 3. Critical architecture decision: `--no-verify-jwt`

Custom JWT tokens are HS256-signed with our own `JWT_SECRET`, **not** Supabase's JWT secret. The platform-level `verify_jwt` gate therefore rejects them. The `auth` function is deployed with **`--no-verify-jwt`** and verifies tokens inside the handler (`_shared/jwt.ts` via jose). **All future Edge Functions must be deployed with `--no-verify-jwt`** — the existing `spike` function (deployed with verify on) is unaffected since it only checks DB connectivity.

## 4. Live E2E verification (real admin credentials)

- `login admin@photonicomega.com` → `200` with `roles:["SUPER_ADMIN"]`, `permissions:["ALL"]`, claims `ROLE_SUPER_ADMIN,ALL`, `expiresIn:900`. ✅
- `refresh` → new pair issued, old refresh token rejected on reuse (rotation). ✅
- `heartbeat` with access token → `{"success":true,"message":"Heartbeat recorded"}`. ✅
- `logout` with access token → `Logged out successfully`. ✅
- Response envelopes match Spring exactly (`ok(message)` has **no** `data` field; `ok(data,msg)` includes `data`).

## 5. Failure/lockout + reset E2E (throwaway user, fully cleaned up)

Using a temporary user `phase2test@photonicomega.com` (EMPLOYEE), then deleting all 18 test rows (users, user_roles, refresh_tokens, audit_logs, login_history, security_alerts, active_sessions, online_users, user_activity_events):

- Wrong password #1 → `423 ACCOUNT_TEMP_LOCKED`, lockSecondsRemaining 10. ✅
- Attempt during lock → gate rejects before password check (countdown honored). ✅
- Wrong password #2 (after expiry) → 30s lock. ✅
- Wrong password #3 → `423 ACCOUNT_LOCKED`, permanentlyLocked, `lockedUntil` = 2027 (365d). ✅
- Correct password while permanently locked → still `423 ACCOUNT_LOCKED` (lock cannot be bypassed). ✅
- `forgot-password` → token + expiry stored in `users`. ✅
- `reset-password` (valid token) → hash rotated, token cleared, tokens revoked. ✅ (Lock is NOT auto-cleared — identical to Spring `resetPassword`.)
- Login with new password (lock cleared as admin maintenance) → `200`. ✅

**DB side effects confirmed in live DB:** 3× `LOGIN_FAILED`(WARNING), `ACCOUNT_LOCKED`(CRITICAL) in audit_logs; 3× `FAILED/INVALID_CREDENTIALS` + `SUCCESS` in login_history; 1× HIGH `ACCOUNT_LOCKOUT` alert; ACTIVE session; 1 live refresh token; USER_ONLINE activity event + online_users row.

## 6. Files changed

- New: `supabase/functions/auth/index.ts`, `_shared/{auth-users,password,lockout,refresh-tokens,sessions}.ts`.
- Edited: `_shared/envelope.ts` (Spring-faithful `ok` overloads).
- Deployed: `auth` on `dunijfrvfozwlykpkfhy` with `--no-verify-jwt`.

## 7. Notes / next

- Email sending (password reset / HR notification) still requires an SMTP provider — the functions persist state and audit trails but do not send mail yet. Decision needed in Phase 10/AI or ops.
- The `auth` function and `spike` currently share `_shared` via bundled uploads (Supabase CLI bundles imported `_shared` per function — verified working).
- Next: **Phase 3 (RBAC/security middleware)** — central auth guard + permission checks reused by every module function, plus the CORS/JWT/IP helper consolidation.
