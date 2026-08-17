# Photonic Omega — Deployment Guide

This document describes how the Photonic Omega Facilities Management System is
deployed across three environments and how to take it from local development to
a production `.com` domain.

**Key fact:** the Spring Boot backend is an always-on JVM service (Java 21,
embedded Tomcat, port 8080, context path `/api`). It **cannot and must not** be
deployed to Vercel/Netlify or converted to serverless. Vercel is used **only**
as a frontend testing/staging host.

---

## 1. Environment Matrix

| | Local (Development) | Vercel (Staging/Test) | Production |
|---|---|---|---|
| Frontend | `http://localhost:5173` (Vite dev) | `https://photonic-omega.vercel.app` | `https://example.com` / `www.example.com` |
| Backend | `http://localhost:8080` | Test backend (always-on host) | `https://api.example.com` (always-on host) |
| Database | Local Postgres or Supabase | Separate Supabase test project (recommended) | Supabase production project |
| WebSocket | `ws://localhost:8080/api/ws-endpoint` (via Vite proxy) | `wss://<TEST-BACKEND>/api/ws-endpoint` | `wss://api.example.com/api/ws-endpoint` |

> The exact domains are placeholders. Replace `API-TEST-DOMAIN`, `example.com`
> and `api.example.com` with the real values once configured. No application
> code should contain real URLs — only environment variables.

---

## 2. Architecture

### 2.1 Testing / Staging

```text
User
 ↓
Vercel (https://photonic-omega.vercel.app)
 ↓  React frontend (static SPA)
 ↓  REST:   VITE_API_BASE_URL=https://API-TEST-DOMAIN/api/v1
 ↓  STOMP:  VITE_WS_BASE_URL=https://API-TEST-DOMAIN   →  /ws-endpoint
 ↓
Test Backend — Spring Boot, always-on host (Docker/VPS/Render/Railway)
 ↓
Supabase PostgreSQL (separate test project recommended)
```

### 2.2 Production

```text
User
 ↓
https://example.com  (and www.example.com) — Vercel custom domain
 ↓  React frontend
 ↓  REST:   VITE_API_BASE_URL=https://api.example.com/api/v1
 ↓  STOMP:  VITE_WS_BASE_URL=https://api.example.com   →  /ws-endpoint
 ↓
Production Backend — https://api.example.com — Spring Boot, always-on host
 ↓
Supabase PostgreSQL (production project)
```

The frontend talks to the backend purely over HTTP REST + STOMP WebSocket using
env-configured base URLs. They are not coupled beyond that contract.

---

## 3. Frontend Environment Configuration

Vite embeds `VITE_*` variables into the bundle at **build time**. Any change
requires a new build. Values are configured via `.env` files locally and via
the Vercel dashboard for staging/production. Nothing is hardcoded in source.

Reference: `frontend/.env.example` and `frontend/.env.production.example`.

| Variable | Local | Vercel/Staging | Production |
|---|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | `https://API-TEST-DOMAIN/api/v1` | `https://api.example.com/api/v1` |
| `VITE_WS_BASE_URL` | *(empty — dev proxy)* | `https://API-TEST-DOMAIN` | `https://api.example.com` |
| `VITE_SUPABASE_URL` | `https://dunijfrvfozwlykpkfhy.supabase.co` | same | same |
| `VITE_SUPABASE_ANON_KEY` | publishable key | publishable key | publishable key |

- **Local dev** relies on the Vite dev proxy (`vite.config.ts`): `/api`, `/v1`
  and `/ws-endpoint` are forwarded to `http://localhost:8080`. Never use
  `localhost` URLs in a Vercel/staging/production build.
- All four frontend WebSocket stores read `VITE_WS_BASE_URL`:
  - `src/stores/realtimeSyncStore.ts`
  - `src/stores/notificationRealtimeStore.ts`
  - `src/stores/dashboardStore.ts`
  (`dashboardStore.ts` was the last store hardcoding `/ws-endpoint`; it now uses
  the env var like the others.)

---

## 4. Backend Environment Configuration

The backend is configured through environment variables (defaults in
`backend/src/main/resources/application.yml`). The active profile defaults to
`supabase` (`SPRING_PROFILES_ACTIVE`).

### Required secrets (backend host only — never in the frontend)

| Variable | Purpose | Default |
|---|---|---|
| `SUPABASE_DB_URL` | JDBC URL to Supabase Postgres | pooler URL for `dunijfrvfozwlykpkfhy` |
| `SUPABASE_DB_USERNAME` | DB user | `postgres.dunijfrvfozwlykpkfhy` |
| `SUPABASE_DB_PASSWORD` | DB password | *(empty — required)* |
| `JWT_SECRET` | HS256 signing secret | placeholder — **replace with random ≥32-byte value** |
| `AI_API_KEY_ENCRYPTION_KEY` | AES-256-GCM key (base64, 32 bytes) | *(empty — app fails fast without it)* |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | SMTP credentials | `noreply@photonicomega.com` / `changeme` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | `your-service-key` |
| `SUPABASE_ANON_KEY` | Supabase anon key | *(empty)* |
| `AI_ENABLED`, `LLAMA_API_URL`, `QWEN_API_URL`, `LLAMA_MODEL`, `QWEN_MODEL`, `EMBEDDING_MODEL` | AI endpoints/models | Ollama defaults |

### Configuration (not secret)

| Variable | Local | Staging | Production |
|---|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `local` or `supabase` | `supabase` | `supabase` |
| `CORS_ORIGINS` | `http://localhost:[*],http://127.0.0.1:[*]` | `https://photonic-omega.vercel.app` | `https://example.com,https://www.example.com` |
| `FRONTEND_URL` | `http://localhost:5173` | `https://photonic-omega.vercel.app` | `https://example.com` |
| `FILE_STORAGE_URL` | `http://localhost:8080/api/files` | `https://API-TEST-DOMAIN/api/files` | `https://api.example.com/api/files` |
| `FILE_STORAGE_PATH` | `/mnt/fileserver/facilities` or temp | persistent volume | persistent volume |
| `BACKUP_STORAGE_PATH` | temp | persistent volume | persistent volume |
| `SUPABASE_URL` | `https://your-project.supabase.co` | test project URL | production project URL |
| `SUPABASE_BUCKET` | `facilities-documents` | test bucket | production bucket |
| `HR_CONTACT_EMAIL` | *(optional)* | *(optional)* | real HR email |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_DURATIONS`, `LOGIN_PERMANENT_LOCK_DAYS` | defaults | defaults | tune as needed |

> **Never** put `SUPABASE_DB_PASSWORD`, `JWT_SECRET`, `AI_API_KEY_ENCRYPTION_KEY`,
> `MAIL_PASSWORD`, or `SUPABASE_SERVICE_KEY` in any Vite/`.env`/`VITE_*` file.

---

## 5. CORS

Spring Boot reads `CORS_ORIGINS` (comma-separated) in
`backend/src/main/java/com/photonicomega/facilities/security/SecurityConfig.java`.
It uses origin **patterns** with `allowCredentials(true)`, so:

- a bare `*` is invalid — always list explicit origins
- multiple origins are supported

```text
Staging: CORS_ORIGINS=https://photonic-omega.vercel.app
Prod:    CORS_ORIGINS=https://example.com,https://www.example.com
```

---

## 6. WebSocket / STOMP

The frontend connects **directly** to the backend WebSocket endpoint
(`/ws-endpoint`, SockJS + STOMP, `/api` context path → `wss://host/api/ws-endpoint`).
The endpoint is publicly reachable and JWT-validated in the STOMP `CONNECT`
frame.

```text
Staging: wss://API-TEST-DOMAIN/api/ws-endpoint
Prod:    wss://api.example.com/api/ws-endpoint
```

Vercel cannot proxy WebSockets to an external backend reliably, so always use
absolute `VITE_WS_BASE_URL` values in staging/production builds.

---

## 7. Docker (Backend)

A `backend/Dockerfile` builds the runnable container:

```bash
cd backend
docker build -t photonic-omega-backend .
docker run -d --name photonic-omega-backend \
  -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=supabase \
  -e SUPABASE_DB_PASSWORD='...' \
  -e JWT_SECRET='...' \
  -e AI_API_KEY_ENCRYPTION_KEY='...' \
  -e CORS_ORIGINS='https://photonic-omega.vercel.app' \
  -e FRONTEND_URL='https://photonic-omega.vercel.app' \
  -e MAIL_USERNAME='...' \
  -e MAIL_PASSWORD='...' \
  -v facilities-files:/mnt/fileserver/facilities \
  -v facilities-backups:/var/tmp/facilities-backups \
  photonic-omega-backend
```

Health check: `GET /api/actuator/health` → `{"status":"UP"}`.

---

## 8. DNS Configuration

Once the `.com` domain is available, configure these records (provider-agnostic —
set them in whichever DNS provider hosts the domain):

| Record | Type | Target |
|---|---|---|
| `example.com` | A | `76.76.21.21` (Vercel) — or use Vercel's nameservers |
| `www.example.com` | CNAME | `cname.vercel-dns.com` |
| `api.example.com` | A | public IP of the backend server (VPS), or CNAME to your container host (Render/Railway) |

HTTPS/WSS is terminated at both ends (Vercel auto-provisions certs for the
frontend; the backend host/reverse-proxy — e.g. Caddy/Nginx/Traefik — handles
`api.example.com`).

---

## 9. Deployment Runbook

1. **Deploy the backend** as an always-on service (Docker host / VPS / Render /
   Railway / AWS). Build: `cd backend && mvn clean package` → run `java -jar
   target/facilities-management-1.0.0.jar` or the Docker image.
2. **Configure backend env vars** (see §4). Especially: `SUPABASE_DB_PASSWORD`,
   `JWT_SECRET`, `AI_API_KEY_ENCRYPTION_KEY`, `CORS_ORIGINS`, `FRONTEND_URL`.
3. **Verify backend health**: `GET https://API-TEST-DOMAIN/api/actuator/health`.
4. **Configure Vercel environment variables** (staging): `VITE_API_BASE_URL`,
   `VITE_WS_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. **Deploy the Vercel frontend** (`vercel.json` builds `frontend/dist`).
6. **Test REST API** from the deployed frontend.
7. **Test login/JWT** (access + refresh flow, role-based access).
8. **Test WebSocket/STOMP** (dashboard, subsystem health, notifications).
9. **Test file uploads** (100 MB cap, download with auth).
10. **Test scheduled jobs** (retention check 2 AM, contract expiry 8 AM, visitor
    cleanup 1 AM, realtime broadcasts 2s/3s/5s).
11. **Configure the `.com` domain** (DNS per §8) when ready.
12. **Change production env vars** (`CORS_ORIGINS`, `FRONTEND_URL`,
    `VITE_API_BASE_URL`/`VITE_WS_BASE_URL` to `api.example.com`).
13. **Deploy the production frontend**.
14. **Final production testing** (full pass + rollback plan).

---

## 10. Security

- Backend secrets (`JWT_SECRET`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_KEY`,
  `MAIL_PASSWORD`, `AI_API_KEY_ENCRYPTION_KEY`, AI provider credentials) exist
  **only** on the backend host. They are never exposed via Vite/`VITE_*` vars or
  committed to Git.
- The frontend bundle only contains public values (`VITE_API_BASE_URL`,
  `VITE_WS_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Use HTTPS/WSS everywhere; restrict `CORS_ORIGINS` to the real frontend origin
  (never `*` with credentials).
- Use a strong random `JWT_SECRET` (≥32 bytes).
- Use a **separate Supabase test project** for staging so test data never mixes
  with production data.

---

## 11. Verification Status

Verified from this repository:

- Frontend builds cleanly (`npm run build` in `frontend`).
- Backend builds cleanly (`mvn package` in `backend`).
- All frontend WebSocket stores are env-driven (`VITE_WS_BASE_URL`).
- CORS is env-driven and multi-origin capable.
- Secrets are not committed to Git.

**Not verified from the codebase** (requires the actual deployment):

- Live Vercel deployment and domain routing.
- Live backend host, DNS records, and HTTPS/WSS termination.
- Real WebSocket/STOMP connectivity end-to-end.
- SMTP and AI provider delivery against the hosted environment.
- Scheduled-job execution against the hosted environment.