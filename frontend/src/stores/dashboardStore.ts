import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from './authStore';

export interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  dbConnections: number;
  apiRequests: number;
}

interface DashboardState {
  metrics: any | null;
  systemStats: SystemStats | null;
  chartData: any[];
  aiInsights: any | null;
  connected: boolean;
  stompClient: Client | null;
  loading: boolean;
  error: string | null;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  setMetrics: (metrics: any) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  metrics: null,
  systemStats: null,
  chartData: [],
  aiInsights: null,
  connected: false,
  stompClient: null,
  loading: true,
  error: null,

  setMetrics: (metrics) => set({ metrics }),

  connectWebSocket: () => {
    if (get().stompClient?.active) return;

    const socketUrl = '/ws-endpoint';

    const token = useAuthStore.getState().accessToken;
    const client = new Client({
      webSocketFactory: () => new SockJS(socketUrl),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
      set({ connected: true });

      client.subscribe('/topic/dashboard/metrics', (message) => {
        if (message.body) {
          try { set({ metrics: JSON.parse(message.body) }); } catch { }
        }
      });
    };

    client.onStompError = () => {};
    client.onWebSocketClose = () => { set({ connected: false }); };

    client.activate();
    set({ stompClient: client });
  },

  disconnectWebSocket: () => {
    const { stompClient } = get();
    if (stompClient) {
      stompClient.deactivate();
      set({ connected: false, stompClient: null });
    }
  },
}));
