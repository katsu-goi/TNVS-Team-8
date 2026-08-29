import { useEffect } from 'react';
import { apiClient } from '../api/client';

const HEARTBEAT_INTERVAL_MS = 30000;

export function useUserHeartbeat() {
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const sendHeartbeat = () => {
      apiClient.post('/auth/heartbeat', {}).catch(() => {});
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);
}
