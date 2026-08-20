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
    }, 3000);
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
      if (error || !data || disposed()) return;
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
    } catch { /* ignore */ }
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
      if (error || !data || disposed()) return;
      const recent = ((data as any[]) ?? []).map(row => securityLogToActivity(row, false));
      if (recent.length) {
        setActivities(prev => {
          const kept = prev.filter(a => a.id.startsWith('session-'));
          return [...kept, ...recent].slice(0, 50);
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let disposed = false;
    const isDisposed = () => disposed;

    seedOnline(isDisposed);
    seedRecentLogs(isDisposed);

    let channel: RealtimeChannel | null = null;

    if (supabase) {
      channel = supabase
        .channel('live-user-activity')
        // Listen for new sessions (user logged in)
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
        // Listen for removed sessions (user logged out)
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'active_sessions' },
          (payload: any) => {
            const removed = payload.old?.username;
            if (removed) updateOnline(set => set.delete(removed));
          }
        )
        // Listen for session updates (heartbeat, status change)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'active_sessions' },
          (payload: any) => {
            const row = payload.new;
            if (!row) return;
            // If session became inactive, remove from online set
            if (row.status !== 'ACTIVE' && row.username) {
              updateOnline(set => set.delete(row.username));
            }
          }
        )
        // Listen for new security log entries
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'security_logs' },
          (payload: any) => {
            if (!payload.new) return;
            pushActivity(securityLogToActivity(payload.new, true));
          }
        )
        .subscribe();
      channelRef.current = channel;
    }

    return () => {
      disposed = true;
      newTimersRef.current.forEach(t => window.clearTimeout(t));
      newTimersRef.current = [];
      if (channel) {
        supabase?.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [pushActivity, updateOnline, seedOnline, seedRecentLogs]);

  return { activities, onlineCount, peakToday };
}