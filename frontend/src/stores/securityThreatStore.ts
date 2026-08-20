import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from './authStore';
import { securityThreatService } from '../api/securityThreatService';
import { supabase, supabaseAvailable } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  GatewayLogEntry,
  IpThreatEntry,
  SecurityThreatEvent,
  ThreatMapDiagnostics,
  ThreatMapStats,
  ThreatSeverity,
  ThreatWindow,
  TrustedSessionEntry,
} from '../types/threatMap';
import { emptyStats, isPrivateIp } from '../types/threatMap';

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
  supabaseChannel: RealtimeChannel | null;
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
  supabaseChannel: null,

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
    // 1. Supabase Realtime CDC Subscriptions
    if (supabaseAvailable && supabase && !get().supabaseChannel) {
      const channel = supabase
        .channel('public:security_monitoring')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'security_alerts' },
          () => {
            void get().loadInitial();
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'security_audit_logs' },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const ipVal = String(row.ip_address ?? row.ip ?? '0.0.0.0');
            const newLog: GatewayLogEntry = {
              timestamp: String(row.created_at ?? new Date().toISOString()),
              action: String(row.action ?? 'AUDIT'),
              ip: ipVal,
              username: row.created_by ? String(row.created_by) : null,
              severity: (row.severity ? String(row.severity) : 'INFO') as ThreatSeverity,
              module: String(row.subsystem ?? 'SECURITY'),
              status: row.entity_type ? String(row.entity_type) : 'AUDIT',
              reason: row.details ? String(row.details) : 'Security log entry',
              country: null,
              countryCode: null,
              city: null,
              privateIp: isPrivateIp(ipVal),
              latitude: null,
              longitude: null,
              accuracyRadiusKm: null,
              confidence: null,
              isp: null,
              asn: null,
            };

            set((state) => ({
              gatewayLogs: [newLog, ...state.gatewayLogs].slice(0, 50),
              lastEventAt: Date.now(),
              lastEventType: 'EVENT',
              lastEventLog: newLog,
              connected: true,
            }));
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') set({ connected: true });
        });

      set({ supabaseChannel: channel });
    }

    // 2. STOMP Client (Fallback / Legacy support)
    if (stompClient?.active) return;

    const wsBase = import.meta.env.VITE_WS_BASE_URL || '';
    if (!wsBase) return;

    try {
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
        if (wasDisconnected) {
          void get().loadInitial();
        }
      };

      client.onWebSocketClose = () => {};
      client.onStompError = () => {};

      client.activate();
      stompClient = client;
    } catch {
      /* ignore if STOMP endpoint unavailable in serverless mode */
    }
  },

  disconnect: () => {
    const { supabaseChannel } = get();
    if (supabaseChannel && supabase) {
      supabase.removeChannel(supabaseChannel);
    }
    if (stompClient) {
      stompClient.deactivate();
      stompClient = null;
    }
    set({ connected: false, supabaseChannel: null });
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