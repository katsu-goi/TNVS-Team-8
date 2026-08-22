import axios, { AxiosError } from 'axios';

const DEFAULT_SUPABASE_PROJECT_URL = 'https://dunijfrvfozwlykpkfhy.supabase.co';

export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && !envUrl.includes('trycloudflare.com')) {
    return envUrl;
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

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      if (!AUTH_ROUTES.some(r => window.location.pathname.startsWith(r))) {
        window.location.href = '/login';
      }
    }
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
export async function mutateJson<T = any>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<Envelope<T>> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

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
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers as Record<string, string> || {}),
    };

    const res = await fetch(resolveApiUrl(url), { ...options, headers });
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
