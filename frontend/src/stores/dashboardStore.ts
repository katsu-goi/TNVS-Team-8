import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { supabase } from '../lib/supabaseClient';
import type { DashboardStats, ChartDataPoint, AiInsightData } from '../api/dashboardService';

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
  metrics: DashboardStats | null;
  systemStats: SystemStats | null;
  notifications: NotificationMsg[];
  chartData: ChartDataPoint[];
  aiInsights: AiInsightData | null;
  connected: boolean;
  stompClient: Client | null;
  supabaseUnsubs: (() => void)[];
  loading: boolean;
  error: string | null;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  removeNotification: (id: string) => void;
  setMetrics: (metrics: DashboardStats) => void;
  setChartData: (data: ChartDataPoint[]) => void;
  setAiInsights: (insights: AiInsightData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

function pushNotification(set: any, table: string, action: string, detail: string) {
  const notif: NotificationMsg = {
    id: Date.now().toString() + Math.random().toString(),
    message: `[${table}] ${action}: ${detail}`,
    type: action === 'SECURITY' ? 'SECURITY' : action === 'VISITOR' ? 'USER' : 'REPORT',
    timestamp: new Date().toISOString(),
  };
  set((state: DashboardState) => ({
    notifications: [notif, ...state.notifications].slice(0, 50),
  }));
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  metrics: null,
  systemStats: null,
  notifications: [],
  chartData: [],
  aiInsights: null,
  connected: false,
  stompClient: null,
  supabaseUnsubs: [],
  loading: true,
  error: null,

  setMetrics: (metrics) => set({ metrics }),
  setChartData: (chartData) => set({ chartData }),
  setAiInsights: (aiInsights) => set({ aiInsights }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  connectWebSocket: () => {
    if (get().supabaseUnsubs.length > 0) return; // already subscribed

    // Subscribe to Supabase Realtime channels for live INSERT events
    const tables = [
      { table: 'security_logs', action: 'SECURITY', label: 'Security Event' },
      { table: 'visitors', action: 'VISITOR', label: 'Visitor' },
      { table: 'reservations', action: 'BOOKING', label: 'Reservation' },
      { table: 'security_alerts', action: 'ALERT', label: 'Alert' },
    ];

    const unsubs = tables.map(({ table, action, label }) => {
      const channel = supabase
        .channel(`notifications-${table}`)
        .on(
          'postgres_changes' as any,
          { event: 'INSERT', schema: 'public', table },
          (payload: any) => {
            const row = payload.new || {};
            const detail = row.title || row.full_name || row.action || row.reason || `${table} record created`;
            pushNotification(set, label, action, detail);
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    });

    set({ supabaseUnsubs: unsubs });

    // STOMP WebSocket as a secondary channel
    if (get().stompClient?.active) return;

    const socketUrl = (import.meta as any).env?.VITE_API_URL
      ? `${(import.meta as any).env.VITE_API_URL.replace('http', 'ws')}/ws-endpoint`
      : 'http://localhost:8080/ws-endpoint';

    const client = new Client({
      webSocketFactory: () => new SockJS(socketUrl),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
      set({ connected: true });
      console.log('[STOMP] Connected to dashboard metrics');

      client.subscribe('/topic/dashboard/metrics', (message) => {
        if (message.body) {
          try { set({ metrics: JSON.parse(message.body) }); } catch { }
        }
      });

      client.subscribe('/topic/dashboard/charts', (message) => {
        if (message.body) {
          try { set({ chartData: JSON.parse(message.body) }); } catch { }
        }
      });

      client.subscribe('/topic/dashboard/insights', (message) => {
        if (message.body) {
          try { set({ aiInsights: JSON.parse(message.body) }); } catch { }
        }
      });

      client.subscribe('/topic/dashboard/notifications', (message) => {
        if (message.body) {
          try {
            const notif = JSON.parse(message.body) as NotificationMsg;
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
    const { supabaseUnsubs, stompClient } = get();
    supabaseUnsubs.forEach(unsub => unsub());
    set({ supabaseUnsubs: [] });
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
