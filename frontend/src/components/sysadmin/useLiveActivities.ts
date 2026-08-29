import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { securityService } from '../../api/securityService';

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
    }, 5000);
    newTimersRef.current.push(timer);
  }, []);

  /**
   * Seed from the authenticated security API. Browser table writes/reads are
  * intentionally avoided; the edge function owns telemetry persistence.
   */
  const seedOnline = useCallback(async (disposed: () => boolean) => {
    try {
      const rows = await securityService.getActiveSessions();
      if (disposed()) return;
      updateOnline(set => {
        set.clear();
        rows.forEach(r => r.username && set.add(r.username));
      });
      setActivities(prev => {
        const seeds = rows.map<LiveActivity>(r => sessionToActivity({
          ...r,
          ip_address: r.ipAddress,
          device_name: r.deviceName,
          login_time: r.loginTime,
          last_activity: r.lastActivity,
        }, false));
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
    try {
      const rows = await securityService.getLogs({ page: '0', size: '15' });
      if (disposed()) return;
      const recent = rows.map(row => securityLogToActivity({
        ...row,
        ip_address: row.ipAddress,
        full_name: row.fullName,
        created_at: row.timestamp,
      }, false));
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

  useEffect(() => {
    let disposed = false;
    const isDisposed = () => disposed;

    seedOnline(isDisposed);
    seedRecentLogs(isDisposed);

    let channel: RealtimeChannel | null = null;

    // ── Subscribe to sanitized Supabase Realtime change markers ──
    if (supabase) {
      channel = supabase
        .channel('live-user-activity')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'realtime_events' },
          (payload: any) => {
            const source = payload.new?.source_table;
            if (!['active_sessions', 'user_activity_events', 'security_logs', 'online_users'].includes(source)) return;
            void Promise.all([seedOnline(isDisposed), seedRecentLogs(isDisposed)]);
          }
        )
        .subscribe((status) => {
          console.log('[LiveActivity] Realtime subscription status:', status);
        });
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
