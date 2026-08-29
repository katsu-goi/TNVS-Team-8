import { create } from 'zustand';
import { securityThreatService } from '../api/securityThreatService';
import { securityService } from '../api/securityService';
import { supabase, supabaseAvailable } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SecurityLog } from '../types';
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

function securityLogToGatewayLog(log: SecurityLog): GatewayLogEntry {
  const ipVal = log.ipAddress || '0.0.0.0';
  return {
    timestamp: log.timestamp,
    action: log.action || 'AUDIT',
    ip: ipVal,
    username: log.username ?? log.fullName ?? null,
    severity: ((log.riskLevel || 'LOW') as ThreatSeverity),
    module: log.module || 'SECURITY',
    status: log.status || 'SUCCESS',
    reason: 'Security log entry',
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
}

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
        });
      }
    } catch {
      set({ error: 'Failed to load threat map data.' });
    } finally {
      set({ loading: false });
    }
    // Seed the Real-time Gateway Logs feed from the security logs endpoint.
    const logs = await securityService.getLogs();
    if (logs.length) {
      set({ gatewayLogs: logs.slice(0, 50).map(securityLogToGatewayLog) });
    }
  },

  connect: () => {
    // Supabase Realtime CDC Subscriptions
    if (supabaseAvailable && supabase && !get().supabaseChannel) {
      const channel = supabase
        .channel('public:security_monitoring')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'realtime_events' },
          () => {
            void get().loadInitial();
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') set({ connected: true });
        });

      set({ supabaseChannel: channel });
    }
  },

  disconnect: () => {
    const { supabaseChannel } = get();
    if (supabaseChannel && supabase) {
      supabase.removeChannel(supabaseChannel);
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
