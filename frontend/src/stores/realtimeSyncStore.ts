import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

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
  connected: boolean;
  lastSyncAt: number | null;
  revision: number;
  stompClient: Client | null;
  connectSync: () => void;
  disconnectSync: () => void;
}

export const useRealtimeSyncStore = create<RealtimeSyncState>((set, get) => ({
  syncData: null,
  connected: false,
  lastSyncAt: null,
  revision: 0,
  stompClient: null,

  connectSync: () => {
    if (get().stompClient?.active) return;

    const wsBase = import.meta.env.VITE_WS_BASE_URL || '';
    const client = new Client({
      webSocketFactory: () => new SockJS(`${wsBase}/ws-endpoint`),
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
    };

    client.onStompError = () => {};
    client.onWebSocketClose = () => { set({ connected: false }); };

    client.activate();
    set({ stompClient: client });
  },

  disconnectSync: () => {
    const { stompClient } = get();
    if (stompClient) {
      stompClient.deactivate();
      set({ connected: false, stompClient: null });
    }
  },
}));
