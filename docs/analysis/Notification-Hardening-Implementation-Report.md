# Notification System — Hardening Implementation Report

**Date:** 2026-08-15
**Scope:** Complete and harden the existing notification system (spec item 4 of the 2026-08-04 integration analysis).
**Baseline:** The read-only audit delivered separately found the system MOSTLY WORKING (per-user REST notifications real, realtime NOT implemented, admin feed read-only with no writer, seeded demo notifications present).

---

## 1. Executive Summary

The notification system is now fully functional end-to-end:

- **Per-user notifications** are created by real business events (request submission, approval, rejection, completion, cancellation; visitor arrival) and delivered to exactly the owning user over REST **and** STOMP.
- **Realtime** per-user delivery works: a decision by an officer reaches the requester's browser in ~112 ms (verified live, target < 1 s).
- **Admin notifications** are now written per-admin for real system events (HIGH/CRITICAL security alerts, AI provider OFFLINE transitions) and delivered per-admin over REST **and** STOMP, with read state scoped to each SUPER_ADMIN.
- **No seeded notifications** remain. The `BootstrapAdmin` demo-notification block was removed; notifications are created only by genuine business events.
- **DB is the source of truth.** Realtime is best-effort (never throws); the 30 s polling fallback reconciles anything missed, proven live by the WebSocket-disconnect test.
- Legacy dead bell removed. One shared, realtime-aware `NotificationBell` is used by every layout.
- New **request review workflow** (approve / reject / complete) was implemented to make the request-status notifications reachable end-to-end (the audit confirmed no such flow existed).

All 70 backend tests pass, the frontend production build passes, and 17/17 live E2E checks pass against the running server.

---

## 2. Verification Matrix (12 required rows)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | **Submission** | **PASS** | Employee `POST /v1/employee/requests` → 200; `GET /v1/employee/notifications` contains `INFO` "Request submitted" row with `relatedEntityId` = new request. |
| 2 | **Approval** | **PASS** | Contract Officer `POST /v1/requests-review/{id}/approve` → 200; requester's list contains `APPROVAL` row. |
| 3 | **Rejection** | **PASS** | `POST /v1/requests-review/{id}/reject` with reason → `REJECTION` row whose message includes the reason text. |
| 4 | **Completion** | **PASS** | `POST /v1/requests-review/{id}/complete` (approved request) → `COMPLETED` row. |
| 5 | **Cancellation** | **PASS** | Employee `POST /v1/employee/requests/{id}/cancel` → `CANCELLED` row. |
| 6 | **Realtime** | **PASS** | STOMP `CONNECT` (JWT) → subscribe `/user/queue/notifications`; approval pushed to requester in **112 ms** (< 1000 ms target). Admin `AI_PROVIDER` push in **115 ms**. |
| 7 | **Read** | **PASS** | `POST /v1/employee/notifications/{id}/read` → persisted (`read=true` on reload); admin `PUT /v1/admin/notifications/{id}/read` updates only the current admin's count. |
| 8 | **Multiple users** | **PASS** | Employee cannot read admin notifications (403); officer cannot read employee notifications (403); with requester + admin both connected, an approval reaches ONLY the requester's queue (no leak to admin). |
| 9 | **WebSocket disconnect** | **PASS** | Approval fired while employee STOMP disconnected; on reconnect the row is present via REST (DB source of truth; polling fallback reconciles). |
| 10 | **No seed notifications** | **PASS** | Fresh (restarted) DB: `GET /v1/employee/notifications` = `[]`, `GET /v1/admin/notifications` = `[]`. `BootstrapAdmin` demo-notification block removed. |
| 11 | **Frontend build** | **PASS** | `npm run build` (tsc + vite) — clean. |
| 12 | **Backend build** | **PASS** | `mvn test` — 70 tests, 0 failures; `mvn -DskipTests package` produces runnable jar. |

**Summary: 12 / 12 PASS.** Live E2E (additional checks): 17 / 17 PASS.

---

## 3. What Changed

### 3.1 Request status notifications (Spec 1–2)
- `RequestStatus` gained `COMPLETED`; `NotificationType` gained `COMPLETED`, `CANCELLED`.
- `EmployeeService.cancelRequest` now notifies the requester (`CANCELLED`).
- **New** `RequestReviewService` / `RequestReviewController` (`/v1/requests-review`): pending list, approve, reject (optional reason stored in `decisionNotes`), complete. Role-and-type scoped: CONTRACT → CONTRACT_OFFICER, LEGAL → LEGAL_OFFICER, SUPER_ADMIN → both; each decision persists the status and notifies the requester (`APPROVAL` / `REJECTION` / `COMPLETED`).
- Review UI: `RequestReviewPage` + routes under `/legal/requests-review` and `/procurement/requests-review` + nav items (Legal / Contract Officer layouts), backed by `requestReviewService.ts`.

### 3.2 Realtime per-user delivery (Spec 3, 5, 6)
- **New** `StompAuthChannelInterceptor`: every STOMP `CONNECT` is validated against the JWT (`Authorization: Bearer …`), principal = email.
- `WebSocketConfig`: user destination prefix `/user` + inbound-channel interceptor.
- **New** `RealtimeNotificationPublisher`: `publishToUser` → `/queue/notifications`, `publishToAdmin` → `/queue/admin-notifications`; strictly best-effort (never throws; WARN on failure) so a broker outage cannot roll back the business transaction that persisted the notification.
- `EmployeeService.notify` persists first, then publishes. `VisitorVerificationService.notifyHostOfArrival` also publishes.
- Frontend: `notificationRealtimeStore` (JWT STOMP client, revision counter), rewritten `NotificationBell` (realtime prepend + unread bump, click-to-navigate, COMPLETED/CANCELLED dot colours, 30 s polling fallback retained), JWT `connectHeaders` added to `realtimeSyncStore` / `dashboardStore`, legacy dead bell and `/topic/dashboard/notifications` subscription removed from `AppLayout` / `dashboardStore`.

### 3.3 Per-admin admin notifications (Spec 7–12)
- `AdminNotification` gained nullable `recipient` (User), `relatedEntityType`, `relatedEntityId`; `recipient` is `@JsonIgnore`d from the entity serialization to avoid lazy-proxy 500s.
- `AdminNotificationRepository`: `findVisible(recipientId)`, `countUnread(recipientId)` (per-admin); aggregate `countByReadFalse()` retained for dashboard metrics.
- **New** `AdminNotificationService.notifyAdmins`: one row per SUPER_ADMIN + per-admin realtime publish.
- Hooks (real events only, nothing fabricated): `SecurityAuditService.createSecurityAlert` notifies admins for HIGH/CRITICAL; `AiStateManagementService.updateProviderHealth` notifies admins only on CONNECTED → OFFLINE transitions (no duplicate on repeated-offline, none on recovery).
- `NotificationController` (`/v1/admin/notifications`) scoped to the current admin.

### 3.4 Removal of seeded notifications
- `BootstrapAdmin.seedEmployeeSampleData` notification block removed; replaced with a note that notifications come only from real business events.

---

## 4. Deviations / Decisions

1. **Request review flow added.** The task spec assumed review statuses existed; the audit confirmed the review workflow did not. Per user approval, the flow was implemented so approval/rejection/completion notifications are reachable end-to-end.
2. **Per-admin recipient model.** Admin notifications carry a `recipient_id`; read state is per SUPER_ADMIN (confirmed by the user over the alternative shared-row model).
3. **Admin event hooks** limited to HIGH/CRITICAL security alerts + AI provider OFFLINE transitions (per user decision — real events only).
4. **H2 test profile** retains its existing `BootstrapAdmin` role/user/request seeds; only the *notification* seed was removed, matching the spec's "no seeded notifications" requirement.

## 5. Files Changed

**Backend (new):**
- `security/StompAuthChannelInterceptor.java`
- `notification/RealtimeNotificationPublisher.java`
- `module/employee/service/RequestReviewService.java`
- `module/employee/controller/RequestReviewController.java`
- `module/admin/service/AdminNotificationService.java`
- Tests: `module/notification/NotificationFlowTest.java`, `notification/RealtimeNotificationPublisherTest.java`

**Backend (changed):**
- `config/WebSocketConfig.java`, `config/BootstrapAdmin.java`
- `module/employee/domain/RequestStatus.java`, `NotificationType.java`
- `module/employee/service/EmployeeService.java`
- `module/visitor/service/VisitorVerificationService.java`
- `module/admin/domain/AdminNotification.java`, `repository/AdminNotificationRepository.java`, `controller/NotificationController.java`
- `module/auth/repository/UserRepository.java`
- `module/security/service/SecurityAuditService.java`
- `ai/AiStateManagementService.java`

**Frontend (new):**
- `src/stores/notificationRealtimeStore.ts`
- `src/api/requestReviewService.ts`
- `src/components/requests/RequestReviewPage.tsx`
- `scripts/e2e-notifications.mjs` (live E2E harness)

**Frontend (changed):**
- `src/api/notificationService.ts`
- `src/components/ui/NotificationBell.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/stores/realtimeSyncStore.ts`, `src/stores/dashboardStore.ts`
- `src/components/legal/LegalOfficerLayout.tsx`, `src/components/procurement/ProcurementOfficerLayout.tsx`, `src/App.tsx`

## 6. How to Re-run the Verification

```powershell
# Backend unit/integration tests
C:\tools\apache-maven-3.9.9\bin\mvn.cmd test      # (in backend/)

# Frontend build
npm run build                                       # (in frontend/)

# Live E2E (requires the backend running on :8080 with the test profile)
#   Start: java -jar target/facilities-management-1.0.0.jar --spring.profiles.active=test
node scripts/e2e-notifications.mjs                  # (in frontend/)
```
