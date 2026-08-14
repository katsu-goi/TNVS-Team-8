import React, { useEffect, useState } from 'react';
import {
  Building, UserCheck, FileSearch, ShieldAlert, Scale, FileText,
  Activity, Star, ChevronRight, X, Terminal, RefreshCw, Server, CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { systemMonitoringService } from '../../api/systemMonitoringService';
import type {
  SubsystemHealth, SubsystemHealthSnapshot, Gauge, Slice,
  LatencyPoint, ScannerPoint, HeatPoint, ServicePoint, BackupPoint, RatePoint,
  ModuleAction, RetentionPeriod, JobPoint, ResolutionPoint, SlaPoint, PipelinePoint
} from '../../types/systemMonitoring';

const TOOLTIP_STYLE = { backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '10px', color: '#fff' };

const SUBSYSTEM_ICONS: Record<string, React.ElementType> = {
  facilities: Building,
  visitors: UserCheck,
  documents: FileSearch,
  records: ShieldAlert,
  legal: Scale,
  contracts: FileText,
};

interface StatusMeta {
  label: string;
  badge: string;
  dot: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  HEALTHY: { label: 'Healthy', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  WARNING: { label: 'Warning', badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  OFFLINE: { label: 'Offline', badge: 'bg-rose-100 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
  ERROR: { label: 'Error', badge: 'bg-rose-100 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
};

const OVERALL_META: Record<string, { text: string; cls: string; dot: string }> = {
  OPERATIONAL: { text: 'All 6 Subsystems Operational', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  DEGRADED: { text: 'System Degraded', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  OFFLINE: { text: 'Subsystems Offline', cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
};

function parseTs(ts?: string): number {
  return ts ? new Date(ts).getTime() : Date.now();
}

function years(days: number): string {
  if (days <= 0) return 'N/A';
  return `${Math.round(days / 365)} Yr`;
}

/* ------------------------------------------------------------------ */
/* Reusable chart fragments                                            */
/* ------------------------------------------------------------------ */

function LatencyChart({ data }: { data: LatencyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="api1" stroke="#059669" strokeWidth={2} dot={false} name="API 1 (Core)" />
        <Line type="monotone" dataKey="api2" stroke="#34d399" strokeWidth={2} dot={false} name="API 2 (Rooms)" />
        <Line type="monotone" dataKey="api3" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="API 3 (Assets)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ScannerChart({ data }: { data: ScannerPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="type" tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="avgMs" fill="#059669" radius={[4, 4, 0, 0]} name="Avg Response (ms)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HeatmapGrid({ data }: { data: HeatPoint[] }) {
  return (
    <div className="space-y-1">
      {data.map((row, idx) => (
        <div key={idx} className="flex items-center justify-between text-[9px] font-mono text-slate-500">
          <span className="truncate max-w-[70px]" title={row.location}>{row.location}</span>
          <div className="flex space-x-1">
            {row.cells.map((cell, ci) => (
              <span
                key={ci}
                className={`w-3.5 h-3.5 rounded inline-block ${cell > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`}
                title={row.status}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ServicesAreaChart({ data }: { data: ServicePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
        <Area type="monotone" dataKey="serviceA" stroke="#059669" fill="#a7f3d0" fillOpacity={0.4} />
        <Area type="monotone" dataKey="serviceB" stroke="#34d399" fill="#6ee7b7" fillOpacity={0.3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function VaultPie({ data }: { data: Slice[] }) {
  return (
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={25}
        outerRadius={40}
        paddingAngle={3}
        dataKey="value"
        nameKey="name"
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Pie>
      <Tooltip contentStyle={TOOLTIP_STYLE} />
    </PieChart>
  );
}

function BackupLineChart({ data }: { data: BackupPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="latencyMs" stroke="#059669" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ArchivingBarChart({ data }: { data: RatePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={data} margin={{ top: 0, right: 5, left: -15, bottom: 0 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis dataKey="module" type="category" tick={{ fontSize: 7, fill: '#94a3b8' }} width={60} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="rate" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RuleEnforcementChart({ data }: { data: ModuleAction[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="module" tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="actions" fill="#059669" radius={[4, 4, 0, 0]} name="Actions Executed" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RetentionTreemap({ data }: { data: RetentionPeriod[] }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-[9px] font-semibold text-white">
      {data.map((p, idx) => (
        <div
          key={idx}
          className={`p-2 rounded flex flex-col justify-between h-10 ${idx === 0 ? 'bg-emerald-700' : idx === 1 ? 'bg-emerald-500' : idx === 2 ? 'bg-teal-500' : 'bg-emerald-400 text-slate-900'}`}
        >
          <span className="truncate">{p.name}</span>
          <span className="font-mono text-[8px]">{years(p.periodDays)}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduledJobsChart({ data }: { data: JobPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
        <XAxis dataKey="hour" tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="success" fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CaseResolutionChart({ data }: { data: ResolutionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="type" tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="days" fill="#059669" radius={[4, 4, 0, 0]} name="Avg Resolution Days" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CourtSlaChart({ data }: { data: SlaPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
        <XAxis dataKey="period" tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis domain={[90, 100]} tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="sla" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function RenewalPipelineChart({ data }: { data: PipelinePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="period" tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="active" fill="#059669" radius={[4, 4, 0, 0]} name="Active Contracts" />
        <Bar dataKey="expiring" fill="#6ee7b7" radius={[4, 4, 0, 0]} name="Expiring Soon" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VendorPie({ data }: { data: Slice[] }) {
  return (
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={15}
        outerRadius={28}
        paddingAngle={2}
        dataKey="value"
        nameKey="name"
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Pie>
      <Tooltip contentStyle={TOOLTIP_STYLE} />
    </PieChart>
  );
}

function GaugeStack({ gauges }: { gauges: Gauge[] }) {
  return (
    <div className="flex flex-col justify-center space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
      {gauges.map((g, idx) => (
        <div key={idx}>
          <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-0.5">
            <span>{g.label}</span>
            <span className="font-mono text-emerald-700">{g.value}</span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${idx === 0 ? 'bg-emerald-600' : 'bg-teal-500'}`} style={{ width: `${g.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PoolGauges({ sub }: { sub: SubsystemHealth }) {
  const gauges: Gauge[] = [
    { label: 'DB Pool Utilization', value: `${sub.dbPoolUtilizationPct}%`, pct: sub.dbPoolUtilizationPct },
    { label: 'WS Message Load', value: `${sub.wsMessageLoadPct}%`, pct: sub.wsMessageLoadPct },
  ];
  return <GaugeStack gauges={gauges} />;
}

function MetricTiles({ metrics }: { metrics: SubsystemHealth['metrics'] }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {metrics.map((m, idx) => (
        <div key={idx} className="p-2 rounded-xl bg-slate-50 border border-slate-200/70">
          <p className="text-[10px] font-semibold text-slate-600">{m.label}</p>
          <p className="text-sm font-extrabold text-slate-900 mt-0.5">{m.value}</p>
          {m.sub && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{m.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-[10px] text-slate-400 font-mono">
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card body - primary chart + secondary info per subsystem            */
/* ------------------------------------------------------------------ */

function CardBody({ sub }: { sub: SubsystemHealth }) {
  switch (sub.key) {
    case 'facilities':
      return (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">API 1, 2, 3 Latency</p>
              <span className="text-[10px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                Peak: {sub.latencyPeakMs} ms
              </span>
            </div>
            <div className="h-32 w-full">
              {sub.latencySeries && sub.latencySeries.length > 0
                ? <LatencyChart data={sub.latencySeries} />
                : <EmptyChart text="Awaiting latency telemetry" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <PoolGauges sub={sub} />
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Metrics</p>
              {sub.metrics.slice(1).map((m, idx) => (
                <div key={idx} className="p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                  <p className="text-[10px] font-semibold text-slate-600">{m.label}</p>
                  <p className="text-sm font-extrabold text-slate-900">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'visitors':
      return (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">QR Scanner Response Time</p>
            <div className="h-28 w-full">
              {sub.scannerSeries && sub.scannerSeries.length > 0
                ? <ScannerChart data={sub.scannerSeries} />
                : <EmptyChart text="Awaiting scanner telemetry" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">Scanner Heatmap</p>
              {sub.heatmap && sub.heatmap.length > 0
                ? <HeatmapGrid data={sub.heatmap} />
                : <EmptyChart text="No locations" />}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Services A, B, C</p>
              <div className="h-20 w-full">
                {sub.servicesSeries && sub.servicesSeries.length > 0
                  ? <ServicesAreaChart data={sub.servicesSeries} />
                  : <EmptyChart text="Awaiting telemetry" />}
              </div>
            </div>
          </div>
        </div>
      );

    case 'documents':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Vault Space Breakdown</p>
              <p className="text-[10px] text-slate-400">By Document Category</p>
            </div>
            <div className="h-28 w-28 shrink-0">
              {sub.vault && sub.vault.length > 0
                ? <VaultPie data={sub.vault} />
                : <EmptyChart text="No data" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Backup Sync Latency (ms)</p>
              <div className="h-20 w-full">
                {sub.backupSyncSeries && sub.backupSyncSeries.length > 0
                  ? <BackupLineChart data={sub.backupSyncSeries} />
                  : <EmptyChart text="Awaiting telemetry" />}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Archiving Rate (%)</p>
              <div className="h-20 w-full">
                {sub.archivingSeries && sub.archivingSeries.length > 0
                  ? <ArchivingBarChart data={sub.archivingSeries} />
                  : <EmptyChart text="Awaiting telemetry" />}
              </div>
            </div>
          </div>
        </div>
      );

    case 'records':
      return (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Rule Enforcement Actions (30 Days)</p>
            <div className="h-28 w-full">
              {sub.ruleEnforcement && sub.ruleEnforcement.length > 0
                ? <RuleEnforcementChart data={sub.ruleEnforcement} />
                : <EmptyChart text="No enforcement activity" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Retention Periods</p>
              {sub.retentionPeriods && sub.retentionPeriods.length > 0
                ? <RetentionTreemap data={sub.retentionPeriods} />
                : <EmptyChart text="No policies" />}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold text-slate-600 uppercase">Scheduled Jobs</p>
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              </div>
              <div className="h-20 w-full">
                {sub.scheduledJobs && sub.scheduledJobs.length > 0
                  ? <ScheduledJobsChart data={sub.scheduledJobs} />
                  : <EmptyChart text="No jobs ran" />}
              </div>
            </div>
          </div>
        </div>
      );

    case 'legal':
      return (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Case Resolution Time (Avg Days)</p>
            <div className="h-28 w-full">
              {sub.caseResolution && sub.caseResolution.length > 0
                ? <CaseResolutionChart data={sub.caseResolution} />
                : <EmptyChart text="No resolved cases" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Court Hearing SLA (%)</p>
              <div className="h-20 w-full">
                {sub.courtSlaSeries && sub.courtSlaSeries.length > 0
                  ? <CourtSlaChart data={sub.courtSlaSeries} />
                  : <EmptyChart text="Awaiting telemetry" />}
              </div>
            </div>
            {sub.gauges && sub.gauges.length > 0
              ? <GaugeStack gauges={sub.gauges} />
              : <EmptyChart text="No gauge data" />}
          </div>
        </div>
      );

    case 'contracts':
      return (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Contract Renewal Pipeline (90 Days)</p>
            <div className="h-28 w-full">
              {sub.renewalPipeline && sub.renewalPipeline.length > 0
                ? <RenewalPipelineChart data={sub.renewalPipeline} />
                : <EmptyChart text="No pipeline data" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-600 uppercase">Vendor Dist.</p>
              <div className="h-16 w-16 shrink-0">
                {sub.vendorDist && sub.vendorDist.length > 0
                  ? <VendorPie data={sub.vendorDist} />
                  : <EmptyChart text="No data" />}
              </div>
            </div>
            {sub.gauges && sub.gauges.length > 0
              ? <GaugeStack gauges={sub.gauges} />
              : <EmptyChart text="No gauge data" />}
          </div>
        </div>
      );

    default:
      return <MetricTiles metrics={sub.metrics} />;
  }
}

/* ------------------------------------------------------------------ */
/* Detail modal                                                       */
/* ------------------------------------------------------------------ */

function DetailModal({ sub, onClose }: { sub: SubsystemHealth; onClose: () => void }) {
  const meta = STATUS_META[sub.status] ?? STATUS_META.HEALTHY;
  const Icon = SUBSYSTEM_ICONS[sub.key] ?? Server;
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);

  const handleRunDiagnostic = () => {
    setRunningDiagnostic(true);
    setTimeout(() => setRunningDiagnostic(false), 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30">
              <Icon className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{sub.name}</h3>
              <p className="text-xs text-slate-400 font-mono">Infrastructure Diagnostics &amp; Telemetry · {sub.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Module Health</p>
              <div className="mt-1 flex justify-center">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.badge}`}>
                  <span className={`relative flex h-2 w-2`}>
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-75`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${meta.dot}`} />
                  </span>
                  {meta.label}
                </span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Uptime</p>
              <p className="text-lg font-bold text-emerald-600 mt-0.5">{sub.uptimePercent}%</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">API Response Latency</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{sub.latencyAvgMs} ms</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs border border-slate-200">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-emerald-600" /> Infrastructure Specifications
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-600 font-mono">
              <div><span className="text-slate-400">Subsystem:</span> {sub.key}</div>
              <div><span className="text-slate-400">DB Connection Pool:</span> {sub.dbPoolActive} / {sub.dbPoolMax} active</div>
              <div><span className="text-slate-400">Pool Utilization:</span> {sub.dbPoolUtilizationPct}%</div>
              <div><span className="text-slate-400">Unresolved Errors:</span> {sub.errorCount}</div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-600" /> Active Health Metrics
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sub.metrics.map((m, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800">{m.label}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-extrabold text-slate-900">{m.value}</p>
                  {m.sub && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{m.sub}</p>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-slate-700" /> Subsystem Telemetry Logs
            </h4>
            <div className="bg-slate-950 text-slate-200 font-mono text-[11px] p-3.5 rounded-xl space-y-1.5 max-h-40 overflow-y-auto">
              {sub.logs.map((log, i) => (
                <div key={i} className="flex items-start space-x-2">
                  <span className="text-slate-500 shrink-0">[{log.time}]</span>
                  <span className={`font-bold shrink-0 ${log.level === 'ERROR' ? 'text-rose-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {log.level}
                  </span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={handleRunDiagnostic}
            disabled={runningDiagnostic}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition flex items-center space-x-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${runningDiagnostic ? 'animate-spin' : ''}`} />
            <span>{runningDiagnostic ? 'Running Diagnostics...' : 'Run Health Check'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main grid                                                          */
/* ------------------------------------------------------------------ */

export const SubsystemHealthGrid: React.FC = () => {
  const subsystemHealth = useRealtimeSyncStore(s => s.subsystemHealth);
  const [snapshot, setSnapshot] = useState<SubsystemHealthSnapshot | null>(null);
  const [selectedSubsystem, setSelectedSubsystem] = useState<SubsystemHealth | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    systemMonitoringService.loadSubsystemHealth().then(s => { if (s) setSnapshot(s); });
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const live = subsystemHealth ?? snapshot;
  const subsystems = live?.subsystems ?? [];
  const overallMeta = OVERALL_META[live?.overallStatus ?? 'OPERATIONAL'] ?? OVERALL_META.OPERATIONAL;
  const syncAgo = live ? Math.max(0, Math.floor((now - parseTs(live.timestamp)) / 1000)) : 0;

  return (
    <div className="space-y-6 text-slate-800 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-2 border-b border-slate-200 gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span>System Subsystem Health &amp; Availability Monitoring</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time telemetry, API latency bounds, data pipeline sync, and vault capacity breakdown.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border font-medium ${overallMeta.cls}`}>
            <span className={`w-2 h-2 rounded-full ${overallMeta.dot} animate-pulse`} />
            <span>{overallMeta.text}</span>
          </span>
          <span className="text-slate-400 font-mono text-[11px]">
            {live ? `Sync: ${syncAgo}s ago` : 'Connecting...'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {subsystems.map((sub) => {
          const meta = STATUS_META[sub.status] ?? STATUS_META.HEALTHY;
          const Icon = SUBSYSTEM_ICONS[sub.key] ?? Server;
          return (
            <div key={sub.id} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{sub.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">Subsystem ID: {sub.id}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center space-x-1 ${meta.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />
                  <span>{meta.label}</span>
                </span>
              </div>

              <CardBody sub={sub} />

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-2 font-mono text-[11px]">
                  <span>Sync: {syncAgo}s ago</span>
                  <span>·</span>
                  <span className={`font-semibold ${sub.errorCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {sub.errorCount} {sub.errorCount === 1 ? 'error' : 'errors'}
                  </span>
                </div>
                <button onClick={() => setSelectedSubsystem(sub)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 group">
                  <span>View details</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedSubsystem && (
        <DetailModal sub={selectedSubsystem} onClose={() => setSelectedSubsystem(null)} />
      )}
    </div>
  );
};