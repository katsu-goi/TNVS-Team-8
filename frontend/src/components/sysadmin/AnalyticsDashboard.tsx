import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, Download, BookOpen, Cpu, Shield, Activity,
  RefreshCw, AlertCircle, FileText, Users,
  CheckCircle, XCircle, Clock, ArrowUpRight, ArrowDownRight,
  Minus, Database, Sparkles, ScrollText,
  Lock, TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Area, BarChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { fetchAnalytics } from '../../api/analyticsService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import type { AnalyticsData, AnalyticsKpi } from '../../types';

const TOOLTIP_STYLE = { backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '11px', color: '#fff', border: 'none' };

type RangeKey = '24h' | '7d' | '30d' | '90d' | 'custom';

const RANGE_PRESETS: { key: RangeKey; label: string }[] = [
  { key: '24h', label: 'Last 24h' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

const HEALTH_META: Record<string, { badge: string; dot: string }> = {
  HEALTHY: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  WARNING: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  OFFLINE: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  ERROR: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
};

const INSIGHT_META: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-800',
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-rose-100 text-rose-800',
};

/* ------------------------------------------------------------------ */
/* Loading / error / empty helpers                                     */
/* ------------------------------------------------------------------ */

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="glass-panel p-5 animate-pulse"><div className="h-5 w-72 bg-slate-200 rounded" /></div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card-stat p-5 animate-pulse"><div className="h-3 w-16 bg-slate-200 rounded mb-3" /><div className="h-7 w-14 bg-slate-200 rounded" /></div>
      ))}
    </div>
    <div className="card-stat p-5 animate-pulse"><div className="h-4 w-full bg-slate-200 rounded mb-2" /><div className="h-4 w-3/4 bg-slate-200 rounded" /></div>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="card-stat p-10 flex flex-col items-center justify-center text-center space-y-4">
    <AlertCircle className="w-12 h-12 text-rose-400" />
    <p className="text-lg font-bold text-slate-900">Failed to load analytics</p>
    <p className="text-sm text-slate-500 max-w-md">{message}</p>
    <button onClick={onRetry} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2">
      <RefreshCw className="w-4 h-4" /><span>Retry</span>
    </button>
  </div>
);

const EmptyState: React.FC<{ icon: React.ElementType; title: string; desc: string }> = ({ icon: Icon, title, desc }) => (
  <div className="p-10 flex flex-col items-center justify-center text-center space-y-3">
    <div className="p-4 rounded-2xl bg-slate-100"><Icon className="w-8 h-8 text-slate-400" /></div>
    <p className="text-sm font-bold text-slate-700">{title}</p>
    <p className="text-xs text-slate-500 max-w-sm">{desc}</p>
  </div>
);

const SectionCard: React.FC<{ title: string; icon: React.ElementType; iconColor?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, icon: Icon, iconColor, right, children }) => (
  <div className="card-stat p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-bold text-slate-900 flex items-center"><Icon className={`w-4 h-4 mr-2 ${iconColor || 'text-emerald-600'}`} /> {title}</h3>
      {right}
    </div>
    {children}
  </div>
);

function kpiTone(kpi: AnalyticsKpi): { card: string; value: string } {
  switch (kpi.status) {
    case 'good': return { card: 'border-emerald-200', value: 'text-emerald-700' };
    case 'warning': return { card: 'border-amber-200', value: 'text-amber-700' };
    case 'bad': return { card: 'border-rose-200', value: 'text-rose-700' };
    default: return { card: 'border-slate-200', value: 'text-slate-900' };
  }
}

function trendBadge(kpi: AnalyticsKpi): React.ReactNode {
  if (!kpi.hasComparison || kpi.deltaPct == null) return null;
  const up = kpi.trend === 'up';
  const down = kpi.trend === 'down';
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const cls = kpi.key === 'failedLogins' || kpi.key === 'systemErrors' || kpi.key === 'securityEvents'
    ? (up ? 'text-rose-600' : down ? 'text-emerald-600' : 'text-slate-500')
    : (up ? 'text-emerald-600' : down ? 'text-rose-600' : 'text-slate-500');
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold ${cls}`}>
      <Icon className="w-3 h-3 mr-0.5" />
      {kpi.deltaPct > 0 ? '+' : ''}{kpi.deltaPct}%
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export const AnalyticsPage: React.FC = () => {
  const [range, setRange] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const revision = useRealtimeSyncStore((s) => s.revision);
  const backupRevision = useRealtimeSyncStore((s) => s.backupRevision);
  const aiConfigRevision = useRealtimeSyncStore((s) => s.aiConfigRevision);

  const buildWindow = useCallback((): { from?: Date; to?: Date } => {
    const to = new Date();
    if (range === '24h') return { from: new Date(to.getTime() - 24 * 3600 * 1000), to };
    if (range === '7d') return { from: new Date(to.getTime() - 7 * 24 * 3600 * 1000), to };
    if (range === '90d') return { from: new Date(to.getTime() - 90 * 24 * 3600 * 1000), to };
    if (range === 'custom') {
      const from = customFrom ? new Date(customFrom + 'T00:00:00') : undefined;
      const customToDate = customTo ? new Date(customTo + 'T23:59:59') : undefined;
      return { from, to: customToDate ?? to };
    }
    return { from: new Date(to.getTime() - 30 * 24 * 3600 * 1000), to };
  }, [range, customFrom, customTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const window = buildWindow();
      const result = await fetchAnalytics(window.from, window.to);
      setData(result);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.warn('Analytics load failed:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [buildWindow, retry]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time refresh: re-fetch when the existing WebSocket topics signal a change.
  useEffect(() => {
    if (data && (revision > 0 || backupRevision > 0 || aiConfigRevision > 0)) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, backupRevision, aiConfigRevision]);

  if (loading && !data) return <LoadingSkeleton />;
  if (error && !data) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;
  if (!data) return null;

  const activeSeries = data.activity.series.filter(s => s.values.some(v => v > 0));
  const chartData = data.activity.labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label };
    activeSeries.forEach(s => { row[s.key] = s.values[i] ?? 0; });
    return row;
  });

  const aiHasData = data.ai.totalRequests > 0;
  const securityHasData = data.security.total > 0;

  return (
    <div className="space-y-6">
      {/* Header + range selector */}
      <div className="glass-panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200"><BarChart3 className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-bold font-heading text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-500">{data.period.label} · every value is aggregated from real system data</p>
          </div>
        </div>
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            {RANGE_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => setRange(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${range === p.key ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
              >{p.label}</button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${range === 'custom' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
            >Custom</button>
          </div>
          {range === 'custom' && (
            <div className="flex items-center space-x-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 bg-white" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 bg-white" />
            </div>
          )}
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-400 hover:text-slate-700" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-[10px] text-slate-400 -mt-4">Last refreshed {lastUpdated.toLocaleTimeString()}</p>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {data.kpis.map(kpi => {
          const tone = kpiTone(kpi);
          return (
            <div key={kpi.key} className={`card-stat p-4 border ${tone.card}`}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.08em]">{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 ${tone.value}`}>{kpi.value}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[10px] text-slate-400">{kpi.description}</p>
                {trendBadge(kpi)}
              </div>
            </div>
          );
        })}
      </div>

      {/* System activity time-series */}
      <SectionCard title="System Activity" icon={Activity} iconColor="text-blue-600"
        right={<span className="text-[10px] text-slate-400">{activeSeries.length} activity type(s)</span>}>
        {activeSeries.length === 0 ? (
          <EmptyState icon={Activity} title="No activity in this period"
            desc="No security, login, audit, reservation, visitor, document, or contract events were recorded for the selected range." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {activeSeries.map((s, i) => (
                  i === 0
                    ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} />
                    : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* Security analytics */}
      <SectionCard title="Security Analytics" icon={Shield} iconColor="text-rose-600"
        right={<span className="text-[10px] text-slate-400">{securityHasData ? `${data.security.total} events` : 'no events'}</span>}>
        {!securityHasData ? (
          <EmptyState icon={Shield} title="No security events in this period"
            desc="Security event logs will appear here once activity is recorded for the selected range." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              {data.security.byRiskLevel.map(r => (
                <div key={r.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{r.label}</span>
                  <span className="font-bold text-slate-900">{r.value}</span>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3 mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 flex items-center"><Lock className="w-3.5 h-3.5 mr-1.5 text-rose-400" /> Failed logins</span>
                  <span className="font-bold text-slate-900">{data.security.failedLogins}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 flex items-center"><Users className="w-3.5 h-3.5 mr-1.5 text-amber-500" /> Blocked IPs</span>
                  <span className="font-bold text-slate-900">{data.security.blockedIps}</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.security.overTime} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" name="Security events" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </SectionCard>

      {/* AI performance + System health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="AI Performance" icon={Cpu} iconColor="text-emerald-600"
          right={<span className="text-[10px] text-slate-400">{data.ai.source === 'IN_MEMORY' ? 'in-memory logs (since last restart)' : ''}</span>}>
          {!aiHasData ? (
            <EmptyState icon={Cpu} title="No AI requests yet"
              desc="AI request logs are held in memory and appear here once document classification, contract analysis, or visitor verification runs." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50"><p className="text-[10px] text-slate-500 font-semibold uppercase">Requests</p><p className="text-xl font-bold text-slate-900">{data.ai.totalRequests}</p></div>
                <div className="p-3 rounded-xl bg-slate-50"><p className="text-[10px] text-slate-500 font-semibold uppercase">Success rate</p><p className="text-xl font-bold text-emerald-600">{data.ai.successRate != null ? data.ai.successRate + '%' : 'N/A'}</p></div>
                <div className="p-3 rounded-xl bg-slate-50"><p className="text-[10px] text-slate-500 font-semibold uppercase">Avg latency</p><p className="text-xl font-bold text-slate-900">{data.ai.avgResponseTimeMs != null ? data.ai.avgResponseTimeMs + ' ms' : 'N/A'}</p></div>
                <div className="p-3 rounded-xl bg-slate-50"><p className="text-[10px] text-slate-500 font-semibold uppercase">Failed</p><p className="text-xl font-bold text-rose-600">{data.ai.failed}</p></div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Requests by provider</p>
                {data.ai.requestsByProvider.length === 0 ? (
                  <p className="text-xs text-slate-400">No provider-level breakdown recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {data.ai.requestsByProvider.map(p => (
                      <div key={p.label} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{p.label}</span>
                        <span className="font-bold text-slate-900">{p.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Provider health</p>
                {data.ai.providers.length === 0 ? (
                  <p className="text-xs text-slate-400">No AI providers configured.</p>
                ) : (
                  <div className="space-y-2">
                    {data.ai.providers.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{p.name}{p.isDefault && <span className="ml-1.5 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">default</span>}</span>
                        <span className={`text-xs font-semibold ${p.status === 'CONNECTED' ? 'text-emerald-600' : p.status === 'OFFLINE' ? 'text-rose-600' : 'text-slate-400'}`}>{p.status}{p.responseTime ? ` · ${p.responseTime}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="System Health" icon={Database} iconColor="text-blue-600"
          right={<span className="text-[10px] text-slate-400">{data.health.overallStatus}</span>}>
          <div className="space-y-3">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-xs text-slate-600">{data.health.healthyCount} healthy</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /><span className="text-xs text-slate-600">{data.health.warningCount} warning</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /><span className="text-xs text-slate-600">{data.health.offlineCount} offline</span>
              </div>
            </div>
            {data.health.components.length === 0 ? (
              <EmptyState icon={Database} title="No health data" desc="Subsystem health telemetry is not available yet." />
            ) : (
              <div className="space-y-2">
                {data.health.components.map(c => {
                  const meta = HEALTH_META[c.status] || HEALTH_META.HEALTHY;
                  return (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{c.name}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-slate-400">{c.uptimePercent}% uptime</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.badge}`}>{c.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Audit analytics */}
      <SectionCard title="Audit Analytics" icon={ScrollText} iconColor="text-blue-600"
        right={<span className="text-[10px] text-slate-400">{data.audit.total} audit entries</span>}>
        {data.audit.total === 0 ? (
          <EmptyState icon={ScrollText} title="No audit activity in this period"
            desc="Audit trail entries will appear here once actions are recorded for the selected range." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">By module</p>
              {data.audit.byModule.length === 0 ? <p className="text-xs text-slate-400">No module breakdown.</p> : (
                <div className="space-y-2">
                  {data.audit.byModule.map(m => (
                    <div key={m.label} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{m.label}</span>
                      <span className="font-bold text-slate-900">{m.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2 mt-4">By action</p>
              {data.audit.byAction.length === 0 ? <p className="text-xs text-slate-400">No action breakdown.</p> : (
                <div className="space-y-2">
                  {data.audit.byAction.map(a => (
                    <div key={a.label} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{a.label}</span>
                      <span className="font-bold text-slate-900">{a.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Highlights</p>
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                  <span className="text-xs text-slate-600">Most active module</span>
                  <span className="text-sm font-bold text-slate-900">{data.audit.mostActiveModule || 'N/A'}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                  <span className="text-xs text-slate-600">Most common action</span>
                  <span className="text-sm font-bold text-slate-900">{data.audit.mostCommonAction || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Documents / Contracts / Backups */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SectionCard title="Documents" icon={FileText} iconColor="text-cyan-600">
          <div className="space-y-3">
            {[
              { label: 'Total documents', value: data.documents.total },
              { label: 'Uploaded in period', value: data.documents.uploaded },
              { label: 'Archived', value: data.documents.archived },
              { label: 'AI classified', value: data.documents.aiClassified },
            ].map(d => (
              <div key={d.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{d.label}</span>
                <span className="font-bold text-slate-900">{d.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Contracts" icon={BookOpen} iconColor="text-slate-600">
          <div className="space-y-3">
            {[
              { label: 'Total contracts', value: data.contracts.total },
              { label: 'Active', value: data.contracts.active },
              { label: 'Expiring in 30 days', value: data.contracts.expiringSoon },
              { label: 'Expired', value: data.contracts.expired },
              { label: 'Renewed', value: data.contracts.renewed },
            ].map(c => (
              <div key={c.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{c.label}</span>
                <span className={`font-bold ${c.label.includes('Expiring') && c.value > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{c.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Backups" icon={Download} iconColor="text-amber-500">
          {data.backups.total === 0 ? (
            <EmptyState icon={Download} title="No backups in this period"
              desc="Backup records will appear here once a backup run is recorded for the selected range." />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-emerald-50 flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <div><p className="text-[10px] text-emerald-700 font-semibold uppercase">Success</p><p className="text-lg font-bold text-emerald-800">{data.backups.successCount}</p></div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 flex items-center space-x-2">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <div><p className="text-[10px] text-rose-700 font-semibold uppercase">Failed</p><p className="text-lg font-bold text-rose-800">{data.backups.failedCount}</p></div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Success rate</span>
                <span className="font-bold text-slate-900">{data.backups.successRate != null ? data.backups.successRate + '%' : 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 flex items-center"><Clock className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Last successful</span>
                <span className="font-bold text-slate-900 text-xs">{data.backups.lastSuccessfulAt ? new Date(data.backups.lastSuccessfulAt).toLocaleString() : 'Never'}</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Insights */}
      <SectionCard title="Insights" icon={TrendingUp} iconColor="text-emerald-600"
        right={<span className="text-[10px] text-slate-400">derived from real metrics</span>}>
        {data.insights.length === 0 ? (
          <EmptyState icon={Sparkles} title="No insights yet" desc="Insights are computed from real data once activity exists in the selected range." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.insights.map((insight, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide mb-2 ${INSIGHT_META[insight.severity] || INSIGHT_META.info}`}>{insight.severity}</span>
                <p className="text-sm font-bold text-slate-900">{insight.title}</p>
                <p className="text-xs text-slate-500 mt-1">{insight.description}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};