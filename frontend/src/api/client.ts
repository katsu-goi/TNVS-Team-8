import axios, { AxiosError } from 'axios';

const DEFAULT_SUPABASE_PROJECT_URL = 'https://dunijfrvfozwlykpkfhy.supabase.co';

export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && !envUrl.includes('trycloudflare.com')) {
    return envUrl;
  }
  // `.env` is gitignored (`.env*` in the root .gitignore), so a fresh clone has
  // only `.env.example` and this variable is undefined the first time anybody runs
  // `npm run dev`. Falling through to the Supabase project below would point a
  // developer's browser - including its login attempts - at the deployed backend,
  // while `vite.config.ts` proxies /api, /v1 and /ws-endpoint to localhost:8080 and
  // nothing ever uses them. `/api/v1` is exactly what the LOCAL DEVELOPMENT block of
  // `.env.example` tells you to copy in, so this makes the documented default the
  // actual default. DEV is false in any production build, so deployments are
  // unaffected.
  if (import.meta.env.DEV) {
    return '/api/v1';
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_PROJECT_URL;
  return `${supabaseUrl}/functions/v1`;
};

const API_BASE_URL = getApiBaseUrl();

// Components call safeFetchJson with module-relative paths like
// `/api/v1/compliance/documents`. The axios client already prefixes
// VITE_API_BASE_URL (e.g. https://BACKEND-HOST/api/v1 or Supabase Edge Functions),
// so resolve these against the same base — otherwise native fetch targets window.location.origin
// (the Vercel host in staging) instead of the backend.
function resolveApiUrl(url: string): string {
  const base = getApiBaseUrl();
  if (url.startsWith('/api/v1')) {
    return `${base}${url.slice('/api/v1'.length)}`;
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return url;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

const attachToken = (config: any) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

apiClient.interceptors.request.use(attachToken);

const AUTH_ROUTES = ['/login'];

/**
 * Requests that must never trigger a refresh attempt.
 *
 * `/auth/refresh` for the obvious reason - refreshing in response to a failed refresh
 * is an infinite loop. `/auth/login` because a 401 there means the password was wrong,
 * not that a session lapsed, and `/auth/logout` because the session is being ended
 * deliberately.
 */
const REFRESH_EXEMPT = ['/auth/login', '/auth/refresh', '/auth/logout'];

function endSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  if (!AUTH_ROUTES.some(r => window.location.pathname.startsWith(r))) {
    window.location.href = '/login';
  }
}

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Exchanges the stored refresh token for a fresh access token. At most one exchange is
 * in flight at a time; concurrent callers share the same promise.
 *
 * <h3>Why this exists</h3>
 * The access token lives fifteen minutes (`jwt.access-token-expiration`) and the refresh
 * token lives seven days. Both halves were built - the backend serves
 * `POST /v1/auth/refresh`, login returns a `refreshToken`, the store persists it, and
 * `authService.refreshToken()` was written to call it - and nothing ever called it. The
 * only 401 handling in the app deleted *both* tokens and hard-navigated to `/login`, so
 * the seven-day refresh token was thrown away in the same breath that made it necessary.
 *
 * The result was that every signed-in user was ejected to the login screen about fifteen
 * minutes after signing in, on whichever background poll happened to be first past the
 * expiry. That is worse than an inconvenience in this application: a gated destructive
 * action cannot be raised without a written justification of at least ten characters, and
 * being bounced to a login screen discards the sentence the officer was part-way through
 * typing. The approval request is simply never raised, and nothing says why.
 *
 * <h3>Why the single in-flight promise matters</h3>
 * The dashboards poll several endpoints on the same timer, so the expiry is discovered by
 * three to six requests at once. Without this guard each would post its own refresh, and
 * since the server rotates the refresh token, the later exchanges would be presenting a
 * token the earlier ones had already retired - turning a recoverable expiry into a
 * sign-out. Sharing one promise means one exchange, and every waiting request retries
 * with the token it produced.
 *
 * Uses a bare axios call rather than `apiClient` so a 401 from the refresh itself cannot
 * re-enter the interceptor below.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    return Promise.resolve(null);
  }
  inFlightRefresh = axios
    .post(`${getApiBaseUrl()}/auth/refresh`, { refreshToken },
      { headers: { 'Content-Type': 'application/json' } })
    .then(res => {
      const payload = res.data?.data ?? res.data;
      const accessToken: string | undefined = payload?.accessToken;
      if (!accessToken) {
        return null;
      }
      localStorage.setItem('accessToken', accessToken);
      if (payload.refreshToken) {
        localStorage.setItem('refreshToken', payload.refreshToken);
      }
      // The store keeps its own copy of the token for render-time auth checks. It is
      // notified by event rather than imported, because authStore -> authService ->
      // client is already an import chain and closing it into a cycle here would be
      // paid for at module-init time.
      window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
        detail: { accessToken, refreshToken: payload.refreshToken ?? null },
      }));
      return accessToken;
    })
    .catch(() => null)
    .finally(() => { inFlightRefresh = null; });
  return inFlightRefresh;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (typeof error.config & { __retriedAfterRefresh?: boolean }) | undefined;
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const url = config?.url ?? '';
    const refreshable = config
      && !config.__retriedAfterRefresh
      && !REFRESH_EXEMPT.some(path => url.includes(path));

    if (refreshable) {
      const accessToken = await refreshAccessToken();
      if (accessToken) {
        // Marked on the config, so a request that 401s *again* after a successful
        // refresh - a genuinely revoked or insufficiently privileged session - falls
        // through to the sign-out below instead of retrying forever.
        config.__retriedAfterRefresh = true;
        return apiClient.request(config);
      }
    }

    endSession();
    return Promise.reject(error);
  }
);

export function extractErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred.';
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>;
    if (errObj.response?.data?.message) return errObj.response.data.message;
    if (errObj.response?.data?.error) return errObj.response.data.error;
    if (errObj.message) return errObj.message;
  }
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred.';
}

/** The ApiResponse envelope, for the callers that need the message and not just the data. */
export interface Envelope<T = any> {
  success?: boolean;
  message?: string;
  data: T;
  errors?: string[];
  errorCode?: string;
}

/**
 * Mutating fetch that surfaces the server's own explanation of a refusal.
 *
 * `safeFetchJson` collapses every non-2xx into `null`. That is right for a GET
 * that can degrade to an empty list, and wrong for a write against the approval
 * gate, where the message *is* the useful output of the call: "Delete legal clause
 * needs a written reason before it can be requested", "You raised this request, so
 * you cannot also approve it", "Your role is not permitted to approve termination
 * of a contract. Required: LEGAL_COUNSEL or DEPARTMENT_HEAD." Every one of those
 * names the thing the user has to do differently.
 *
 * Turning them all into "Request failed. Please try again." - which is what the
 * page-local `mutate` helpers did - invites a retry of something that will never
 * succeed, and hides the one sentence that says what to do instead. Somebody
 * clicking Delete four times and then filing a bug is the predictable result, and
 * the control looks broken rather than deliberate.
 *
 * Returns the whole envelope, because on a gated route the message is as
 * load-bearing as the data: the data says an approval request was raised, the
 * message says who has to sign it and under which request id.
 */
/**
 * A fetch that retries once with a refreshed access token if the first attempt is a 401.
 *
 * `mutateJson` and `safeFetchJson` use native fetch, so neither passes through the axios
 * response interceptor - they would have kept the old behaviour of failing at the
 * fifteen-minute mark no matter what the interceptor did. `mutateJson` is the transport
 * for every gated destructive route, which makes it the worst possible place to lose a
 * request: the user has already typed the justification.
 */
async function fetchWithTokenRefresh(url: string, init: RequestInit, headers: Record<string, string>) {
  const token = localStorage.getItem('accessToken');
  const withAuth = (t: string | null) => ({
    ...headers,
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  });

  let res = await fetch(url, { ...init, headers: withAuth(token) });
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(url, { ...init, headers: withAuth(refreshed) });
    }
  }
  return res;
}

export async function mutateJson<T = any>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Envelope<T>> {
  // resolveApiUrl, not the raw url. This was the one fetch in the frontend that
  // skipped it, and it is the transport for all seven gated destructive routes, so
  // the omission was invisible in local dev and fatal everywhere else: with an
  // absolute VITE_API_BASE_URL (every deployed block in `.env.example`), native
  // fetch resolves a module-relative path against window.location.origin - the
  // Vercel host - where `vercel.json` rewrites /(.*) to /index.html. A POST against
  // that rewrite answers 405, so an officer who typed a valid reason got
  // "Request failed (HTTP 405)." and no approval request was ever raised; on a host
  // that answers 200 with index.html instead it is worse and quiet, because
  // JSON.parse fails, parsed becomes null, res.ok is true, and pendingApprovalMessage
  // falls back to announcing a request that does not exist.
  const res = await fetchWithTokenRefresh(
    resolveApiUrl(url),
    { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
    { 'Content-Type': 'application/json' },
  );

  const text = await res.text();
  let parsed: any = null;
  if (text && text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    // Prefer the server's sentence. Fall back to naming the status rather than a
    // cheerful "try again", so an unexplained 500 still reads as a fault and not
    // as something the user typed wrong.
    const message = parsed?.message
      || parsed?.error
      || (parsed?.errors?.length ? parsed.errors.join(' ') : null)
      || `Request failed (HTTP ${res.status}).`;
    const err = new Error(message) as Error & { status?: number; envelope?: any };
    err.status = res.status;
    err.envelope = parsed;
    throw err;
  }

  return { ...(parsed ?? {}), data: parsed?.data } as Envelope<T>;
}

export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetchWithTokenRefresh(
      resolveApiUrl(url),
      options ?? {},
      {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> || {}),
      },
    );
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    if (!text || !text.trim()) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`Safe fetch JSON failed for ${url}:`, err);
    return null;
  }
}
