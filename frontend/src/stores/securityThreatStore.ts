import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from './authStore';
import { securityThreatService } from '../api/securityThreatService';
import type {
  GatewayLogEntry,
  IpThreatEntry,
  SecurityThreatEvent,
  ThreatMapDiagnostics,
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
  lastEventType: 'EVENT' | 'SYNC' | null;
  lastEventLog: GatewayLogEntry | null;
  diagnostics: ThreatMapDiagnostics | null;
  testingEvent: boolean;
  testResult: string | null;
  setWindow: (window: ThreatWindow) => void;
  loadInitial: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  applyEvent: (event: SecurityThreatEvent) => void;
  applySync: (event: SecurityThreatEvent) => void;
  loadDiagnostics: () => Promise<void>;
  triggerTestEvent: () => Promise<void>;
}

let stompClient: Client | null = null;

const upsertThreat = (list: IpThreatEntry[], threat: IpThreatEntry): IpThreatEntry[] => {
  const idx = list.findIndex((t) => t.ip === threat.ip);
  if (idx < 0) return [threat, ...list];
  const updated = [...list];
  updated[idx] = threat;
  return updated;
};

const upsertSession = (list: TrustedSessionEntry[], session: TrustedSessionEntry): TrustedSessionEntry[] => {
  const idx = list.findIndex((s) => s.sessionId === session.sessionId);
  if (idx < 0) return [session, ...list];
  const updated = [...list];
  updated[idx] = session;
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
  lastEventType: null,
  lastEventLog: null,
  diagnostics: null,
  testingEvent: false,
  testResult: null,

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
      const wasDisconnected = !get().connected;
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
      // After a disconnect/reconnect the client may have missed live events,
      // so refetch the REST snapshot to converge with the server again.
      if (wasDisconnected) {
        void get().loadInitial();
      }
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
    // A successful login arrives as EVENT with a trustedSession (no threat);
    // upsert it immediately so the green marker appears without waiting for SYNC.
    const trustedSessions = event.trustedSession
      ? upsertSession(state.trustedSessions, event.trustedSession)
      : state.trustedSessions;

    set({
      stats,
      gatewayLogs,
      threats,
      trustedSessions,
      lastEventAt: Date.now(),
      lastEventType: 'EVENT',
      lastEventLog: event.log ?? null,
    });
  },

  applySync: (event) => {
    const state = get();
    // The broadcast aggregates against its own fixed window (24h). If the
    // admin selected a different window, keep the REST snapshot for the
    // selected window and only update the live indicators. This prevents a
    // 1h/7d view from being silently overwritten by 24h broadcast data.
    const windowMatches = event.window === state.window;
    set({
      threats: windowMatches && event.threats ? event.threats : state.threats,
      trustedSessions: windowMatches && event.trustedSessions ? event.trustedSessions : state.trustedSessions,
      stats: event.stats ?? state.stats,
      lastEventAt: Date.now(),
      lastEventType: 'SYNC',
    });
  },

  loadDiagnostics: async () => {
    try {
      const diagnostics = await securityThreatService.fetchDiagnostics();
      set({ diagnostics });
    } catch {
      set({ diagnostics: null });
    }
  },

  triggerTestEvent: async () => {
    set({ testingEvent: true, testResult: null });
    try {
      const result = await securityThreatService.triggerTestEvent();
      set({ testResult: result
        ? `Event created: ${result.ip ?? 'n/a'} (${result.privateIp ? 'LOCAL/PRIVATE' : 'geolocated'})`
        : 'Test event returned no result.' });
    } catch {
      set({ testResult: 'Test event failed - check connection and permissions.' });
    } finally {
      set({ testingEvent: false });
    }
  },
}));