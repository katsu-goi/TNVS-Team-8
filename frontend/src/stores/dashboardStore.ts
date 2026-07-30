import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  dbConnections: number;
  apiRequests: number;
}

export interface NotificationMsg {
  id: string;
  message: string;
  type: string;
  timestamp: string;
}

interface DashboardState {
  metrics: any | null;
  systemStats: SystemStats | null;
  notifications: NotificationMsg[];
  chartData: any[];
  aiInsights: any | null;
  connected: boolean;
  stompClient: Client | null;
  loading: boolean;
  error: string | null;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  removeNotification: (id: string) => void;
  setMetrics: (metrics: any) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  metrics: null,
  systemStats: null,
  notifications: [],
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

    const client = new Client({
      webSocketFactory: () => new SockJS(socketUrl),
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

      client.subscribe('/topic/dashboard/notifications', (message) => {
        if (message.body) {
          try {
            const notif = JSON.parse(message.body);
            notif.id = Date.now().toString() + Math.random().toString();
            set((state: DashboardState) => ({
              notifications: [notif, ...state.notifications].slice(0, 50),
            }));
          } catch { }
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

  removeNotification: (id: string) => {
    set((state: DashboardState) => ({
      notifications: state.notifications.filter(n => n.id !== id),
    }));
  },
}));
