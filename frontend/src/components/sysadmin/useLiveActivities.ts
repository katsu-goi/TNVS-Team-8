import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export interface LiveActivityUser {
  name: string;
  email: string;
  initials: string;
  role: string;
}

export interface LiveActivity {
  id: string;
  user: LiveActivityUser;
  action: string;
  timestamp: Date;
  ip: string;
  device: string;
  isNew: boolean;
}

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

/**
 * Convert an active_sessions row into a LiveActivity entry.
 */
function sessionToActivity(row: Record<string, any>, isNew: boolean): LiveActivity {
  const name = row.full_name || row.username || 'Unknown User';
  return {
    id: `session-${row.id || row.username || Math.random()}`,
    user: {
      name,
      email: row.username || '',
      initials: initialsOf(name),
      role: row.role || 'EMPLOYEE',
    },
    action: isNew ? 'Logged in' : 'Currently online',
    timestamp: new Date(row.login_time || row.created_at || Date.now()),
    ip: row.ip_address || '',
    device: row.device_name || row.browser || '',
    isNew,
  };
}

/**
 * Convert a security_logs row into a LiveActivity entry.
 */
function securityLogToActivity(row: Record<string, any>, isNew: boolean): LiveActivity {
  const name = row.full_name || row.username || 'System';
  return {
    id: `log-${row.id || Math.random()}`,
    user: {
      name,
      email: row.email || '',
      initials: initialsOf(name),
      role: row.role || 'SYSTEM',
    },
    action: row.action || 'SECURITY_EVENT',
    timestamp: new Date(row.created_at || Date.now()),
    ip: row.ip_address || '',
    device: '',
    isNew,
  };
}

/**
 * Convert a localStorage login event into a LiveActivity entry.
 */
function localEventToActivity(evt: Record<string, any>): LiveActivity {
  const name = evt.full_name || evt.username || 'Unknown User';
  return {
    id: `local-${evt.username}-${Date.now()}`,
    user: {
      name,
      email: evt.username || '',
      initials: initialsOf(name),
      role: evt.role || 'USER',
    },
    action: 'Logged in',
    timestamp: new Date(evt.login_time || Date.now()),
    ip: '0.0.0.0',
    device: evt.device_name || evt.browser || '',
    isNew: true,
  };
}

export function useLiveActivities() {
  const [activities, setActivities] = useState<LiveActivity[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [peakToday, setPeakToday] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peakRef = useRef(0);
  const newTimersRef = useRef<number[]>([]);
  const onlineSetRef = useRef<Set<string>>(new Set());

  const applyOnlineCount = useCallback((count: number) => {
    setOnlineCount(count);
    if (count > peakRef.current) {
      peakRef.current = count;
      setPeakToday(count);
    }
  }, []);

  const updateOnline = useCallback((mutate: (set: Set<string>) => void) => {
    mutate(onlineSetRef.current);
    applyOnlineCount(onlineSetRef.current.size);
  }, [applyOnlineCount]);

  const pushActivity = useCallback((activity: LiveActivity) => {
    setActivities(prev => [activity, ...prev].slice(0, 50));
    const timer = window.setTimeout(() => {
      setActivities(prev => prev.map(a => (a.id === activity.id ? { ...a, isNew: false } : a)));
    }, 5000);
    newTimersRef.current.push(timer);
  }, []);

  /**
   * Seed online users from the active_sessions table.
   */
  const seedOnline = useCallback(async (disposed: () => boolean) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('status', 'ACTIVE');
      if (disposed()) return;
      if (error) {
        console.warn('[LiveActivity] active_sessions seed error:', error.message);
        return;
      }
      if (!data) return;
      const rows = (data as any[]) ?? [];
      updateOnline(set => {
        set.clear();
        rows.forEach(r => r.username && set.add(r.username));
      });
      setActivities(prev => {
        const seeds = rows.map<LiveActivity>(r => sessionToActivity(r, false));
        const kept = prev.filter(a => !a.id.startsWith('session-'));
        return [...seeds, ...kept].slice(0, 50);
      });
    } catch (err) {
      console.warn('[LiveActivity] seed online failed:', err);
    }
  }, [updateOnline]);

  /**
   * Seed recent security log events.
   */
  const seedRecentLogs = useCallback(async (disposed: () => boolean) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);
      if (disposed()) return;
      if (error) {
        console.warn('[LiveActivity] security_logs seed error:', error.message);
        return;
      }
      if (!data) return;
      const recent = ((data as any[]) ?? []).map(row => securityLogToActivity(row, false));
      if (recent.length) {
        setActivities(prev => {
          const kept = prev.filter(a => a.id.startsWith('session-') || a.id.startsWith('local-'));
          return [...kept, ...recent].slice(0, 50);
        });
      }
    } catch (err) {
      console.warn('[LiveActivity] seed logs failed:', err);
    }
  }, []);

  /**
   * Check localStorage for a login event that happened just before the
   * dashboard mounted (i.e. the user literally just logged in).
   */
  const seedFromLocalLogin = useCallback(() => {
    try {
      const raw = localStorage.getItem('last_login_event');
      if (!raw) return;
      const evt = JSON.parse(raw);
      if (!evt?.username) return;
      // Only show events from the last 60 seconds
      const age = Date.now() - new Date(evt.login_time || 0).getTime();
      if (age > 60_000) return;
      const activity = localEventToActivity(evt);
      updateOnline(set => set.add(evt.username));
      pushActivity(activity);
    } catch { /* ignore parse errors */ }
  }, [updateOnline, pushActivity]);

  useEffect(() => {
    let disposed = false;
    const isDisposed = () => disposed;

    // Always seed from local login first (guaranteed to work)
    seedFromLocalLogin();

    // Then try Supabase seeding
    seedOnline(isDisposed);
    seedRecentLogs(isDisposed);

    let channel: RealtimeChannel | null = null;

    // ── Listen for localStorage login events from other tabs or same tab ──
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key !== 'last_login_event' || !e.newValue) return;
      try {
        const evt = JSON.parse(e.newValue);
        if (!evt?.username) return;
        updateOnline(set => set.add(evt.username));
        pushActivity(localEventToActivity(evt));
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', handleStorageEvent);

    // ── Subscribe to Supabase Realtime CDC (bonus — works if key is valid) ──
    if (supabase) {
      channel = supabase
        .channel('live-user-activity')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'active_sessions' },
          (payload: any) => {
            if (!payload.new) return;
            const row = payload.new;
            if (row.username) updateOnline(set => set.add(row.username));
            pushActivity(sessionToActivity(row, true));
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'active_sessions' },
          (payload: any) => {
            const removed = payload.old?.username;
            if (removed) updateOnline(set => set.delete(removed));
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'active_sessions' },
          (payload: any) => {
            const row = payload.new;
            if (!row) return;
            if (row.status !== 'ACTIVE' && row.username) {
              updateOnline(set => set.delete(row.username));
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'security_logs' },
          (payload: any) => {
            if (!payload.new) return;
            pushActivity(securityLogToActivity(payload.new, true));
          }
        )
        .subscribe((status) => {
          console.log('[LiveActivity] Realtime subscription status:', status);
        });
      channelRef.current = channel;
    }

    return () => {
      disposed = true;
      window.removeEventListener('storage', handleStorageEvent);
      newTimersRef.current.forEach(t => window.clearTimeout(t));
      newTimersRef.current = [];
      if (channel) {
        supabase?.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [pushActivity, updateOnline, seedOnline, seedRecentLogs, seedFromLocalLogin]);

  return { activities, onlineCount, peakToday };
}