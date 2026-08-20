import { create } from 'zustand';
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
    // Supabase Realtime CDC Subscriptions
    const clientDb = supabase;
    if (supabaseAvailable && clientDb && get().supabaseChannels.length === 0) {
      const channels: RealtimeChannel[] = [];
      const tables = ['facility_reservations', 'visitors', 'documents', 'security_alerts'];

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
  },

  disconnectSync: () => {
    const { supabaseChannels } = get();
    const clientDb = supabase;
    if (clientDb && supabaseChannels.length > 0) {
      supabaseChannels.forEach((ch) => clientDb.removeChannel(ch));
    }
    set({ connected: false, supabaseChannels: [] });
  },
}));
