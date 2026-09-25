import { useEffect } from 'react';
import { apiClient } from '../api/client';
import { MEANINGFUL_ACTIVITY_EVENT } from '../session/sessionState';

const HEARTBEAT_INTERVAL_MS = 30000;

export function useUserHeartbeat() {
  useEffect(() => {
    let lastHeartbeatAt = 0;
    const sendHeartbeat = () => {
      if (!localStorage.getItem('accessToken')) return;
      const now = Date.now();
      if (now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
      lastHeartbeatAt = now;
      apiClient.post('/auth/heartbeat', {}).catch(() => {});
    };

    window.addEventListener(MEANINGFUL_ACTIVITY_EVENT, sendHeartbeat);
    return () => window.removeEventListener(MEANINGFUL_ACTIVITY_EVENT, sendHeartbeat);
  }, []);
}
