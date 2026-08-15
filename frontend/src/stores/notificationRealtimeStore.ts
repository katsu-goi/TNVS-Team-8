import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { isSuperAdmin, useAuthStore } from './authStore';
import type { AppNotification } from '../api/notificationService';

/**
 * Single shared STOMP client for realtime notifications. Authenticates the
 * connection with the access token (the backend requires a JWT on every STOMP
 * CONNECT), subscribes to the authenticated user's private queue
 * `/user/queue/notifications` (and, for SUPER_ADMINs, `/user/queue/admin-notifications`),
 * and bumps a revision counter so the NotificationBell can react instantly.
 *
 * Realtime is delivery-only: the database remains the source of truth, and the
 * bell keeps its REST polling as a fallback/reconciliation mechanism.
 */
interface NotificationRealtimeState {
  connected: boolean;
  revision: number;
  lastNotification: AppNotification | null;
  lastAdminNotification: AppNotification | null;
  stompClient: Client | null;
  connect: () => void;
  disconnect: () => void;
}

export const useNotificationRealtimeStore = create<NotificationRealtimeState>((set, get) => ({
  connected: false,
  revision: 0,
  lastNotification: null,
  lastAdminNotification: null,
  stompClient: null,

  connect: () => {
    if (get().stompClient?.active) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const wsBase = import.meta.env.VITE_WS_BASE_URL || '';
    const client = new Client({
      webSocketFactory: () => new SockJS(`${wsBase}/ws-endpoint`),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
      set({ connected: true });

      client.subscribe('/user/queue/notifications', (message) => {
        if (!message.body) return;
        try {
          const notif = JSON.parse(message.body) as AppNotification;
          set((state) => ({ lastNotification: notif, revision: state.revision + 1 }));
        } catch { /* ignore parse errors */ }
      });

      const user = useAuthStore.getState().user;
      if (user && isSuperAdmin(user)) {
        client.subscribe('/user/queue/admin-notifications', (message) => {
          if (!message.body) return;
          try {
            const notif = JSON.parse(message.body) as AppNotification;
            set((state) => ({ lastAdminNotification: notif, revision: state.revision + 1 }));
          } catch { /* ignore parse errors */ }
        });
      }
    };

    client.onStompError = () => {};
    client.onWebSocketClose = () => { set({ connected: false }); };

    client.activate();
    set({ stompClient: client });
  },

  disconnect: () => {
    const { stompClient } = get();
    if (stompClient) {
      stompClient.deactivate();
      set({ connected: false, stompClient: null });
    }
  },
}));