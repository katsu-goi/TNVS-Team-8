import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const DEFAULT_SUPABASE_PROJECT_URL = 'https://dunijfrvfozwlykpkfhy.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const isLocalHost = typeof window !== 'undefined' && window.location && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (envUrl && !envUrl.includes('trycloudflare.com')) {
    // If running on Vercel / non-localhost and envUrl is relative, relative calls to Vercel static origin will hit index.html
    // Fallback to Supabase Edge Functions / production backend if envUrl is relative on non-localhost.
    if (envUrl.startsWith('/') && typeof window !== 'undefined' && !isLocalHost) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_PROJECT_URL;
      return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
    }
    return envUrl.replace(/\/+$/, '');
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_PROJECT_URL;
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
};

const API_BASE_URL = getApiBaseUrl();

type RetriableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

type RefreshedSession = {
  accessToken: string;
  refreshToken: string;
  user?: unknown;
};

const SUPABASE_FUNCTION_ALIASES: Record<string, string> = {
  admin: 'admin',
  ai: 'ai',
  analytics: 'analytics',
  auth: 'auth',
  compliance: 'compliance',
  contracts: 'contracts',
  dashboard: 'dashboard',
  documents: 'documents',
  employee: 'employee',
  'facilities-manager': 'facilities',
  'facilities-officer': 'facilities',
  facilities: 'facilities',
  legal: 'legal',
  monitoring: 'monitoring',
  notifications: 'notifications',
  procurement: 'procurement',
  visitors: 'visitor',
  'requests-review': 'employee',
  rbac: 'auth',
  security: 'security',
  visitor: 'visitor',
};

function normalizeApiPath(url: string): string {
  if (url.startsWith('/api/v1')) {
    return url.slice('/api/v1'.length) || '/';
  }
  return url;
}

function routeSupabaseFunction(url: string): string {
  if (!API_BASE_URL.includes('/functions/v1')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  const normalized = url.startsWith('/') ? url : `/${url}`;
  const [pathname, query] = normalized.split('?', 2);
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  const functionName = firstSegment ? SUPABASE_FUNCTION_ALIASES[firstSegment] : undefined;
  if (!functionName) return normalized;

  return `/${functionName}${pathname}${query ? `?${query}` : ''}`;
}

export function getApiUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const routed = routeSupabaseFunction(normalizeApiPath(url));
  return `${API_BASE_URL}${routed.startsWith('/') ? routed : `/${routed}`}`;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
  },
});

const prepareRequest = (config: InternalAxiosRequestConfig) => {
  if (config.url) {
    config.url = routeSupabaseFunction(normalizeApiPath(config.url));
  }
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

apiClient.interceptors.request.use(prepareRequest);

const AUTH_ROUTES = ['/login'];

let refreshRequest: Promise<RefreshedSession> | null = null;

function persistRefreshedSession(session: RefreshedSession) {
  localStorage.setItem('accessToken', session.accessToken);
  localStorage.setItem('refreshToken', session.refreshToken);
  if (session.user) {
    localStorage.setItem('user', JSON.stringify(session.user));
  }
  window.dispatchEvent(new CustomEvent('auth:session-refreshed', { detail: session }));
}

function clearStoredSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('auth:session-expired'));
}

function redirectToLogin() {
  if (!AUTH_ROUTES.some((route) => window.location.pathname.startsWith(route))) {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
}

async function renewSession(): Promise<RefreshedSession> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token is available.');
  }

  if (!refreshRequest) {
    refreshRequest = axios
      .post(getApiUrl('/auth/refresh'), { refreshToken }, {
        headers: { 'Content-Type': 'application/json' },
      })
      .then(({ data }) => {
        const session = data?.data as RefreshedSession | undefined;
        if (!session?.accessToken || !session?.refreshToken) {
          throw new Error('The API returned an invalid refresh response.');
        }
        persistRefreshedSession(session);
        return session;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequest | undefined;
    const isAuthRequest = request?.url?.includes('/auth/login') || request?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && request && !request._retry && !isAuthRequest) {
      request._retry = true;
      try {
        const session = await renewSession();
        request.headers.Authorization = `Bearer ${session.accessToken}`;
        return apiClient(request);
      } catch {
        clearStoredSession();
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  }
);

export function extractErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred.';
  if (axios.isAxiosError(error) && !error.response) {
    return `Cannot reach the application API at ${API_BASE_URL}. Check the deployment, CORS settings, and VITE_API_BASE_URL.`;
  }
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>;
    if (errObj.response?.data?.message) return errObj.response.data.message;
    if (errObj.response?.data?.error) return errObj.response.data.error;
    if (errObj.message) return errObj.message;
  }
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred.';
}

export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const response = await apiClient.request<T>({
      url: normalizeApiPath(url),
      method: options?.method || 'GET',
      headers: options?.headers as Record<string, string> | undefined,
      data: options?.body,
    });
    const contentType = String(response.headers['content-type'] ?? '');
    if (contentType && !contentType.includes('application/json')) {
      console.warn(`Safe fetch JSON received non-JSON content-type (${contentType}) for ${url}`);
      return null;
    }
    if (typeof response.data === 'string' && (!response.data.trim() || response.data.trim().startsWith('<'))) {
      return null;
    }
    return response.data ?? null;
  } catch (err) {
    console.warn(`Safe fetch JSON failed for ${url}:`, err);
    return null;
  }
}

