import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download, Database, RefreshCw, Plus, AlertCircle, CheckCircle,
  XCircle, Loader2, CalendarClock, HardDrive, ShieldCheck, Clock,
  FileArchive, Activity, ArrowUpRight, Timer, User,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { loadBackups, createBackup } from '../../api/adminService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import type { BackupRecord } from '../../types';

const TOOLTIP_STYLE = { backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '10px', color: '#fff', border: 'none' };

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="glass-panel p-5 animate-pulse"><div className="h-5 w-56 bg-slate-200 rounded" /></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card-stat p-5 animate-pulse"><div className="h-3 w-20 bg-slate-200 rounded mb-3" /><div className="h-7 w-12 bg-slate-200 rounded" /></div>
      ))}
    </div>
    <div className="card-stat p-5 animate-pulse"><div className="h-4 w-full bg-slate-200 rounded mb-2" /><div className="h-4 w-3/4 bg-slate-200 rounded" /></div>
  </div>
);

const STATUS_META: Record<string, { badge: string; dot: string; icon: React.ElementType }> = {
  COMPLETED: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle },
  RUNNING: { badge: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500', icon: Loader2 },
  FAILED: { badge: 'bg-rose-100 text-rose-800 border-rose-200', dot: 'bg-rose-500', icon: XCircle },
  PENDING: { badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: Clock },
};

const INTEGRITY_META: Record<string, { badge: string; dot: string }> = {
  PASSED: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  FAILED: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  PENDING: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
};

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = -1;
  do { v /= 1024; u++; } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(1)} ${units[u]}`;
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return 'N/A';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = Math.max(0, e - s);
  if (ms < 1000) return '< 1s';
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

function relativeTime(ts?: string): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/* ------------------------------------------------------------------ */
/* KPI tile                                                            */
/* ------------------------------------------------------------------ */

const KpiTile: React.FC<{ label: string; value: string; sub?: string; icon: React.ElementType; iconCls?: string }> = ({ label, value, sub, icon: Icon, iconCls }) => (
  <div className="card-stat p-5 relative overflow-hidden group">
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">{label}</p>
      <div className={`p-2 rounded-xl bg-slate-100 transition-transform group-hover:scale-110 ${iconCls || ''}`}><Icon className="w-4 h-4" /></div>
    </div>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-1 font-mono">{sub}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export const BackupPage: React.FC = () => {
  const [data, setData] = useState<BackupRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<string>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedType, setSelectedType] = useState('FULL');
  const backupRevision = useRealtimeSyncStore(s => s.backupRevision);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadBackups();
      setData(list);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load backup records');
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, retry]);

  useEffect(() => {
    if (backupRevision > 0) { load(); }
  }, [backupRevision, load]);

  const backups = useMemo(() => data ?? [], [data]);

  const totals = useMemo(() => {
    const completed = backups.filter(b => b.status === 'COMPLETED');
    const running = backups.filter(b => b.status === 'RUNNING');
    const failed = backups.filter(b => b.status === 'FAILED');
    const storage = backups.reduce((sum, b) => sum + (b.fileSize ?? 0), 0);
    const latest = backups[0];
    const successRate = backups.length > 0 ? Math.round((completed.length / backups.length) * 100) : 0;
    return { total: backups.length, completed: completed.length, running: running.length, failed: failed.length, storage, latest, successRate };
  }, [backups]);

  const timeline = useMemo(() =>
    [...backups].reverse().map((b) => ({
      name: b.startedAt ? new Date(b.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A',
      sizeMb: b.fileSize ? Math.round(b.fileSize / (1024 * 1024)) : 0,
      type: b.backupType,
    })), [backups]);

  const statusDonut = useMemo(() => {
    const map: Record<string, number> = {};
    backups.forEach(b => { map[b.status] = (map[b.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [backups]);

  const DONUT_COLORS: Record<string, string> = { COMPLETED: '#10b981', RUNNING: '#3b82f6', FAILED: '#f43f5e', PENDING: '#94a3b8' };

  const filtered = useMemo(() =>
    filter === 'ALL' ? backups : backups.filter(b => b.status === filter),
    [backups, filter]);

  const handleCreate = async () => {
    setCreating(true);
    await createBackup(selectedType);
    setCreating(false);
    setShowModal(false);
    setTimeout(() => load(), 500);
  };

  /* ------------------------------- states ------------------------------- */

  if (loading && !data) return <LoadingSkeleton />;

  if (error && !data) {
    return (
      <div className="card-stat p-8 flex flex-col items-center justify-center text-center space-y-4">
        <div className="p-4 rounded-2xl bg-rose-50"><AlertCircle className="w-10 h-10 text-rose-400" /></div>
        <h3 className="text-lg font-bold text-slate-900">Backup Service Unavailable</h3>
        <p className="text-sm text-slate-500 max-w-md">{error}. The backup service may be offline. Retry to reconnect.</p>
        <button onClick={() => setRetry(r => r + 1)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2">
          <RefreshCw className="w-4 h-4" /><span>Retry</span>
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div>
        <div className="glass-panel p-5 flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200"><Download className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <h1 className="text-2xl font-bold font-heading text-slate-900">Backup & Disaster Recovery</h1>
              <p className="text-sm text-slate-500">Primary database backup & replication</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2 hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /><span>Backup Now</span>
          </button>
        </div>
        <div className="card-stat p-14 flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-5 rounded-2xl bg-slate-100"><Database className="w-12 h-12 text-slate-400" /></div>
          <p className="text-xl font-bold text-slate-900">No backups available</p>
          <p className="text-sm text-slate-500 max-w-md">No backup has been created yet. Create your first backup to begin protecting your system.</p>
          <button onClick={() => setShowModal(true)} className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold inline-flex items-center space-x-2 hover:bg-emerald-700 transition-colors shadow-md">
            <Plus className="w-4 h-4" /><span>Create Your First Backup</span>
          </button>
        </div>
        {showModal && <CreateBackupModal onClose={() => setShowModal(false)} onCreate={handleCreate} creating={creating} selectedType={selectedType} setSelectedType={setSelectedType} />}
      </div>
    );
  }

  const latest = totals.latest;
  const StatusIcon = STATUS_META[latest?.status]?.icon ?? Activity;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-0">
        <div className="flex items-center space-x-4">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200"><Download className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-900">Backup & Disaster Recovery</h1>
            <p className="text-sm text-slate-500">Primary database backup & replication · live data from database</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => load()} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-500 hover:text-slate-700" title="Refresh from database">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2 hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /><span>Backup Now</span>
          </button>
        </div>
      </div>

      {/* KPI TILES */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Total Backups" value={String(totals.total)} sub={`${totals.completed} completed`} icon={FileArchive} iconCls="text-emerald-600" />
        <KpiTile
          label="Last Backup"
          value={latest?.status === 'COMPLETED' ? relativeTime(latest.completedAt) : latest?.status || 'N/A'}
          sub={latest ? `${latest.backupType} · ${latest.status}` : 'No backups'}
          icon={CalendarClock}
          iconCls={latest?.status === 'FAILED' ? 'text-rose-500' : 'text-emerald-600'}
        />
        <KpiTile label="Success Rate" value={`${totals.successRate}%`} sub={`${totals.failed} failed`} icon={ShieldCheck} iconCls={totals.successRate >= 80 ? 'text-emerald-600' : 'text-amber-500'} />
        <KpiTile label="Storage Used" value={formatBytes(totals.storage)} sub="Total backup archive size" icon={HardDrive} iconCls="text-blue-500" />
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-stat p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center"><BarChart className="w-4 h-4 mr-2 text-emerald-600" />Backup Timeline (Size MB)</h3>
          {timeline.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400"><Activity className="w-8 h-8 mb-2 text-slate-300" /><p className="text-xs">No backup timeline data</p></div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(16,185,129,0.08)' }} />
                  <Bar dataKey="sizeMb" name="Size (MB)" radius={[6, 6, 0, 0]}>
                    {timeline.map((_, i) => <Cell key={i} fill="#10b981" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-stat p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center"><Activity className="w-4 h-4 mr-2 text-emerald-600" />Status Distribution</h3>
          {statusDonut.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400"><Activity className="w-8 h-8 mb-2 text-slate-300" /><p className="text-xs">No status data</p></div>
          ) : (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3}>
                      {statusDonut.map((entry, i) => <Cell key={i} fill={DONUT_COLORS[entry.name] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {statusDonut.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center space-x-1.5 text-slate-500"><span className={`w-2 h-2 rounded-full ${DONUT_COLORS[s.name] || '#94a3b8'}`} />{s.name}</span>
                    <span className="font-semibold text-slate-900">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* LATEST BACKUP DETAIL */}
      {latest && (
        <div className="glass-panel p-5">
          <div className="flex items-center space-x-3 mb-4">
            <div className={`p-2 rounded-xl border ${STATUS_META[latest.status]?.badge || 'bg-slate-100 border-slate-200 text-slate-500'}`}>
              {latest.status === 'RUNNING' ? <Loader2 className="w-5 h-5 animate-spin" /> : <StatusIcon className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Latest Backup · {latest.backupType}</h3>
              <p className="text-xs text-slate-500">Started {latest.startedAt ? new Date(latest.startedAt).toLocaleString() : 'N/A'}</p>
            </div>
            <span className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-semibold border ${STATUS_META[latest.status]?.badge || 'bg-slate-100 text-slate-500 border-slate-200'}`}>{latest.status}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <DetailStat icon={Database} label="Type" value={latest.backupType} />
            <DetailStat icon={HardDrive} label="Size" value={formatBytes(latest.fileSize)} />
            <DetailStat icon={Timer} label="Duration" value={formatDuration(latest.startedAt, latest.completedAt)} />
            <DetailStat icon={ShieldCheck} label="Integrity" value={latest.integrityCheck || 'PENDING'} tone={latest.integrityCheck === 'PASSED' ? 'text-emerald-600' : latest.integrityCheck === 'FAILED' ? 'text-rose-600' : 'text-amber-600'} />
            <DetailStat icon={User} label="Triggered By" value={latest.triggeredBy || 'system'} />
            <DetailStat icon={CalendarClock} label="Completed" value={latest.completedAt ? new Date(latest.completedAt).toLocaleTimeString() : 'In progress'} />
          </div>
          {latest.filePath && <p className="mt-3 text-[11px] font-mono text-slate-400 truncate">Archive: {latest.filePath}</p>}
          {latest.notes && <p className="mt-1 text-[11px] text-slate-500">{latest.notes}</p>}
        </div>
      )}

      {/* HISTORY TABLE */}
      <div className="card-stat p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center"><FileArchive className="w-4 h-4 mr-2 text-emerald-600" />Backup History ({backups.length})</h3>
          <div className="flex items-center space-x-2 flex-wrap">
            {['ALL', 'COMPLETED', 'RUNNING', 'FAILED'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  filter === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'
                }`}
              >{s}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <FileArchive className="w-8 h-8 mb-2 text-slate-300" />
            <p className="text-xs">No backups match this filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Integrity</th>
                  <th className="py-2 pr-3 font-semibold">Size</th>
                  <th className="py-2 pr-3 font-semibold">Started</th>
                  <th className="py-2 pr-3 font-semibold">Duration</th>
                  <th className="py-2 pr-3 font-semibold">Triggered By</th>
                  <th className="py-2 font-semibold text-right">Completed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const sm = STATUS_META[b.status] || STATUS_META.PENDING;
                  const im = INTEGRITY_META[b.integrityCheck || 'PENDING'] || INTEGRITY_META.PENDING;
                  const Icon = sm.icon;
                  return (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 pr-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-mono font-semibold">{b.backupType}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sm.badge}`}>
                          {b.status === 'RUNNING' ? <Icon className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                          <span>{b.status}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${im.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${im.dot}`} />
                          <span>{b.integrityCheck || 'PENDING'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-700 font-mono">{formatBytes(b.fileSize)}</td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">{b.startedAt ? new Date(b.startedAt).toLocaleString() : 'N/A'}</td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">{formatDuration(b.startedAt, b.completedAt)}</td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">{b.triggeredBy || 'system'}</td>
                      <td className="py-2.5 text-xs text-slate-500 text-right">{b.completedAt ? new Date(b.completedAt).toLocaleTimeString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-panel p-3 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center space-x-2">
          <Database className="w-3.5 h-3.5 text-emerald-600" />
          <span>All data sourced from live backend database · No mock data used</span>
        </span>
        <button onClick={() => load()} className="flex items-center space-x-1 text-emerald-600 hover:underline">
          <RefreshCw className="w-3 h-3" /><span>Refresh</span>
        </button>
      </div>

      {showModal && <CreateBackupModal onClose={() => setShowModal(false)} onCreate={handleCreate} creating={creating} selectedType={selectedType} setSelectedType={setSelectedType} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Detail stat                                                         */
/* ------------------------------------------------------------------ */

const DetailStat: React.FC<{ icon: React.ElementType; label: string; value: string; tone?: string }> = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-[10px] text-slate-500 flex items-center gap-1"><Icon className="w-3 h-3" />{label}</p>
    <p className={`text-sm font-bold text-slate-900 mt-1 truncate ${tone || ''}`}>{value}</p>
  </div>
);

/* ------------------------------------------------------------------ */
/* Create modal                                                        */
/* ------------------------------------------------------------------ */

const CreateBackupModal: React.FC<{
  onClose: () => void;
  onCreate: () => void;
  creating: boolean;
  selectedType: string;
  setSelectedType: (t: string) => void;
}> = ({ onClose, onCreate, creating, selectedType, setSelectedType }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={creating ? undefined : onClose}>
    <div className="glass-panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200"><Database className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Start Database Backup</h3>
            <p className="text-xs text-slate-500">Creates a real archive from the live database</p>
          </div>
        </div>
        {!creating && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>

      <label className="block text-xs font-semibold text-slate-600 mb-2">Backup Type</label>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {['FULL', 'INCREMENTAL'].map((t) => (
          <button
            key={t}
            onClick={() => !creating && setSelectedType(t)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              selectedType === t ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
            }`}
          >
            <p className="text-sm font-bold text-slate-900">{t}</p>
            <p className="text-[10px] text-slate-500">{t === 'FULL' ? 'Complete snapshot of all tables' : 'Changes since last backup'}</p>
          </button>
        ))}
      </div>

      <button
        onClick={onCreate}
        disabled={creating}
        className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold inline-flex items-center justify-center space-x-2 hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
      >
        {creating ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Starting backup...</span></> : <><Plus className="w-4 h-4" /><span>Start {selectedType} Backup</span></>}
      </button>
      <p className="mt-3 text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
        <ArrowUpRight className="w-3 h-3" />Status updates appear in real time via WebSocket
      </p>
    </div>
  </div>
);
