import { useEffect, useRef } from 'react';
import { apiClient } from '../api/client';

const HEARTBEAT_INTERVAL_MS = 30000;

function sendLogoutBeacon() {
  const token = localStorage.getItem('accessToken');
  if (!token) return;
  try {
    const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

export function useUserHeartbeat() {
  const beaconSentRef = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const sendHeartbeat = () => {
      apiClient.post('/auth/heartbeat', {}).catch(() => {});
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    const handlePageHide = () => {
      if (!beaconSentRef.current) {
        beaconSentRef.current = true;
        sendLogoutBeacon();
      }
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);
}
