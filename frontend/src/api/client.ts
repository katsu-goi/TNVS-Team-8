import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
  baseURL: '/api/v1',
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

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(error)
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
