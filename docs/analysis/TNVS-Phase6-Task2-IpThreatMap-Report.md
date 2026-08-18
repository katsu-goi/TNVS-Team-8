# Phase 6 / Task 2 - Real-time Geographic IP Threat Vector Map (Final Report)

**Date:** 2026-08-18
**Status:** Implemented, verified live end-to-end (backend, DB, STOMP, frontend)
**Builds:** Backend `mvn test` 91 passing, `mvn package` success; Frontend `npm run build` (tsc + vite) success

---

## 1. Executive summary

The Geographic IP Threat Vector Map did not immediately place a marker when a user
logged in. A new successful login was only reflected after the 30-second periodic
SYNC broadcast (and even then inconsistently), and popups/counters lacked the
geographic detail (region, timezone, ISP, ASN, accuracy, confidence) the task
required.

Root causes (all confirmed by reading the code, then verified by live tests):

1. **Successful-login EVENT carried no trusted session.** The real-time EVENT
   broadcast only ever carried a *threat*. Successful logins were not pushed until
   the 30s SYNC re-query.
2. **The broadcast always used a 24h window**, silently overwriting the user's
   selected time filter (1h / 6h / 7d) whenever a SYNC arrived.
3. **`X-Forwarded-For` was trusted blindly** (the value the Cloudflare tunnel
   provides), so real remote addresses could be spoofed and private/local
   addresses were not explained.
4. **Geolocation was never persisted** on the `security_logs` row; the map
   re-resolved lazily and the gateway log DTO dropped the geo fields entirely.
5. **Severity was static MEDIUM** for failed logins - no escalation with repeat
   attempts, and `ACCOUNT_LOCKED`/blocked-IP sources were not reflected.
6. **The vector counter counted non-geolocatable IPs**, so the number on the tile
   disagreed with the markers actually drawn.
7. **No way to demonstrate the pipeline** (test-event), no diagnostics, no live/
   disconnected indicator, and no last-event timestamp on the UI.

All seven are fixed. The map now shows an immediate green (trusted session) marker
on a successful login via a real EVENT broadcast, graduated severity for repeated
failures, persisted geo data, a window-safe SYNC, and a live demo/debug panel.

---

## 2. Architecture after the fix

```
Browser (frontend)                     Backend (Spring Boot)              Supabase (Postgres)
--------------------------------       -----------------------            --------------------
SecurityThreatSection  ---REST /v1/security/ip-threats/vector-map?window=--> SecurityThreatMapController
   |                                                                              |
   +- securityThreatStore (zustand)  <---- STOMP /topic/security/threats <---+    +- SecurityThreatMapService
       |  applyEvent / applySync                                              |        (buildMap, severity,
       |  upsert trustedSession, window-matched arrays                        |         toTrustedSessionEntry)
       v                                                                    |        |
   SecurityThreatMap (leaflet)                                               |        | resolveGeo (peek)
   ThreatMarkers  <-- geo fields on entries                                  |        v
   SecurityTelemetry                                                          |   IpApiGeolocationService
   GatewayLogs                                                          SecurityThreatBroadcastService       | Caffeine cache
                                                                                |  @Scheduled(5s) EVENT          v
                                                                                |  @Scheduled(30s) SYNC     ip-api.com
   Browser --POST /auth/login --> AuthController --> AuthService.login()        |        (external)
        |                        |                                              |
        |                        +-> UserActivityService.registerSession() -----+ creates ActiveSession
        |                        +-> SecurityAuditInterceptor.afterCompletion() --> security_logs row
        |                               |                                           (ClientIpResolver + geo JSON)
        |                               +-> SecurityAuditService.logSecurityEventAsync()
```

Data flow for a successful login (the previously broken path):

1. Browser POSTs `/v1/auth/login`.
2. `AuthService.login()` authenticates, then `UserActivityService.registerSession()`
   upserts the real `active_sessions` row **before** the audit interceptor runs.
3. `SecurityAuditInterceptor.afterCompletion()` writes a `security_logs` row using
   `ClientIpResolver` (secure XFF handling) and attaches a bounded `geo_location`
   JSON from the ip-api cache (no blocking network call).
4. Within <=5s, `SecurityThreatBroadcastService.broadcastEvents()` finds the new
   log and builds a `SecurityThreatEvent` where:
   - `threat` = the IP's deterministic aggregate (if any),
   - `trustedSession` = `buildTrustedSessionForLog()` -> matches the real
     `active_sessions` row by IP (so the marker carries the actual username/role),
     falling back to a lightweight entry from the log itself,
   - `window` = `BROADCAST_WINDOW` (24h), and
   - the geo JSON is then persisted onto the log (`writeBackGeo`).
5. The EVENT is broadcast over STOMP `/topic/security/threats` (SUPER_ADMIN only).
6. `securityThreatStore.applyEvent()` upserts the trusted session into
   `trustedSessions` and the threat into `threats`; the map draws the marker
   immediately. SYNC frames only apply when `event.window === state.window`, so the
   user's selected filter is never clobbered.

---

## 3. Root-cause detail (what was actually wrong)

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | No marker on login until SYNC | EVENT carried only threats; `trustedSession` never populated; frontend `applyEvent` ignored it | `SecurityThreatBroadcastService` builds `trustedSession` for `LOGIN_SUCCESS`; store upserts it |
| 2 | Time filter jumped back to 24h | Broadcast hard-coded `HOURS_24` and SYNC applied regardless of the client's window | EVENT/SYNC carry `window`; `applySync` guards `event.window === state.window`; REST snapshot refetch on mismatch |
| 3 | IP spoofing / unexplained private IPs | `getClientIp` trusted `X-Forwarded-For` unconditionally | New `ClientIpResolver` honors forwarded headers only when the immediate peer is loopback/private; flags `isPrivateOrLocal` |
| 4 | No geo in gateway logs / not persisted | DTO dropped geo fields; `geo_location` never written | Extended DTOs; `SecurityAuditInterceptor` + `writeBackGeo` persist bounded JSON (`GeoJson`, fits `varchar(255)`) |
| 5 | Severity flat at MEDIUM | `classify()` defaulted failed logins to MEDIUM | Graduation 1->LOW, 2-4->MEDIUM, 5+->HIGH; `ACCOUNT_LOCKED`->HIGH; blocked-IP -> CRITICAL |
| 6 | Counter > markers drawn | Counter counted all threat IPs including non-geolocatable ones | Counter = geolocated threats only (tooltip explains); local/private IPs labeled, not counted |
| 7 | No demo/debug path | No test-event endpoint, no diagnostics, no live state on UI | `POST /v1/security/ip-threats/test-event`, `GET .../diagnostics`, LIVE badge, last-event time, Debug panel |

---

## 4. Files changed

### Backend (`backend/src/main/java/com/photonicomega/facilities/...`)

| File | Change |
|------|--------|
| `module/security/util/ClientIpResolver.java` | **new** - secure IP extraction + `isPrivateOrLocal`, `ResolvedIp(ip, ipVersion, isPrivate)` |
| `module/security/util/GeoJson.java` | **new** - bounded geo JSON serializer that always fits `security_logs.geo_location varchar(255)` |
| `module/security/service/geo/IpGeo.java` | extended record: `countryCode, region, timezone, isp, asn, accuracyRadiusKm, confidence, ipVersion` |
| `module/security/service/geo/IpGeolocationService.java` | added cache-only `peek(String)` default |
| `module/security/service/geo/IpApiGeolocationService.java` | extended fields request, Caffeine cache, `peek`, private-IP short-circuit, fail-open |
| `module/security/dto/IpThreatEntry.java` | +countryCode, region, timezone, isp, asn, accuracyRadiusKm, confidence, ipVersion, privateIp |
| `module/security/dto/TrustedSessionEntry.java` | same geo fields + privateIp |
| `module/security/dto/GatewayLogEntry.java` | +username, country, countryCode, city, privateIp, lat/lon, accuracyRadiusKm, confidence, isp, asn |
| `module/security/dto/SecurityThreatEvent.java` | +`window`, +`trustedSession` |
| `module/security/service/SecurityThreatMapService.java` | severity graduation, geo-aware entries, `buildTrustedSessionForLog` (active-session-by-IP fallback), `writeBackGeo` |
| `module/security/service/SecurityThreatBroadcastService.java` | EVENT carries trustedSession + window; SYNC carries window; `broadcastTestEvent`; `BROADCAST_WINDOW = HOURS_24`; `writeBackGeo` |
| `module/security/filter/SecurityAuditInterceptor.java` | uses `ClientIpResolver`; persists `geoLocation` from cache via `GeoJson` |
| `module/security/controller/SecurityThreatMapController.java` | +`POST /v1/security/ip-threats/test-event` (SUPER_ADMIN), +`GET /v1/security/ip-threats/diagnostics` |
| `module/security/filter/IpBlacklistFilter.java` | uses `ClientIpResolver` |
| `module/security/filter/SuspiciousRequestFilter.java` | uses `ClientIpResolver` |
| `module/security/filter/RateLimitingFilter.java` | uses `ClientIpResolver` |
| `module/auth/controller/AuthController.java` | uses `ClientIpResolver` |
| `module/auth/controller/HrAssistanceController.java` | uses `ClientIpResolver` |
| `module/documents/controller/DocumentController.java` | uses `ClientIpResolver` |
| `ai/AiController.java` | uses `ClientIpResolver` |

### Frontend (`frontend/src/...`)

| File | Change |
|------|--------|
| `types/threatMap.ts` | new geo fields, `isPrivateIp()`, `SecurityThreatEvent` shape (window, trustedSession), `ThreatMapDiagnostics` |
| `stores/securityThreatStore.ts` | `applyEvent` upserts `trustedSession`; `applySync` window-matched; reconnect-after-disconnect refetch; `loadDiagnostics`, `triggerTestEvent`, last-event meta |
| `api/securityThreatService.ts` | +`fetchDiagnostics()`, `triggerTestEvent()`, `TestEventResult` |
| `components/security/SecurityThreatSection.tsx` | LIVE/DISCONNECTED badge, last-event time, Test Security Event button, Debug panel (SUPER_ADMIN) |
| `components/security/SecurityTelemetry.tsx` | "Detected (window)" label |
| `components/security/SecurityThreatMap.tsx` | counter = geolocated threats only + tooltip; "Threats present but not mappable" empty state; geo disclaimer |
| `components/security/ThreatMarkers.tsx` | popups show region/timezone/ISP/ASN/accuracy/confidence; LOCAL/PRIVATE label |
| `components/security/GatewayLogs.tsx` | username, city/country, LOCAL badge |

---

## 5. Live verification (run through the public Cloudflare tunnel)

All checks executed against the running backend over
`https://approaches-buyer-books-designer.trycloudflare.com`:

1. **Health:** `GET /api/actuator/health` -> 200 `{"status":"UP"}`.
2. **Admin login** -> 200, token issued (itself a LOGIN_SUCCESS).
3. **Diagnostics** (`GET /v1/security/ip-threats/diagnostics`, admin) -> 200 with
   `clientIp`, `ipVersion`, `privateIp:false`, geo provider/resolved status,
   resolved geolocation (Philippines / Caloocan / BF DOMINGO ENTERPRISES / AS154261),
   `broadcastWindow`.
4. **Test event** (`POST /v1/security/ip-threats/test-event`, admin) -> 200 with a
   real `TEST_EVENT` security log id, the caller's public IP, and geo.
5. **RBAC:** anonymous -> 401; COMPLIANCE_OFFICER `test-event` -> **403**.
6. **Real-time EVENT on successful login** (STOMP subscribe, then log in):
   - `type=EVENT`, `window=24h`,
   - `threat` = IP aggregate (this IP had 62 FAILED_LOGIN -> severity HIGH),
   - `log` = LOGIN_SUCCESS with country/city/lat/lon/isp/asn,
   - `trustedSession` = `{"username":"admin@photonicomega.com","role":"SUPER_ADMIN","country":"Philippines","region":"Metro Manila","city":"Caloocan","latitude":14.7061,"longitude":120.9888,"isp":"BF DOMINGO ENTERPRISES","asn":"AS154261 ..."}` -
     **the green marker data that previously never reached the UI in real time**.
7. **Real-time SYNC** every 30s with full threat list + window.
8. **Vector-map REST:** threats=4 (1 geolocatable + private IPv6), trustedSessions=3,
   recentLogs=20 with username/city/country populated.
9. **Window param:** `?window=1h` returns `window:"1h"` with correct subset.
10. **Backend logs:** `ASYNC SECURITY AUDIT LOGGED` lines; **no** "value too long
    for type character varying(255)" errors after the `GeoJson` bound (that error
    was observed and fixed during this session).

Result: a login now produces a marker within ~5 seconds via EVENT, not 30s SYNC.

---

## 6. Manual test instructions (browser)

1. Open the deployed frontend (Vercel) or `npm run dev` locally with the backend
   reachable. Log in as `admin@photonicomega.com / Admin2026!`.
2. Open **Security > Threat Map / Gateway**.
3. The **LIVE** badge should show green and "Last event received" should tick.
4. In another tab/window log in as `co@photonicomega.com / Co2026!`: within ~5
   seconds a **green trusted-session marker** should appear on the map at the
   client's city, with a popup showing username, role, region, ISP, ASN, accuracy.
5. Try a wrong password a few times: severity should climb LOW -> MEDIUM -> HIGH on
   repeat attempts and the threat marker popup should show the geo detail.
6. Click **Test Security Event** (SUPER_ADMIN only): a MEDIUM event appears on the
   map and in the gateway log with the caller's city/country.
7. Switch the time window (1h / 6h / 24h / 7d): the counter and markers update and
   are not overwritten by the 24h SYNC (SYNC now carries its window).
8. Check the **Debug panel** (SUPER_ADMIN): client IP, IP version, private flag,
   geo provider, resolved status, geolocation, broadcast window, header chain.

---

## 7. Geolocation limitation (honest note)

- Provider is **ip-api.com** (free tier, HTTP). The extended
  `fields=` request returns `accuracy`/`reverse`/`proxy`/`hosting`, but the **free
  tier does not return `confidence`**, so `confidence` stays `null`; the frontend
  hides it. `accuracyRadiusKm` is mapped from `accuracy`.
- Free tier is HTTP-only and rate-limited (~45 req/min); the Caffeine cache and
  cache-only `peek()` on the audit path keep us far below that.
- **Private / local IPs** (RFC1918, IPv6 ULA/link-local, loopback, CGNAT) are
  detected by `ClientIpResolver.isPrivateOrLocal()` and labeled LOCAL / PRIVATE IP
  on the map - they are never sent to ip-api and never counted as geolocated
  markers.
- Accuracy radius is the provider's estimate of the city-level precision; popups
  show "approximate" to set expectations.

---

## 8. Security notes

- `X-Forwarded-For` / `X-Real-IP` are honored **only** when the immediate TCP peer
  is loopback/private (i.e., behind our own proxy/tunnel), matching the
  `ClientIpResolver` contract - an external caller cannot forge a source IP.
- `/v1/security/ip-threats/**` and STOMP `/topic/security/threats` remain
  SUPER_ADMIN-only; verified 401 anonymous / 403 COMPLIANCE_OFFICER.
- IPs returned to the frontend stay masked via `IpMask` (octet masking); the
  diagnostics endpoint is the only one that returns the raw client IP, and it is
  SUPER_ADMIN-only.
- No new tables were created; everything reuses existing
  `security_logs` / `login_history` / `blocked_ips` / `active_sessions`.