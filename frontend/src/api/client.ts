import axios, { AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

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
