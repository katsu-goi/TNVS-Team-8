import axios, { AxiosError } from 'axios';

const DEFAULT_SUPABASE_PROJECT_URL = 'https://dunijfrvfozwlykpkfhy.supabase.co';

export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  const isLocalHost = typeof window !== 'undefined' && window.location && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  
  if (envUrl && !envUrl.includes('trycloudflare.com')) {
    // If running on Vercel / non-localhost and envUrl is relative, relative calls to Vercel static origin will hit index.html
    // Fallback to Supabase Edge Functions / production backend if envUrl is relative on non-localhost.
    if (envUrl.startsWith('/') && typeof window !== 'undefined' && !isLocalHost) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_PROJECT_URL;
      return `${supabaseUrl}/functions/v1`;
    }
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
    const contentType = res.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      console.warn(`Safe fetch JSON received non-JSON content-type (${contentType}) for ${url}`);
      return null;
    }
    const text = await res.text();
    if (!text || !text.trim() || text.trim().startsWith('<')) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`Safe fetch JSON failed for ${url}:`, err);
    return null;
  }
}

