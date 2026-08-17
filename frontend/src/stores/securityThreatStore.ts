import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from './authStore';
import { securityThreatService } from '../api/securityThreatService';
import type {
  GatewayLogEntry,
  IpThreatEntry,
  SecurityThreatEvent,
  ThreatMapStats,
  ThreatWindow,
  TrustedSessionEntry,
} from '../types/threatMap';
import { emptyStats } from '../types/threatMap';

interface SecurityThreatState {
  window: ThreatWindow;
  threats: IpThreatEntry[];
  trustedSessions: TrustedSessionEntry[];
  stats: ThreatMapStats;
  gatewayLogs: GatewayLogEntry[];
  connected: boolean;
  loading: boolean;
  error: string | null;
  lastEventAt: number | null;
  setWindow: (window: ThreatWindow) => void;
  loadInitial: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  applyEvent: (event: SecurityThreatEvent) => void;
  applySync: (event: SecurityThreatEvent) => void;
}

let stompClient: Client | null = null;

const upsertThreat = (list: IpThreatEntry[], threat: IpThreatEntry): IpThreatEntry[] => {
  const idx = list.findIndex((t) => t.ip === threat.ip);
  if (idx < 0) return [threat, ...list];
  const updated = [...list];
  updated[idx] = threat;
  return updated;
};

export const useSecurityThreatStore = create<SecurityThreatState>((set, get) => ({
  window: '24h',
  threats: [],
  trustedSessions: [],
  stats: emptyStats(),
  gatewayLogs: [],
  connected: false,
  loading: false,
  error: null,
  lastEventAt: null,

  setWindow: (window) => {
    set({ window });
    void get().loadInitial();
  },

  loadInitial: async () => {
    const { window } = get();
    set({ loading: true, error: null });
    try {
      const map = await securityThreatService.fetchMap(window);
      if (map) {
        set({
          threats: map.threats ?? [],
          trustedSessions: map.trustedSessions ?? [],
          stats: map.stats ?? emptyStats(),
          gatewayLogs: map.recentLogs ?? [],
        });
      }
    } catch {
      set({ error: 'Failed to load threat map data.' });
    } finally {
      set({ loading: false });
    }
  },

  connect: () => {
    if (stompClient?.active) return;

    const wsBase = import.meta.env.VITE_WS_BASE_URL || '';
    const token = useAuthStore.getState().accessToken;
    const client = new Client({
      webSocketFactory: () => new SockJS(`${wsBase}/ws-endpoint`),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
      set({ connected: true });
      client.subscribe('/topic/security/threats', (message) => {
        if (!message.body) return;
        try {
          const event = JSON.parse(message.body) as SecurityThreatEvent;
          if (event.type === 'EVENT') {
            get().applyEvent(event);
          } else if (event.type === 'SYNC') {
            get().applySync(event);
          }
        } catch {
          /* ignore malformed frames */
        }
      });
    };

    client.onWebSocketClose = () => set({ connected: false });
    client.onStompError = () => set({ connected: false });

    client.activate();
    stompClient = client;
  },

  disconnect: () => {
    if (stompClient) {
      stompClient.deactivate();
      stompClient = null;
    }
    set({ connected: false });
  },

  applyEvent: (event) => {
    const state = get();
    const stats = event.stats ?? state.stats;
    const gatewayLogs = event.log
      ? [event.log, ...state.gatewayLogs].slice(0, 50)
      : state.gatewayLogs;
    const threats = event.threat
      ? upsertThreat(state.threats, event.threat)
      : state.threats;

    set({ stats, gatewayLogs, threats, lastEventAt: Date.now() });
  },

  applySync: (event) => {
    set({
      threats: event.threats ?? get().threats,
      trustedSessions: event.trustedSessions ?? get().trustedSessions,
      stats: event.stats ?? get().stats,
      lastEventAt: Date.now(),
    });
  },
}));