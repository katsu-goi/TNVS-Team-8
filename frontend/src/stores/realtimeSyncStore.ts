import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from './authStore';
import type { SubsystemHealthSnapshot } from '../types/systemMonitoring';
import type { BackupRecord } from '../types';
import { supabase, supabaseAvailable } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface FacilitiesSyncData {
  pendingReservations: number;
  approvedReservations: number;
  totalReservations: number;
  bookingsToday: number;
  visitorsOnSite: number;
  totalVisitors: number;
  totalDocuments: number;
  unreadNotifications: number;
  activeSessions: number;
  activeAlerts: number;
  timestamp: number;
}

interface RealtimeSyncState {
  syncData: FacilitiesSyncData | null;
  subsystemHealth: SubsystemHealthSnapshot | null;
  backupEvent: BackupRecord | null;
  backupRevision: number;
  aiConfigRevision: number;
  connected: boolean;
  lastSyncAt: number | null;
  revision: number;
  stompClient: Client | null;
  supabaseChannels: RealtimeChannel[];
  connectSync: () => void;
  disconnectSync: () => void;
}

export const useRealtimeSyncStore = create<RealtimeSyncState>((set, get) => ({
  syncData: null,
  subsystemHealth: null,
  backupEvent: null,
  backupRevision: 0,
  aiConfigRevision: 0,
  connected: false,
  lastSyncAt: null,
  revision: 0,
  stompClient: null,
  supabaseChannels: [],

  connectSync: () => {
    // 1. Supabase Realtime CDC Subscriptions
    const clientDb = supabase;
    if (supabaseAvailable && clientDb && get().supabaseChannels.length === 0) {
      const channels: RealtimeChannel[] = [];
      const tables = ['reservations', 'visitors', 'documents', 'security_alerts'];

      tables.forEach((tableName) => {
        const ch = clientDb
          .channel(`public:${tableName}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: tableName },
            () => {
              set((state) => ({
                revision: state.revision + 1,
                lastSyncAt: Date.now(),
                connected: true,
              }));
            },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') set({ connected: true });
          });
        channels.push(ch);
      });

      set({ supabaseChannels: channels });
    }

    // 2. STOMP Client (Fallback / Legacy support)
    if (get().stompClient?.active) return;

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
        set({ connected: true });

        client.subscribe('/topic/facilities/sync', (message) => {
          if (message.body) {
            try {
              const data = JSON.parse(message.body) as FacilitiesSyncData;
              set((state) => ({
                syncData: data,
                lastSyncAt: data.timestamp || Date.now(),
                revision: state.revision + 1,
              }));
            } catch { /* ignore parse errors */ }
          }
        });

        client.subscribe('/topic/system-monitoring/subsystems', (message) => {
          if (message.body) {
            try {
              const data = JSON.parse(message.body) as SubsystemHealthSnapshot;
              set((state) => ({
                subsystemHealth: data,
                lastSyncAt: Date.now(),
                revision: state.revision + 1,
              }));
            } catch { /* ignore parse errors */ }
          }
        });

        client.subscribe('/topic/backups', (message) => {
          if (message.body) {
            try {
              const data = JSON.parse(message.body) as BackupRecord;
              set((state) => ({
                backupEvent: data,
                backupRevision: state.backupRevision + 1,
              }));
            } catch { /* ignore parse errors */ }
          }
        });

        client.subscribe('/topic/ai/config', (message) => {
          if (message.body) {
            try {
              JSON.parse(message.body);
              set((state) => ({
                aiConfigRevision: state.aiConfigRevision + 1,
              }));
            } catch { /* ignore parse errors */ }
          }
        });
      };

      client.onStompError = () => {};
      client.onWebSocketClose = () => {};

      client.activate();
      set({ stompClient: client });
    } catch {
      /* ignore if STOMP endpoint unavailable in serverless mode */
    }
  },

  disconnectSync: () => {
    const { stompClient, supabaseChannels } = get();
    const clientDb = supabase;
    if (clientDb && supabaseChannels.length > 0) {
      supabaseChannels.forEach((ch) => clientDb.removeChannel(ch));
    }
    if (stompClient) {
      stompClient.deactivate();
    }
    set({ connected: false, stompClient: null, supabaseChannels: [] });
  },
}));
