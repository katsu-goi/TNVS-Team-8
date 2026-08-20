import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { securityService } from '../../api/securityService';
import type { ActiveSession } from '../../types';

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

function toActivity(row: Record<string, any>, isNew: boolean): LiveActivity {
  const name = row.full_name || row.username || 'System User';
  return {
    id: `activity-${row.id}`,
    user: {
      name,
      email: row.email || row.username || '',
      initials: initialsOf(name),
      role: row.role || 'EMPLOYEE',
    },
    action: row.action || 'USER_EVENT',
    timestamp: new Date(row.created_at || row.timestamp || Date.now()),
    ip: row.ip || row.ip_address || '',
    device: row.device || row.browser || '',
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

  const seedOnline = useCallback(async (disposed: () => boolean) => {
    if (!supabase) {
      // Supabase not configured — fall back to REST via the sessions edge endpoint.
      try {
        const result: any = await securityService.getActiveSessions();
        if (disposed()) return;
        const sessions: ActiveSession[] = Array.isArray(result) ? result : result ? [result] : [];
        updateOnline(set => {
          set.clear();
          sessions.forEach(s => s.username && set.add(s.username));
        });
        setActivities(prev => {
          const seeds = sessions.map<LiveActivity>(s => {
            const name = s.fullName || s.username || 'Unknown User';
            return {
              id: `seed-${s.id || s.sessionId || s.username || s.userId}`,
              user: {
                name,
                email: s.username || '',
                initials: initialsOf(name),
                role: s.role || 'EMPLOYEE',
              },
              action: 'Currently online',
              timestamp: new Date(s.loginTime || Date.now()),
              ip: s.ipAddress || '',
              device: s.deviceName || '',
              isNew: false,
            };
          });
          const kept = prev.filter(a => !a.id.startsWith('seed-'));
          return [...kept, ...seeds].slice(0, 50);
        });
      } catch { /* backend unavailable */ }
      return;
    }
    try {
      const { data, error } = await supabase
        .from('online_users')
        .select('*');
      if (error || !data || disposed()) return;
      const rows = (data as any[]) ?? [];
      updateOnline(set => {
        set.clear();
        rows.forEach(r => r.username && set.add(r.username));
      });
      setActivities(prev => {
        const seeds = rows.map<LiveActivity>(r => {
          const name = r.full_name || r.username || 'Unknown User';
          return {
            id: `seed-${r.username}`,
            user: {
              name,
              email: r.username || '',
              initials: initialsOf(name),
              role: r.role || 'EMPLOYEE',
            },
            action: 'Currently online',
            timestamp: new Date(r.last_activity || Date.now()),
            ip: r.ip || '',
            device: r.device || r.browser || '',
            isNew: false,
          };
        });
        const kept = prev.filter(a => !a.id.startsWith('seed-'));
        return [...kept, ...seeds].slice(0, 50);
      });
    } catch { /* ignore */ }
  }, [updateOnline]);

  const seedRecentEvents = useCallback(async (disposed: () => boolean) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('user_activity_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error || !data || disposed()) return;
      const recent = ((data as any[]) ?? []).map(row => toActivity(row, false));
      if (recent.length) {
        setActivities(prev => {
          const kept = prev.filter(a => a.id.startsWith('seed-'));
          return [...recent, ...kept].slice(0, 50);
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let disposed = false;
    const isDisposed = () => disposed;

    seedOnline(isDisposed);
    seedRecentEvents(isDisposed);

    let fallbackPoll: number | null = null;
    let channel: RealtimeChannel | null = null;

    if (supabase) {
      channel = supabase
        .channel('live-user-activity')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'user_activity_events' },
          (payload: any) => {
            if (!payload.new) return;
            pushActivity(toActivity(payload.new, true));
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'online_users' },
          (payload: any) => {
            if (payload.new?.username) updateOnline(set => set.add(payload.new.username));
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'online_users' },
          (payload: any) => {
            const removed = payload.old?.username;
            if (removed) updateOnline(set => set.delete(removed));
          }
        )
        .subscribe();
      channelRef.current = channel;
    } else {
      // Supabase not configured — fall back to REST polling for online count.
      const poll = () => {
        seedOnline(isDisposed);
      };
      poll();
      fallbackPoll = window.setInterval(poll, 5000);
    }

    return () => {
      disposed = true;
      newTimersRef.current.forEach(t => window.clearTimeout(t));
      newTimersRef.current = [];
      if (fallbackPoll) window.clearInterval(fallbackPoll);
      if (channel) {
        supabase?.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [pushActivity, updateOnline, seedOnline, seedRecentEvents]);

  return { activities, onlineCount, peakToday };
}