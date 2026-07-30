import React, { useState } from 'react';
import {
  Building2, Users, FileText, Archive, Scale, FileSignature,
  ChevronRight, Server, Activity, RefreshCw, X, Terminal, Clock
} from 'lucide-react';

export type StatusLevel = 'Healthy' | 'Warning' | 'Offline';

export interface MonitoringMetric {
  label: string;
  value: string;
  status: StatusLevel;
  sub?: string;
}

export interface ModuleMonitoringData {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  accentBg: string;
  badgeBg: string;
  moduleStatus: StatusLevel;
  lastSync: string;
  errorCount: number;
  metrics: MonitoringMetric[];
  endpoint: string;
  uptime: string;
  latencyMs: number;
  dbConnectionPool: string;
  version: string;
  detailedLogs: Array<{ time: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string }>;
}

const getStatusBadge = (status: StatusLevel) => {
  switch (status) {
    case 'Healthy':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          🟢 Healthy
        </span>
      );
    case 'Warning':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          🟡 Warning
        </span>
      );
    case 'Offline':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          🔴 Offline
        </span>
      );
  }
};

const getMiniStatusDot = (status: StatusLevel) => {
  switch (status) {
    case 'Healthy':
      return <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Healthy" />;
    case 'Warning':
      return <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Warning" />;
    case 'Offline':
      return <span className="inline-block w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Offline" />;
  }
};

export const KpiCardSection: React.FC = () => {
  const [selectedModule, setSelectedModule] = useState<ModuleMonitoringData | null>(null);
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);

  const modules: ModuleMonitoringData[] = [
    {
      id: 'facilities',
      title: 'Facilities Reservation System',
      icon: Building2,
      color: 'text-blue-600',
      accentBg: 'bg-blue-50/80 border-blue-200',
      badgeBg: 'bg-blue-100 text-blue-800',
      moduleStatus: 'Healthy',
      lastSync: 'Just now',
      errorCount: 0,
      endpoint: '/api/facilities/health',
      uptime: '99.98%',
      latencyMs: 1.2,
      dbConnectionPool: '8 / 20 connections active',
      version: 'v2.4.1',
      metrics: [
        { label: 'Module Status', value: 'Online', status: 'Healthy', sub: 'Subsystem Operational' },
        { label: 'Database Connection', value: 'Connected', status: 'Healthy', sub: 'H2/PostgreSQL Pool Active (1.2ms)' },
        { label: 'API Status', value: 'REST & WS Active', status: 'Healthy', sub: 'HTTP 200 OK · 0 dropped frames' },
        { label: 'Storage Usage', value: '14.2 GB / 100 GB', status: 'Healthy', sub: '14.2% Capacity Allocated' },
      ],
      detailedLogs: [
        { time: '18:10:02', level: 'INFO', message: 'Database connection pool check completed (8/20 active connections).' },
        { time: '18:05:14', level: 'INFO', message: 'WebSocket /topic/dashboard/metrics payload delivered.' },
        { time: '17:55:29', level: 'INFO', message: 'Flyway migration verified database schema tables.' }
      ]
    },
    {
      id: 'visitors',
      title: 'Visitor Management System',
      icon: Users,
      color: 'text-purple-600',
      accentBg: 'bg-purple-50/80 border-purple-200',
      badgeBg: 'bg-purple-100 text-purple-800',
      moduleStatus: 'Healthy',
      lastSync: '4s ago',
      errorCount: 0,
      endpoint: '/api/visitors/health',
      uptime: '99.95%',
      latencyMs: 0.9,
      dbConnectionPool: '5 / 15 connections active',
      version: 'v1.8.0',
      metrics: [
        { label: 'Module Status', value: 'Online', status: 'Healthy', sub: 'Subsystem Operational' },
        { label: 'QR Scanner Status', value: 'Active', status: 'Healthy', sub: 'ZXing Camera Engine Online (60 fps)' },
        { label: 'Database Connection', value: 'Connected', status: 'Healthy', sub: 'Primary DB Pool Active (0.9ms)' },
        { label: 'API Status', value: 'REST Service Active', status: 'Healthy', sub: 'Visitor Controller Endpoint 200 OK' },
      ],
      detailedLogs: [
        { time: '18:10:10', level: 'INFO', message: 'QR Code verification service initialized successfully.' },
        { time: '18:04:30', level: 'INFO', message: 'Visitor check-in event listener synced with database.' }
      ]
    },
    {
      id: 'documents',
      title: 'Document Management (Archiving)',
      icon: FileText,
      color: 'text-cyan-600',
      accentBg: 'bg-cyan-50/80 border-cyan-200',
      badgeBg: 'bg-cyan-100 text-cyan-800',
      moduleStatus: 'Healthy',
      lastSync: 'Just now',
      errorCount: 0,
      endpoint: '/api/documents/health',
      uptime: '100.00%',
      latencyMs: 1.5,
      dbConnectionPool: '12 / 25 connections active',
      version: 'v3.1.2',
      metrics: [
        { label: 'Module Status', value: 'Online', status: 'Healthy', sub: 'Subsystem Operational' },
        { label: 'Storage Usage', value: '128.4 GB / 500 GB', status: 'Healthy', sub: '25.6% Vault Capacity Used' },
        { label: 'Indexing Service Status', value: 'Active', status: 'Healthy', sub: 'Tesseract OCR & Apache Tika Online' },
        { label: 'Backup Status', value: 'Synced', status: 'Healthy', sub: 'Daily Automated Incremental Active' },
      ],
      detailedLogs: [
        { time: '18:11:00', level: 'INFO', message: 'Tesseract OCR engine standing by for incoming scans.' },
        { time: '18:02:45', level: 'INFO', message: 'Document storage vault integrity check: PASSED.' }
      ]
    },
    {
      id: 'records',
      title: 'Records Retention & Compliance',
      icon: Archive,
      color: 'text-teal-600',
      accentBg: 'bg-teal-50/80 border-teal-200',
      badgeBg: 'bg-teal-100 text-teal-800',
      moduleStatus: 'Healthy',
      lastSync: '8s ago',
      errorCount: 0,
      endpoint: '/api/records/health',
      uptime: '99.99%',
      latencyMs: 1.1,
      dbConnectionPool: '4 / 10 connections active',
      version: 'v2.0.4',
      metrics: [
        { label: 'Module Status', value: 'Online', status: 'Healthy', sub: 'Subsystem Operational' },
        { label: 'Active Policies', value: '12 Enforced', status: 'Healthy', sub: 'Compliance Rules Enforced' },
        { label: 'Scheduled Jobs Status', value: '04:00 AM Cron Active', status: 'Healthy', sub: 'Retention Cron Scheduler Running' },
        { label: 'Compliance Engine Status', value: 'Active', status: 'Healthy', sub: 'Llama 3.3 Rule Classifier Online' },
      ],
      detailedLogs: [
        { time: '18:08:20', level: 'INFO', message: 'Retention policy scheduler heartbeat OK.' },
        { time: '18:00:00', level: 'INFO', message: 'Automatic purge task scheduled for 04:00 AM UTC.' }
      ]
    },
    {
      id: 'legal',
      title: 'Legal Management System',
      icon: Scale,
      color: 'text-rose-600',
      accentBg: 'bg-rose-50/80 border-rose-200',
      badgeBg: 'bg-rose-100 text-rose-800',
      moduleStatus: 'Healthy',
      lastSync: '2s ago',
      errorCount: 0,
      endpoint: '/api/legal/health',
      uptime: '100.00%',
      latencyMs: 1.0,
      dbConnectionPool: '6 / 15 connections active',
      version: 'v1.5.1',
      metrics: [
        { label: 'Module Status', value: 'Online', status: 'Healthy', sub: 'Subsystem Operational' },
        { label: 'Database Status', value: 'Connected', status: 'Healthy', sub: 'Secure DB Cluster (1.1ms)' },
        { label: 'Encryption Status', value: 'AES-256 Active', status: 'Healthy', sub: 'Hardware Key Encryption Active' },
        { label: 'Audit Logging Status', value: 'Real-time Stream', status: 'Healthy', sub: '100% Immutable Audit Trail' },
      ],
      detailedLogs: [
        { time: '18:09:40', level: 'INFO', message: 'AES-256 encryption key validation successful.' },
        { time: '18:01:12', level: 'INFO', message: 'Security audit listener captured legal module access log.' }
      ]
    },
    {
      id: 'contracts',
      title: 'Contract Management System',
      icon: FileSignature,
      color: 'text-indigo-600',
      accentBg: 'bg-indigo-50/80 border-indigo-200',
      badgeBg: 'bg-indigo-100 text-indigo-800',
      moduleStatus: 'Healthy',
      lastSync: 'Just now',
      errorCount: 0,
      endpoint: '/api/contracts/health',
      uptime: '99.97%',
      latencyMs: 0.8,
      dbConnectionPool: '7 / 20 connections active',
      version: 'v2.2.0',
      metrics: [
        { label: 'Module Status', value: 'Online', status: 'Healthy', sub: 'Subsystem Operational' },
        { label: 'Database Status', value: 'Connected', status: 'Healthy', sub: 'Primary Contract DB (0.8ms)' },
        { label: 'Digital Signature Service', value: 'PKI Service Active', status: 'Healthy', sub: 'RSA 4096-bit Provider Online' },
        { label: 'Contract Repository Status', value: 'Secure Vault Online', status: 'Healthy', sub: 'Repository Storage Accessible' },
      ],
      detailedLogs: [
        { time: '18:10:55', level: 'INFO', message: 'Digital signature verification provider ready.' },
        { time: '18:03:10', level: 'INFO', message: 'Contract expiration notification trigger verified.' }
      ]
    }
  ];

  const handleRunDiagnostic = () => {
    setRunningDiagnostic(true);
    setTimeout(() => {
      setRunningDiagnostic(false);
    }, 800);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-heading text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            System Subsystem Health & Availability Monitoring
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status indicators, database connectivity, storage, and API health for all enterprise modules
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Monitoring Active (Green GSM Standard)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <div
              key={module.id}
              className="glass-panel p-5 relative overflow-hidden transition-all duration-300 hover:shadow-lg border border-slate-200/80 hover:border-emerald-300 group flex flex-col justify-between"
            >
              {/* Top Accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 opacity-90" />

              <div>
                {/* Header */}
                <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2.5 rounded-xl border ${module.accentBg} shadow-sm group-hover:scale-105 transition-transform`}>
                      <Icon className={`w-5 h-5 ${module.color}`} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 leading-snug">{module.title}</h3>
                      <p className="text-[11px] text-slate-400 font-mono">{module.endpoint} · Uptime {module.uptime}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    {getStatusBadge(module.moduleStatus)}
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  {module.metrics.map((metric, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50/90 rounded-xl p-3 border border-slate-100/80 hover:bg-white hover:border-slate-200 transition-all"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          {getMiniStatusDot(metric.status)}
                          {metric.label}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 leading-tight">{metric.value}</p>
                      {metric.sub && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">{metric.sub}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Card Footer: Last Sync, Errors, View Details */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Sync: <strong className="text-slate-700 font-medium">{module.lastSync}</strong>
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    module.errorCount === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {module.errorCount === 0 ? '0 errors' : `${module.errorCount} error(s)`}
                  </span>
                </div>

                <button
                  onClick={() => setSelectedModule(module)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-emerald-600 hover:text-white font-semibold text-xs transition-all duration-200 flex items-center gap-1 shadow-sm group-hover:bg-emerald-600 group-hover:text-white"
                >
                  <span>View details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Module Monitoring Telemetry Details Modal */}
      {selectedModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30">
                  <selectedModule.icon className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-heading">{selectedModule.title}</h3>
                  <p className="text-xs text-slate-400 font-mono">Infrastructure Diagnostics & Telemetry Log</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedModule(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Telemetry Overview Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Module Health</p>
                  <div className="mt-1 flex justify-center">{getStatusBadge(selectedModule.moduleStatus)}</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Uptime</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">{selectedModule.uptime}</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">API Response Latency</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{selectedModule.latencyMs} ms</p>
                </div>
              </div>

              {/* Module Details & Environment */}
              <div className="glass-panel p-4 space-y-2 text-xs">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-emerald-600" /> Infrastructure Specifications
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-600 font-mono">
                  <div><span className="text-slate-400">Endpoint API:</span> {selectedModule.endpoint}</div>
                  <div><span className="text-slate-400">Subsystem Version:</span> {selectedModule.version}</div>
                  <div><span className="text-slate-400">DB Connection Pool:</span> {selectedModule.dbConnectionPool}</div>
                  <div><span className="text-slate-400">Unresolved Errors:</span> {selectedModule.errorCount}</div>
                </div>
              </div>

              {/* Health Monitoring Metrics List */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-600" /> Active Health Metrics
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedModule.metrics.map((m, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800">{m.label}</span>
                        {getMiniStatusDot(m.status)}
                      </div>
                      <p className="text-sm font-extrabold text-slate-900">{m.value}</p>
                      {m.sub && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{m.sub}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagnostic Telemetry Logs */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-slate-700" /> Subsystem Telemetry Logs
                </h4>
                <div className="bg-slate-950 text-slate-200 font-mono text-[11px] p-3.5 rounded-xl space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedModule.detailedLogs.map((log, i) => (
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

            {/* Modal Footer */}
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
                onClick={() => setSelectedModule(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
