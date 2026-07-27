import axios, { AxiosError } from 'axios';

// Main API client for /api/v1 endpoints
export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Auth API client for /v1/auth endpoints (different prefix)
export const authApiClient = axios.create({
  baseURL: '/v1/auth',
  headers: { 'Content-Type': 'application/json' },
});

// Inject Bearer token on every request
const attachToken = (config: any) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

apiClient.interceptors.request.use(attachToken);
authApiClient.interceptors.request.use(attachToken);

// Response interceptor — no fallback mocking, just re-throw
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(error)
);

// Unified error extractor for Supabase & API errors
export function extractErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred.';

  // Handle standard Error or Supabase error object with .message
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>;
    if (errObj.message && typeof errObj.message === 'string') {
      return errObj.message;
    }
    if (errObj.error_description && typeof errObj.error_description === 'string') {
      return errObj.error_description;
    }
    if (errObj.details && typeof errObj.details === 'string') {
      return errObj.details;
    }
    // Axios error handling
    if (errObj.response) {
      return (
        errObj.response?.data?.message ||
        errObj.response?.data?.error ||
        errObj.message ||
        'Server returned an error.'
      );
    }
  }

  if (typeof error === 'string') return error;

  return 'An unexpected error occurred.';
}

