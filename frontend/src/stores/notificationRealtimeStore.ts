import { create } from 'zustand';
import { supabase, supabaseAvailable } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Single shared realtime client for notifications. Integrates native Supabase
 * Realtime change markers for autonomous cloud operation alongside the
 * authenticated API snapshot.
 *
 * Realtime is delivery-only: the database remains the source of truth, and the
 * bell keeps its REST polling as a fallback/reconciliation mechanism.
 */
interface NotificationRealtimeState {
  connected: boolean;
  revision: number;
  supabaseChannel: RealtimeChannel | null;
  connect: () => void;
  disconnect: () => void;
}

export const useNotificationRealtimeStore = create<NotificationRealtimeState>((set, get) => ({
  connected: false,
  revision: 0,
  stompClient: null,
  supabaseChannel: null,

  connect: () => {
    // Supabase Realtime Subscription
    if (supabaseAvailable && supabase && !get().supabaseChannel) {
      const channel = supabase
        .channel('public:notification_events')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'realtime_events', filter: 'source_table=eq.employee_notifications' },
          () => {
            set((state) => ({ revision: state.revision + 1, connected: true }));
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            set({ connected: true });
          }
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
}));
