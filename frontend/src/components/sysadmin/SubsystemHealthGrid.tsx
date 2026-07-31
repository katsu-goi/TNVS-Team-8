import React, { useState } from 'react';
import {
  Building, UserCheck, FileSearch, ShieldAlert, Scale, FileText,
  Activity, Star, ChevronRight, X, Terminal, RefreshCw, Server, CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';

// Mock Data for Subsystems
const API_LATENCY_DATA = [
  { time: '00:00', api1: 42, api2: 55, api3: 38 },
  { time: '04:00', api1: 45, api2: 50, api3: 40 },
  { time: '08:00', api1: 180, api2: 210, api3: 165 }, // Peak
  { time: '12:00', api1: 110, api2: 130, api3: 95 },
  { time: '16:00', api1: 95, api2: 115, api3: 88 },
  { time: '20:00', api1: 52, api2: 60, api3: 48 },
  { time: '24:00', api1: 40, api2: 48, api3: 35 },
];

const CORE_VS_BACKUP_DATA = [
  { category: 'Reservations', core: 450, backups: 450 },
  { category: 'Rooms', core: 120, backups: 120 },
  { category: 'Assets', core: 380, backups: 380 },
  { category: 'Logs', core: 890, backups: 890 },
];

const SCATTER_SCANNER_DATA = [
  { device: 'Handheld QR', avgMs: 42, count: 1200 },
  { device: 'Turnstile Kiosk', avgMs: 18, count: 3400 },
  { device: 'Desktop Station', avgMs: 25, count: 850 },
  { device: 'Mobile App Scanner', avgMs: 65, count: 920 },
];

const HEATMAP_DATA = [
  { loc: 'Gate 1 North', h1: 'ok', h2: 'ok', h3: 'ok', h4: 'ok', h5: 'ok' },
  { loc: 'Gate 2 Main', h1: 'ok', h2: 'warn', h3: 'ok', h4: 'ok', h5: 'ok' },
  { loc: 'HQ Lobby Kiosk', h1: 'ok', h2: 'ok', h3: 'ok', h4: 'ok', h5: 'ok' },
  { loc: 'VIP Entrance', h1: 'ok', h2: 'ok', h3: 'ok', h4: 'ok', h5: 'ok' },
];

const SERVICES_ABC_DATA = [
  { time: '08:00', serviceA: 99.9, serviceB: 99.5, serviceC: 100 },
  { time: '10:00', serviceA: 99.8, serviceB: 99.9, serviceC: 99.7 },
  { time: '12:00', serviceA: 100, serviceB: 98.9, serviceC: 99.9 },
  { time: '14:00', serviceA: 99.9, serviceB: 99.7, serviceC: 100 },
  { time: '16:00', serviceA: 100, serviceB: 99.9, serviceC: 100 },
];

const VAULT_SPACE_RING = [
  { name: 'Legal Contracts', value: 35, color: '#059669' },
  { name: 'Visitor Scans', value: 25, color: '#10b981' },
  { name: 'Facility Audit Logs', value: 20, color: '#34d399' },
  { name: 'Personnel Files', value: 12, color: '#6ee7b7' },
  { name: 'Others', value: 8, color: '#a7f3d0' },
];

const BACKUP_SYNC_LATENCY = [
  { day: 'Mon', latencyMs: 142 },
  { day: 'Tue', latencyMs: 135 },
  { day: 'Wed', latencyMs: 168 },
  { day: 'Thu', latencyMs: 128 },
  { day: 'Fri', latencyMs: 150 },
  { day: 'Sat', latencyMs: 112 },
  { day: 'Sun', latencyMs: 105 },
];

const ARCHIVING_RATE_DATA = [
  { module: 'Legal Docs', rate: 98 },
  { module: 'Contracts', rate: 95 },
  { module: 'Visitor Logs', rate: 92 },
  { module: 'Reservations', rate: 88 },
];

const RULE_ENFORCEMENT_DATA = [
  { module: 'Facilities', actions: 142 },
  { module: 'Visitors', actions: 230 },
  { module: 'Documents', actions: 410 },
  { module: 'Records', actions: 520 },
  { module: 'Legal', actions: 185 },
];

const SCHEDULED_JOBS_DATA = [
  { hour: '02:00', success: 12, failed: 0 },
  { hour: '06:00', success: 24, failed: 0 },
  { hour: '10:00', success: 38, failed: 0 },
  { hour: '14:00', success: 42, failed: 0 },
  { hour: '18:00', success: 30, failed: 0 },
  { hour: '22:00', success: 18, failed: 0 },
];

// Legal Management Data
const LEGAL_CASE_RESOLUTION_DATA = [
  { type: 'Property Claims', days: 14 },
  { type: 'Contract Disputes', days: 28 },
  { type: 'Regulatory Compliance', days: 9 },
  { type: 'Visitor Incident Review', days: 5 },
  { type: 'Vendor Arbitration', days: 21 },
];

const COURT_HEARING_SLA = [
  { month: 'Jan', sla: 97.5 },
  { month: 'Feb', sla: 98.2 },
  { month: 'Mar', sla: 99.1 },
  { month: 'Apr', sla: 98.8 },
  { month: 'May', sla: 99.4 },
];

// Contract Management Data
const CONTRACT_EXPIRATION_PIPELINE = [
  { period: '0-30 Days', active: 14, expiring: 3 },
  { period: '31-60 Days', active: 28, expiring: 8 },
  { period: '61-90 Days', active: 45, expiring: 12 },
  { period: '90+ Days', active: 110, expiring: 2 },
];

const CONTRACT_VENDOR_DIST = [
  { name: 'Facilities Maintenance', value: 40, color: '#059669' },
  { name: 'Security & Surveillance', value: 30, color: '#10b981' },
  { name: 'IT Infrastructure', value: 20, color: '#34d399' },
  { name: 'Legal Services', value: 10, color: '#a7f3d0' },
];

export interface SubsystemDetail {
  id: string;
  subsystemId: string;
  title: string;
  icon: React.ElementType;
  endpoint: string;
  uptime: string;
  latencyMs: number;
  dbPool: string;
  version: string;
  errorCount: number;
  status: 'Healthy' | 'Warning' | 'Offline';
  metrics: Array<{ label: string; value: string; sub?: string }>;
  logs: Array<{ time: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string }>;
}

const SUBSYSTEM_TELEMETRY_MAP: Record<string, SubsystemDetail> = {
  'SYS-FAC-01': {
    id: 'facilities',
    subsystemId: 'SYS-FAC-01',
    title: 'Facilities Reservation System',
    icon: Building,
    endpoint: '/api/facilities/health',
    uptime: '99.98%',
    latencyMs: 1.2,
    dbPool: '8 / 20 connections active',
    version: 'v2.4.1',
    errorCount: 0,
    status: 'Healthy',
    metrics: [
      { label: 'API 1, 2, 3 Latency Bounds', value: '1.2 ms avg', sub: 'Peak 210 ms @ 08:00' },
      { label: 'Core Files vs Backups', value: '450 / 450 synced', sub: '100% Data Parity Verified' },
      { label: 'DB Pool Utilization', value: '64%', sub: 'H2/PostgreSQL Pool Active' },
      { label: 'WS Message Load', value: '38%', sub: 'Real-time WebSocket Stream OK' },
    ],
    logs: [
      { time: '14:07:02', level: 'INFO', message: 'Database connection pool check completed (8/20 active).' },
      { time: '14:05:14', level: 'INFO', message: 'WebSocket /topic/facilities/reservation payload delivered.' },
      { time: '13:55:29', level: 'INFO', message: 'Flyway migration verified database schema tables.' },
    ],
  },
  'SYS-VIS-02': {
    id: 'visitors',
    subsystemId: 'SYS-VIS-02',
    title: 'Visitor Management System',
    icon: UserCheck,
    endpoint: '/api/visitors/health',
    uptime: '99.95%',
    latencyMs: 0.9,
    dbPool: '5 / 15 connections active',
    version: 'v1.8.0',
    errorCount: 0,
    status: 'Healthy',
    metrics: [
      { label: 'QR Scanner Response Time', value: '18 - 65 ms', sub: 'ZXing Camera Engine Online (60 fps)' },
      { label: 'Scanner Status Heatmap', value: '4 Locations OK', sub: 'Gate 1, Gate 2, HQ Lobby, VIP Entrance' },
      { label: 'Services A, B, C Status', value: '99.9% Uptime', sub: 'All 3 Service Pipelines Active' },
      { label: 'Database Connection', value: 'Connected', sub: 'Primary DB Pool Active (0.9ms)' },
    ],
    logs: [
      { time: '14:06:50', level: 'INFO', message: 'QR Code verification service initialized successfully.' },
      { time: '14:02:10', level: 'INFO', message: 'Turnstile gate scanner heartbeat ACK received.' },
      { time: '13:50:00', level: 'INFO', message: 'Visitor check-in event listener synced with database.' },
    ],
  },
  'SYS-DOC-03': {
    id: 'documents',
    subsystemId: 'SYS-DOC-03',
    title: 'Document Management (Archiving)',
    icon: FileSearch,
    endpoint: '/api/documents/health',
    uptime: '100.00%',
    latencyMs: 1.5,
    dbPool: '12 / 25 connections active',
    version: 'v3.1.2',
    errorCount: 0,
    status: 'Healthy',
    metrics: [
      { label: 'Vault Space Breakdown', value: '128.4 GB / 500 GB', sub: '25.6% Vault Capacity Used' },
      { label: 'Backup Sync Latency', value: '105 - 168 ms', sub: 'Weekly Sync Trend Stable' },
      { label: 'Archiving Rate', value: '98% Legal Docs', sub: 'Tesseract OCR & Apache Tika Online' },
      { label: 'Backup Status', value: 'Synced', sub: 'Daily Automated Incremental Active' },
    ],
    logs: [
      { time: '14:07:00', level: 'INFO', message: 'Tesseract OCR engine standing by for incoming scans.' },
      { time: '14:01:45', level: 'INFO', message: 'Document storage vault integrity check: PASSED.' },
      { time: '13:45:12', level: 'INFO', message: 'Incremental backup chunk committed to object store.' },
    ],
  },
  'SYS-REC-04': {
    id: 'records',
    subsystemId: 'SYS-REC-04',
    title: 'Records Retention & Compliance',
    icon: ShieldAlert,
    endpoint: '/api/records/health',
    uptime: '99.99%',
    latencyMs: 1.1,
    dbPool: '4 / 10 connections active',
    version: 'v2.0.4',
    errorCount: 0,
    status: 'Healthy',
    metrics: [
      { label: 'Rule Enforcement Actions', value: '1,487 Actions (30d)', sub: 'Compliance Rules Enforced' },
      { label: 'Department Retention Periods', value: '4 Dept Rules Active', sub: 'Legal (10y), HR (7y), Admin (5y), Ops (3y)' },
      { label: 'Scheduled Jobs Status', value: '04:00 AM Cron Active', sub: 'Retention Cron Scheduler Running' },
      { label: 'Compliance Engine Status', value: 'Active', sub: 'Llama 3.3 Rule Classifier Online' },
    ],
    logs: [
      { time: '14:06:20', level: 'INFO', message: 'Retention policy scheduler heartbeat OK.' },
      { time: '14:00:00', level: 'INFO', message: 'Automatic purge task scheduled for 04:00 AM UTC.' },
      { time: '13:30:15', level: 'INFO', message: 'Llama 3.3 compliance classifier re-indexed 520 records.' },
    ],
  },
  'SYS-LEG-05': {
    id: 'legal',
    subsystemId: 'SYS-LEG-05',
    title: 'Legal Management System',
    icon: Scale,
    endpoint: '/api/legal/health',
    uptime: '100.00%',
    latencyMs: 1.0,
    dbPool: '6 / 15 connections active',
    version: 'v1.5.1',
    errorCount: 0,
    status: 'Healthy',
    metrics: [
      { label: 'Case Resolution Time', value: '5 - 28 Days Avg', sub: 'Across 5 Legal Claim Modules' },
      { label: 'Court Hearing SLA', value: '99.4% SLA Compliance', sub: 'Monthly SLA Bounds Met' },
      { label: 'Case Vault Encryption', value: 'AES-256 Active', sub: 'Hardware Key Encryption Verified' },
      { label: 'Audit Trail Hash', value: 'Verified (100%)', sub: 'Immutable Security Log Stream' },
    ],
    logs: [
      { time: '14:06:40', level: 'INFO', message: 'AES-256 encryption key validation successful.' },
      { time: '14:01:12', level: 'INFO', message: 'Security audit listener captured legal module access log.' },
      { time: '13:40:00', level: 'INFO', message: 'Court hearing SLA tracking engine synced with calendar.' },
    ],
  },
  'SYS-CON-06': {
    id: 'contracts',
    subsystemId: 'SYS-CON-06',
    title: 'Contract Management System',
    icon: FileText,
    endpoint: '/api/contracts/health',
    uptime: '99.97%',
    latencyMs: 0.8,
    dbPool: '7 / 20 connections active',
    version: 'v2.2.0',
    errorCount: 0,
    status: 'Healthy',
    metrics: [
      { label: 'Contract Renewal Pipeline', value: '197 Active / Expiring', sub: '90-Day Expiration Horizon Tracked' },
      { label: 'Vendor Category Distribution', value: '4 Vendor Types', sub: 'Facilities, Security, IT, Legal' },
      { label: 'SLA Compliance', value: '99.2% Enforced', sub: 'Contractual SLA Enforcement Engine' },
      { label: 'Auto-Renewal Job', value: 'Active', sub: 'PKI Digital Signature Provider Online' },
    ],
    logs: [
      { time: '14:06:55', level: 'INFO', message: 'Digital signature verification provider ready.' },
      { time: '14:03:10', level: 'INFO', message: 'Contract expiration notification trigger verified.' },
      { time: '13:52:40', level: 'INFO', message: 'Automated SLA obligation tracker completed scan.' },
    ],
  },
};

export const SubsystemHealthGrid: React.FC = () => {
  const [syncTime] = useState('Sync: 4s ago');
  const [selectedSubsystem, setSelectedSubsystem] = useState<SubsystemDetail | null>(null);
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);

  const handleRunDiagnostic = () => {
    setRunningDiagnostic(true);
    setTimeout(() => {
      setRunningDiagnostic(false);
    }, 800);
  };

  return (
    <div className="space-y-6 text-slate-800 font-sans">
      {/* SECTION TITLE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-2 border-b border-slate-200 gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span>System Subsystem Health & Availability Monitoring</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time telemetry, API latency bounds, data pipeline sync, and vault capacity breakdown.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>All 6 Subsystems Operational</span>
          </span>
          <span className="text-slate-400 font-mono text-[11px]">{syncTime}</span>
        </div>
      </div>

      {/* MAIN LAYOUT: FULL-WIDTH GRID (6 CARDS IN 2x3 OR 3x2 RESPONSIVE GRID) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* CARD 1: Facilities Reservation System */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Facilities Reservation System</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Subsystem ID: SYS-FAC-01</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Healthy</span>
              </span>
            </div>

            {/* Graphs Content */}
            <div className="space-y-4">
              {/* Line Graph: API 1, 2, 3 Latency */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    API 1, 2, 3 Latency - 24h
                  </p>
                  <span className="text-[10px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                    Peak: 210 ms @ 08:00
                  </span>
                </div>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={API_LATENCY_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '10px', color: '#fff' }} />
                      <Line type="monotone" dataKey="api1" stroke="#059669" strokeWidth={2} dot={false} name="API 1 (Core)" />
                      <Line type="monotone" dataKey="api2" stroke="#34d399" strokeWidth={2} dot={false} name="API 2 (Rooms)" />
                      <Line type="monotone" dataKey="api3" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="API 3 (Assets)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bar Chart & Gauge Meters */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                {/* Stacked Bar Chart */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Core Files vs Backups</p>
                  <div className="h-24 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={CORE_VS_BACKUP_DATA} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                        <XAxis dataKey="category" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <Bar dataKey="core" fill="#059669" radius={[4, 4, 0, 0]} name="Core Files" />
                        <Bar dataKey="backups" fill="#6ee7b7" radius={[4, 4, 0, 0]} name="Backups" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Gauges */}
                <div className="flex flex-col justify-center space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-0.5">
                      <span>DB Pool Utilization</span>
                      <span className="font-mono text-emerald-700">64%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full" style={{ width: '64%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-0.5">
                      <span>WS Message Load</span>
                      <span className="font-mono text-emerald-700">38%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-teal-500 h-full rounded-full" style={{ width: '38%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-2 font-mono text-[11px]">
                <span>Sync: 4s ago</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">0 errors</span>
              </div>
              <button onClick={() => setSelectedSubsystem(SUBSYSTEM_TELEMETRY_MAP['SYS-FAC-01'])} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 group">
                <span>View details</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* CARD 2: Visitor Management System */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Visitor Management System</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Subsystem ID: SYS-VIS-02</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Healthy</span>
              </span>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* QR Scanner Response Scatter Plot */}
              <div>
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  QR Scanner Response Time vs. Device Type
                </p>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={SCATTER_SCANNER_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="device" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '10px', color: '#fff' }} />
                      <Bar dataKey="avgMs" fill="#059669" radius={[4, 4, 0, 0]} name="Avg Response (ms)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Heatmap & Services Over Time */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                {/* Heatmap Matrix */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">Scanner Heatmap</p>
                  <div className="space-y-1">
                    {HEATMAP_DATA.map((row, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                        <span className="truncate max-w-[70px]">{row.loc}</span>
                        <div className="flex space-x-1">
                          <span className="w-3.5 h-3.5 rounded bg-emerald-500 inline-block" title="100% Ok" />
                          <span className={`w-3.5 h-3.5 rounded inline-block ${row.h2 === 'warn' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                          <span className="w-3.5 h-3.5 rounded bg-emerald-500 inline-block" />
                          <span className="w-3.5 h-3.5 rounded bg-emerald-400 inline-block" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Services A, B, C Status Over Time Area Chart */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Services A, B, C Status</p>
                  <div className="h-20 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={SERVICES_ABC_DATA} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                        <Area type="monotone" dataKey="serviceA" stroke="#059669" fill="#a7f3d0" fillOpacity={0.4} />
                        <Area type="monotone" dataKey="serviceB" stroke="#34d399" fill="#6ee7b7" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-2 font-mono text-[11px]">
                <span>Sync: 4s ago</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">0 errors</span>
              </div>
              <button onClick={() => setSelectedSubsystem(SUBSYSTEM_TELEMETRY_MAP['SYS-VIS-02'])} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 group">
                <span>View details</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* CARD 3: Document Management (Archiving) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <FileSearch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Document Management (Archiving)</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Subsystem ID: SYS-DOC-03</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Healthy</span>
              </span>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* Vault Space Breakdown Multi-Ring Radial Chart */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Vault Space Breakdown
                  </p>
                  <p className="text-[10px] text-slate-400">By Document Type & Project</p>
                </div>
                <div className="h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={VAULT_SPACE_RING}
                        cx="50%"
                        cy="50%"
                        innerRadius={25}
                        outerRadius={40}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {VAULT_SPACE_RING.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sub-Charts */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                {/* Backup Sync Latency - Weekly Trend */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Backup Sync Latency (ms)</p>
                  <div className="h-20 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={BACKUP_SYNC_LATENCY} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                        <XAxis dataKey="day" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <Line type="monotone" dataKey="latencyMs" stroke="#059669" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Archiving Rate Horizontal Bar Chart */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Archiving Rate (%)</p>
                  <div className="h-20 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={ARCHIVING_RATE_DATA} margin={{ top: 0, right: 5, left: -15, bottom: 0 }}>
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <YAxis dataKey="module" type="category" tick={{ fontSize: 7, fill: '#94a3b8' }} />
                        <Bar dataKey="rate" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-2 font-mono text-[11px]">
                <span>Sync: 4s ago</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">0 errors</span>
              </div>
              <button onClick={() => setSelectedSubsystem(SUBSYSTEM_TELEMETRY_MAP['SYS-DOC-03'])} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 group">
                <span>View details</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* CARD 4: Records Retention & Compliance */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Records Retention & Compliance</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Subsystem ID: SYS-REC-04</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Healthy</span>
              </span>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* Rule Enforcement Actions Bar Chart */}
              <div>
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Rule Enforcement Actions (30 Days)
                </p>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={RULE_ENFORCEMENT_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="module" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '10px', color: '#fff' }} />
                      <Bar dataKey="actions" fill="#059669" radius={[4, 4, 0, 0]} name="Actions Executed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Treemap & Scheduled Jobs */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                {/* Department Retention Periods Simulated Treemap */}
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Retention Periods</p>
                  <div className="grid grid-cols-2 gap-1 text-[9px] font-semibold text-white">
                    <div className="bg-emerald-700 p-2 rounded flex flex-col justify-between h-10">
                      <span>Legal</span>
                      <span className="font-mono text-[8px]">10 Yrs</span>
                    </div>
                    <div className="bg-emerald-500 p-2 rounded flex flex-col justify-between h-10">
                      <span>Admin</span>
                      <span className="font-mono text-[8px]">5 Yrs</span>
                    </div>
                    <div className="bg-teal-500 p-1.5 rounded flex flex-col justify-between h-8">
                      <span>HR</span>
                      <span className="font-mono text-[8px]">7 Yrs</span>
                    </div>
                    <div className="bg-emerald-400 p-1.5 rounded flex flex-col justify-between h-8 text-slate-900">
                      <span>Ops</span>
                      <span className="font-mono text-[8px]">3 Yrs</span>
                    </div>
                  </div>
                </div>

                {/* Scheduled Jobs Bar Chart with Star Icon */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-slate-600 uppercase">Scheduled Jobs</p>
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  </div>
                  <div className="h-20 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={SCHEDULED_JOBS_DATA} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                        <XAxis dataKey="hour" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <Bar dataKey="success" fill="#10b981" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-2 font-mono text-[11px]">
                <span>Sync: 4s ago</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">0 errors</span>
              </div>
              <button onClick={() => setSelectedSubsystem(SUBSYSTEM_TELEMETRY_MAP['SYS-REC-04'])} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 group">
                <span>View details</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* CARD 5: Legal Management System */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Legal Management System</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Subsystem ID: SYS-LEG-05</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Healthy</span>
              </span>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* Legal Case Resolution Time Bar Chart */}
              <div>
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Case Resolution Time (Avg Days)
                </p>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={LEGAL_CASE_RESOLUTION_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="type" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '10px', color: '#fff' }} />
                      <Bar dataKey="days" fill="#059669" radius={[4, 4, 0, 0]} name="Avg Resolution Days" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Court Hearing SLA Line Chart & Encryption Status */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Court Hearing SLA (%)</p>
                  <div className="h-20 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={COURT_HEARING_SLA} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                        <XAxis dataKey="month" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <YAxis domain={[95, 100]} tick={{ fontSize: 8, fill: '#94a3b8' }} />
                        <Line type="monotone" dataKey="sla" stroke="#10b981" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex flex-col justify-center space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-0.5">
                      <span>Case Vault Encryption</span>
                      <span className="font-mono text-emerald-700">AES-256</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-0.5">
                      <span>Audit Trail Hash</span>
                      <span className="font-mono text-emerald-700">Verified</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-teal-500 h-full rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-2 font-mono text-[11px]">
                <span>Sync: 4s ago</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">0 errors</span>
              </div>
              <button onClick={() => setSelectedSubsystem(SUBSYSTEM_TELEMETRY_MAP['SYS-LEG-05'])} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 group">
                <span>View details</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* CARD 6: Contract Management System */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Contract Management System</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Subsystem ID: SYS-CON-06</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Healthy</span>
              </span>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* Expiration Pipeline Area Chart */}
              <div>
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Contract Renewal Pipeline (90 Days)
                </p>
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={CONTRACT_EXPIRATION_PIPELINE} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="period" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', fontSize: '10px', color: '#fff' }} />
                      <Bar dataKey="active" fill="#059669" radius={[4, 4, 0, 0]} name="Active Contracts" />
                      <Bar dataKey="expiring" fill="#6ee7b7" radius={[4, 4, 0, 0]} name="Expiring Soon" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Vendor Distribution Pie & Renewal Gauge */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-600 uppercase">Vendor Dist.</p>
                  <div className="h-16 w-16 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={CONTRACT_VENDOR_DIST}
                          cx="50%"
                          cy="50%"
                          innerRadius={15}
                          outerRadius={28}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {CONTRACT_VENDOR_DIST.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex flex-col justify-center space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-0.5">
                      <span>SLA Compliance</span>
                      <span className="font-mono text-emerald-700">99.2%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full" style={{ width: '99.2%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-0.5">
                      <span>Auto-Renewal Job</span>
                      <span className="font-mono text-emerald-700">Active</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-teal-500 h-full rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-2 font-mono text-[11px]">
                <span>Sync: 4s ago</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">0 errors</span>
              </div>
              <button onClick={() => setSelectedSubsystem(SUBSYSTEM_TELEMETRY_MAP['SYS-CON-06'])} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 group">
                <span>View details</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
      </div>

      {/* TELEMETRY DETAILS MODAL */}
      {selectedSubsystem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedSubsystem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30">
                  <selectedSubsystem.icon className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">{selectedSubsystem.title}</h3>
                  <p className="text-xs text-slate-400 font-mono">Infrastructure Diagnostics & Telemetry · {selectedSubsystem.subsystemId}</p>
                </div>
              </div>
              <button onClick={() => setSelectedSubsystem(null)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Telemetry Overview Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Module Health</p>
                  <div className="mt-1 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      🟢 {selectedSubsystem.status}
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Uptime</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">{selectedSubsystem.uptime}</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">API Response Latency</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{selectedSubsystem.latencyMs} ms</p>
                </div>
              </div>

              {/* Infrastructure Specifications */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs border border-slate-200">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-emerald-600" /> Infrastructure Specifications
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-slate-600 font-mono">
                  <div><span className="text-slate-400">Endpoint API:</span> {selectedSubsystem.endpoint}</div>
                  <div><span className="text-slate-400">Subsystem Version:</span> {selectedSubsystem.version}</div>
                  <div><span className="text-slate-400">DB Connection Pool:</span> {selectedSubsystem.dbPool}</div>
                  <div><span className="text-slate-400">Unresolved Errors:</span> {selectedSubsystem.errorCount}</div>
                </div>
              </div>

              {/* Active Health Metrics */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-600" /> Active Health Metrics
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedSubsystem.metrics.map((m, idx) => (
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

              {/* Diagnostic Telemetry Logs */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-slate-700" /> Subsystem Telemetry Logs
                </h4>
                <div className="bg-slate-950 text-slate-200 font-mono text-[11px] p-3.5 rounded-xl space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedSubsystem.logs.map((log, i) => (
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
                onClick={() => setSelectedSubsystem(null)}
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
