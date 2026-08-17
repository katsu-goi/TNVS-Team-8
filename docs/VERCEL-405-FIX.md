# Vercel 405 Login Fix — Runbook

> **Symptom:** Login fails with `Request failed with status code 405` on the
> deployed Vercel frontend (e.g. `https://tnvs-team-8-rho.vercel.app`).

## Root cause (verified from the deployed bundle)

The deployed bundle was built **without** `VITE_API_BASE_URL` / `VITE_WS_BASE_URL`,
so Vite baked in the relative defaults:

```js
baseURL: "/api/v1"          // axios -> every call goes to the Vercel origin itself
"/ws-endpoint"              // WebSocket also relative
```

The browser then POSTs to `https://<vercel-app>/api/v1/auth/login`. Vercel only
serves static files for the SPA (rewrite `/(.*) -> /index.html`) and returns
**405 Method Not Allowed** for POSTs to static routes.

Two things are required, in order:

1. A **reachable always-on Spring Boot backend** must exist at a public URL.
2. The Vercel project must be **rebuilt with env vars** pointing at that backend.

---

## Step 1 — Deploy the backend (prerequisite)

Build and run the existing `backend/Dockerfile` on any always-on host
(Render / Railway / Docker VPS / AWS). Build locally:

```bash
cd backend
mvn clean package
docker build -t photonic-omega-backend .
```

Run with the required environment (values from your backend host dashboard):

```bash
docker run -d --name photonic-omega-backend \
  -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=supabase \
  -e SUPABASE_DB_URL='<supabase pooler jdbc url>' \
  -e SUPABASE_DB_USERNAME='<supabase db user>' \
  -e SUPABASE_DB_PASSWORD='<supabase db password>' \
  -e JWT_SECRET='<random string >= 32 bytes>' \
  -e AI_API_KEY_ENCRYPTION_KEY='<base64 32-byte key>' \
  -e CORS_ORIGINS='https://tnvs-team-8-rho.vercel.app' \
  -e FRONTEND_URL='https://tnvs-team-8-rho.vercel.app' \
  -e MAIL_HOST='smtp.gmail.com' \
  -e MAIL_USERNAME='<smtp user>' \
  -e MAIL_PASSWORD='<smtp password>' \
  -v facilities-files:/mnt/fileserver/facilities \
  photonic-omega-backend
```

Take note of the public backend origin, e.g. `https://backend-host.onrender.com`.
Verify it is up:

```
GET https://<BACKEND-HOST>/api/actuator/health   ->  {"status":"UP"}
```

> On Render/Railway you generally don't expose a port manually — the platform
> assigns a public HTTPS URL. Use that as `<BACKEND-HOST>`.

---

## Step 2 — Configure Vercel environment variables

In the Vercel dashboard for the project that serves `tnvs-team-8-rho.vercel.app`:

1. Go to **Project → Settings → Environment Variables**.
2. Add these **for the environment(s) the `tnvs-team-8-rho` alias serves**
   (usually Production, and Preview/Development if you deploy those):

```
VITE_API_BASE_URL       = https://<BACKEND-HOST>/api/v1
VITE_WS_BASE_URL        = https://<BACKEND-HOST>/api
VITE_SUPABASE_URL       = https://dunijfrvfozwlykpkfhy.supabase.co
VITE_SUPABASE_ANON_KEY  = <publishable anon key>
```

> `VITE_WS_BASE_URL` must include the backend context path `/api` — the SockJS
> endpoint is registered at `/ws-endpoint` under the `/api` servlet context, so
> the browser connects to `wss://<BACKEND-HOST>/api/ws-endpoint`.

> Vite inlines `VITE_*` variables at **build time** — a fresh build is mandatory
> after changing them. There is no runtime override.

---

## Step 3 — Redeploy

Trigger a redeploy from the linked GitHub repo
(`katsu-goi/TNVS-Team-8`, branch `main`, currently at `aec0390`).
This also replaces the stale bundle (which predates the env-driven WebSocket fix).

---

## Step 4 — Verify

1. Confirm the new bundle no longer contains the bare relative default:
   ```bash
   # Fetch the new /assets/index-*.js and search for baseURL
   # It should contain "https://<BACKEND-HOST>" (or similar absolute URL).
   ```
2. Confirm the WebSocket stores use `VITE_WS_BASE_URL` (already fixed in `main`).
3. Log in → REST calls → WebSocket/STOMP topics → uploads.

---

## Security reminders

- Backend secrets (`SUPABASE_DB_PASSWORD`, `JWT_SECRET`, `AI_API_KEY_ENCRYPTION_KEY`,
  `MAIL_PASSWORD`, `SUPABASE_SERVICE_KEY`) live **only** on the backend host.
  Never add them to any Vercel/`.env`/`VITE_*` variable.
- Restrict `CORS_ORIGINS` to the real frontend origin(s) — never `*`
  (the backend uses credentialed auth).

---

## Verification status

- **Verified from the codebase:** root cause (relative `baseURL` in the deployed
  bundle), the stale pre-fix `dashboardStore`, and that latest `main` contains
  the env-driven fix.
- **Not verified from the codebase:** the actual backend host, the live deploy,
  DNS, WebSocket/SMTP/AI delivery, and login end-to-end — these require the real
  deployment per this runbook.