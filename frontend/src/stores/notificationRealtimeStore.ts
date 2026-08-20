import { create } from 'zustand';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { isSuperAdmin, useAuthStore } from './authStore';
import type { AppNotification } from '../api/notificationService';
import { supabase, supabaseAvailable } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Single shared realtime client for notifications. Integrates native Supabase
 * Realtime `postgres_changes` subscriptions for autonomous cloud operation
 * alongside STOMP fallback.
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
  supabaseChannel: RealtimeChannel | null;
  connect: () => void;
  disconnect: () => void;
}

export const useNotificationRealtimeStore = create<NotificationRealtimeState>((set, get) => ({
  connected: false,
  revision: 0,
  lastNotification: null,
  lastAdminNotification: null,
  stompClient: null,
  supabaseChannel: null,

  connect: () => {
    // 1. Supabase Realtime Subscription
    if (supabaseAvailable && supabase && !get().supabaseChannel) {
      const currentUser = useAuthStore.getState().user;
      const channel = supabase
        .channel('public:employee_notifications')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'employee_notifications' },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const notif: AppNotification = {
              id: String(row.id ?? ''),
              title: String(row.title ?? ''),
              message: String(row.message ?? ''),
              type: String(row.type ?? ''),
              read: Boolean(row.is_read),
              relatedEntityType: row.related_entity_type ? String(row.related_entity_type) : undefined,
              relatedEntityId: row.related_entity_id ? String(row.related_entity_id) : undefined,
              createdAt: String(row.created_at ?? ''),
            };

            const recipientId = String(row.recipient_id ?? '');
            const matchesUser = currentUser && (currentUser.id === recipientId || currentUser.email === recipientId);
            const isAdmin = currentUser && isSuperAdmin(currentUser);

            if (matchesUser) {
              set((state) => ({ lastNotification: notif, revision: state.revision + 1, connected: true }));
            }
            if (isAdmin) {
              set((state) => ({ lastAdminNotification: notif, revision: state.revision + 1, connected: true }));
            }
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            set({ connected: true });
          }
        });

      set({ supabaseChannel: channel });
    }

    // 2. STOMP Client (Fallback / Legacy support)
    if (get().stompClient?.active) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const wsBase = import.meta.env.VITE_WS_BASE_URL || '';
    if (!wsBase) return;

    try {
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
      client.onWebSocketClose = () => {};

      client.activate();
      set({ stompClient: client });
    } catch {
      /* ignore if STOMP endpoint unavailable in serverless mode */
    }
  },

  disconnect: () => {
    const { stompClient, supabaseChannel } = get();
    if (supabaseChannel && supabase) {
      supabase.removeChannel(supabaseChannel);
    }
    if (stompClient) {
      stompClient.deactivate();
    }
    set({ connected: false, stompClient: null, supabaseChannel: null });
  },
}));