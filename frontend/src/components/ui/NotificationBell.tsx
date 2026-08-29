import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationService, AppNotification } from '../../api/notificationService';
import { isSuperAdmin, useAuthStore } from '../../stores/authStore';
import { useNotificationRealtimeStore } from '../../stores/notificationRealtimeStore';

/** Colored dot by notification type — mirrors the employee Notifications page. */
const dotColor = (type?: string) => {
  switch ((type || '').toUpperCase()) {
    case 'APPROVAL':
    case 'SUCCESS':
    case 'COMPLETED':
      return 'bg-emerald-500';
    case 'REJECTION':
    case 'ERROR':
      return 'bg-rose-500';
    case 'CANCELLED':
      return 'bg-slate-400';
    case 'REMINDER':
    case 'WARNING':
      return 'bg-amber-500';
    default: return 'bg-blue-500';
  }
};

/** Compact relative time ("3m", "2h", "5d") with an absolute-date fallback. */
const relTime = (iso?: string) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const POLL_MS = 30000;

const byDateDesc = (a: AppNotification, b: AppNotification) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/**
 * Role-agnostic notification bell for the header of every portal layout.
 *
 * Shows a live unread badge (polled every 30s as a fallback) and, on click,
 * opens a dropdown listing the user's notifications with per-row
 * "mark read" / "dismiss" and a "mark all read" action. Backed by
 * {@link notificationService} → the shared `/v1/notifications` endpoint.
 *
 * Realtime: subscribes to the authenticated user's private STOMP queue via
 * {@link useNotificationRealtimeStore}, so new notifications appear instantly
 * without a page refresh. SUPER_ADMINs also see their per-admin notifications
 * from `/v1/admin/notifications` merged into the same list.
 */
export const NotificationBell: React.FC<{ className?: string }> = ({ className = '' }) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isSuperAdmin(user);

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const realtime = useNotificationRealtimeStore();

  const refreshCount = useCallback(async () => {
    try {
      const userCount = await notificationService.getUnreadCount();
      const adminCount = isAdmin ? await notificationService.getAdminUnreadCount() : 0;
      setUnread(userCount + adminCount);
    } catch { /* silent — badge is best-effort */ }
  }, [isAdmin]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [userRows, adminRows] = await Promise.all([
        notificationService.getNotifications(),
        isAdmin ? notificationService.getAdminNotifications() : Promise.resolve([]),
      ]);
      const merged = [...adminRows, ...userRows].sort(byDateDesc);
      setRows(merged);
      setUnread(merged.filter(n => !n.read).length);
    } catch { /* keep prior rows */ }
    finally { setLoading(false); }
  }, [isAdmin]);

  // Open a realtime connection for the whole time the bell is mounted.
  useEffect(() => {
    realtime.connect();
    return () => realtime.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime is a change marker; refresh protected notification data via API.
  useEffect(() => {
    if (!realtime.revision) return;
    void refreshCount();
    if (open) void loadList();
  }, [realtime.revision, open, loadList, refreshCount]);


  // Poll the unread count on mount and on an interval (fallback/reconciliation).
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  // Load the full list whenever the dropdown opens.
  useEffect(() => { if (open) loadList(); }, [open, loadList]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (n: AppNotification) => {
    if (n.read) return;
    setBusy(n.id);
    try {
      await notificationService.markNotificationRead(n.id);
      setRows(rs => rs.map(r => (r.id === n.id ? { ...r, read: true } : r)));
      setUnread(u => Math.max(0, u - 1));
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  const dismiss = async (n: AppNotification) => {
    setBusy(n.id);
    try {
      await notificationService.dismissNotification(n.id);
      setRows(rs => rs.filter(r => r.id !== n.id));
      if (!n.read) setUnread(u => Math.max(0, u - 1));
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  const markAll = async () => {
    setBusy('all');
    try {
      await notificationService.markAllNotificationsRead();
      if (isAdmin) {
        for (const r of rows) {
          if (r.severity) await notificationService.markAdminNotificationRead(r.id);
        }
      }
      setRows(rs => rs.map(r => ({ ...r, read: true })));
      setUnread(0);
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  const openNotification = (n: AppNotification) => {
    if (!n.read) markRead(n);
    if (n.relatedEntityType === 'EmployeeRequest') navigate('/employee/requests');
    else if (n.relatedEntityType === 'Visitor') navigate('/employee/visitors');
  };

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-200"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none shadow-sm ring-2 ring-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
              {unread > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  {unread} new
                </span>
              )}
            </div>
            {rows.some(n => !n.read) && (
              <button
                type="button"
                onClick={markAll}
                disabled={busy === 'all'}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
              >
                {busy === 'all' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                  <Bell className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">You're all caught up</p>
                <p className="text-xs text-slate-400 mt-0.5">New alerts will show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {rows.map(n => {
                  const clickable = n.relatedEntityType === 'EmployeeRequest' || n.relatedEntityType === 'Visitor';
                  return (
                    <li
                      key={n.id}
                      onClick={clickable ? () => openNotification(n) : undefined}
                      className={`px-4 py-3 flex items-start gap-3 transition-colors hover:bg-slate-50 ${n.read ? '' : 'bg-emerald-50/40'} ${clickable ? 'cursor-pointer' : ''}`}
                    >
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColor(n.type)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 leading-snug">{n.title}</p>
                        {n.message && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{n.message}</p>}
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">{relTime(n.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!n.read && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); markRead(n); }}
                            disabled={busy === n.id}
                            title="Mark as read"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); dismiss(n); }}
                          disabled={busy === n.id}
                          title="Dismiss"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
