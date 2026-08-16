export type SubsystemStatus = 'HEALTHY' | 'WARNING' | 'OFFLINE' | 'ERROR';
export type OverallStatus = 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE';

export interface HealthCheck {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

export interface Metric {
  label: string;
  value: string;
  sub?: string;
}

export interface LogEntry {
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface LatencyPoint {
  time: string;
  api1: number;
  api2: number;
  api3: number;
}

export interface ScannerPoint {
  type: string;
  avgMs: number;
  count: number;
}

export interface ServicePoint {
  time: string;
  serviceA: number;
  serviceB: number;
  serviceC: number;
}

export interface HeatPoint {
  location: string;
  cells: number[];
  status: string;
}

export interface Slice {
  name: string;
  value: number;
  color: string;
}

export interface BackupPoint {
  day: string;
  latencyMs: number;
}

export interface RatePoint {
  module: string;
  rate: number;
}

export interface ModuleAction {
  module: string;
  actions: number;
}

export interface RetentionPeriod {
  name: string;
  periodDays: number;
}

export interface JobPoint {
  hour: string;
  success: number;
  failed: number;
}

export interface ResolutionPoint {
  type: string;
  days: number;
}

export interface SlaPoint {
  period: string;
  sla: number;
}

export interface Gauge {
  label: string;
  value: string;
  pct: number;
}

export interface PipelinePoint {
  period: string;
  active: number;
  expiring: number;
}

export interface SubsystemHealth {
  id: string;
  key: string;
  name: string;
  status: SubsystemStatus;
  uptimePercent: number;
  errorCount: number;
  lastSync: string;
  latencyAvgMs: number;
  latencyPeakMs: number;
  dbPoolActive: number;
  dbPoolMax: number;
  dbPoolUtilizationPct: number;
  wsMessageLoadPct: number;
  checks: HealthCheck[];
  metrics: Metric[];
  logs: LogEntry[];
  latencySeries?: LatencyPoint[];
  scannerSeries?: ScannerPoint[];
  servicesSeries?: ServicePoint[];
  heatmap?: HeatPoint[];
  vault?: Slice[];
  backupSyncSeries?: BackupPoint[];
  archivingSeries?: RatePoint[];
  ruleEnforcement?: ModuleAction[];
  retentionPeriods?: RetentionPeriod[];
  scheduledJobs?: JobPoint[];
  caseResolution?: ResolutionPoint[];
  courtSlaSeries?: SlaPoint[];
  gauges?: Gauge[];
  renewalPipeline?: PipelinePoint[];
  vendorDist?: Slice[];
}

export interface SubsystemHealthSnapshot {
  subsystems: SubsystemHealth[];
  overallStatus: OverallStatus;
  healthyCount: number;
  warningCount: number;
  offlineCount: number;
  errorCount: number;
  timestamp: string;
}
