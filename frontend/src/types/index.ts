export interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email: string;
  employeeId?: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
  roles?: string[];
  assignedRoles?: string[];
  permissions?: string[];
  dashboardKey?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
  errorCode?: string;
}

export interface DashboardMetrics {
  totalDocuments: number;
  totalContracts: number;
  activeSessions: number;
  failedLoginAttempts: number;
  blockedIpsCount: number;
  activeAlertsCount: number;
  totalBackups: number;
  totalNotifications: number;
}

export interface FacilitiesKpi {
  totalFacilities: number;
  totalRooms: number;
  activeRooms: number;
  bookingsToday: number;
  pendingApprovals: number;
  checkedIn: number;
}

export interface VisitorKpi {
  totalVisitors: number;
  onSite: number;
  checkedIn: number;
  registered: number;
  checkedOut: number;
}

export interface DocumentKpi {
  totalDocuments: number;
  archived: number;
  approved: number;
  pendingReview: number;
  draft: number;
}

export interface RecordsKpi {
  totalPolicies: number;
  activePolicies: number;
}

export interface LegalKpi {
  totalCases: number;
  open: number;
  inProgress: number;
  pendingHearing: number;
  closed: number;
}

export interface ContractKpi {
  totalContracts: number;
  active: number;
  underReview: number;
  draft: number;
  expired: number;
  pendingApproval: number;
  totalContractValue: number;
}

export interface GlobalKpi {
  activeUsers: number;
  activeSessions: number;
  failedLoginAttempts: number;
  blockedIps: number;
  activeAlerts: number;
  unreadNotifications: number;
}

export interface SystemKpi {
  facilities: FacilitiesKpi;
  visitors: VisitorKpi;
  documents: DocumentKpi;
  records: RecordsKpi;
  legal: LegalKpi;
  contracts: ContractKpi;
  global: GlobalKpi;
}

export interface SystemConfiguration {
  id: string;
  configKey: string;
  configValue: string;
  description?: string;
  category?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface IntegrationStatus {
  id: string;
  systemName: string;
  connectionStatus: string;
  lastSyncAt?: string;
  apiHealth?: string;
  responseTimeMs?: number;
  failedSyncs: number;
  lastSuccessfulConnection?: string;
}

export interface BackupRecord {
  id: string;
  backupType: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  fileSize?: number;
  filePath?: string;
  integrityCheck?: string;
  triggeredBy?: string;
  notes?: string;
}

export interface AdminNotification {
  id: string;
  title: string;
  message?: string;
  type: string;
  severity: string;
  read: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface SecurityMetrics {
  activeSessions: number;
  blockedIpsCount: number;
  activeAlertsCount: number;
  failedLoginAttempts: number;
  ddosBlockedRequests: number;
  suspiciousActivitiesCount: number;
}

export interface SecurityLog {
  id: string;
  userId?: string;
  username?: string;
  fullName?: string;
  role?: string;
  module: string;
  action: string;
  timestamp: string;
  ipAddress: string;
  browser?: string;
  operatingSystem?: string;
  deviceName?: string;
  apiEndpoint?: string;
  httpMethod?: string;
  riskLevel: string;
  status: string;
}

export interface BlockedIp {
  id?: string;
  ipAddress: string;
  reason: string;
  blockedBy?: string;
  blockedAt: string;
  expiresAt?: string;
  status?: string;
}

export interface ActiveSession {
  id: string;
  sessionId?: string;
  userId?: string;
  username?: string;
  fullName?: string;
  role?: string;
  ipAddress: string;
  browser?: string;
  deviceName?: string;
  country?: string;
  loginTime: string;
  lastActivity: string;
  status?: string;
}

export interface SecurityAlert {
  id?: string;
  title: string;
  description?: string;
  severity: string;
  alertType: string;
  targetIp?: string;
  targetUserId?: string;
  status: string;
  createdAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface SecurityOverview {
  totalEvents: number;
  failedLogins: number;
  activeSessions: number;
  blockedIps: number;
  openAlerts: number;
}

/* ------------------------------------------------------------------ */
/* Analytics (System Administrator)                                    */
/* ------------------------------------------------------------------ */

export interface AnalyticsPeriod {
  from: string;
  to: string;
  label: string;
}

export interface AnalyticsKpi {
  key: string;
  label: string;
  value: string;
  description: string;
  previous?: number | null;
  deltaPct?: number | null;
  trend?: 'up' | 'down' | 'flat' | null;
  status?: 'good' | 'warning' | 'bad' | 'neutral' | null;
  hasComparison: boolean;
}

export interface AnalyticsSeries {
  key: string;
  name: string;
  color: string;
  values: number[];
}

export interface AnalyticsActivity {
  labels: string[];
  series: AnalyticsSeries[];
}

export interface LabelValue {
  label: string;
  value: number;
}

export interface AnalyticsSecurity {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  failedLogins: number;
  blockedIps: number;
  byRiskLevel: LabelValue[];
  overTime: LabelValue[];
}

export interface AnalyticsAiProvider {
  id: string;
  name: string;
  model?: string;
  status?: string;
  responseTime?: string;
  isDefault: boolean;
  type?: string;
}

export interface AnalyticsAi {
  totalRequests: number;
  successful: number;
  failed: number;
  successRate?: number | null;
  avgResponseTimeMs?: number | null;
  source: string;
  providers: AnalyticsAiProvider[];
  requestsByProvider: LabelValue[];
}

export interface AnalyticsHealthComponent {
  id: string;
  name: string;
  status: string;
  uptimePercent: number;
  errorCount: number;
}

export interface AnalyticsHealth {
  overallStatus: string;
  healthyCount: number;
  warningCount: number;
  offlineCount: number;
  errorCount: number;
  components: AnalyticsHealthComponent[];
}

export interface AnalyticsAudit {
  total: number;
  byModule: LabelValue[];
  byAction: LabelValue[];
  mostActiveModule?: string | null;
  mostCommonAction?: string | null;
}

export interface AnalyticsDocuments {
  total: number;
  uploaded: number;
  archived: number;
  aiClassified: number;
}

export interface AnalyticsContracts {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
  renewed: number;
}

export interface AnalyticsBackups {
  total: number;
  successCount: number;
  failedCount: number;
  successRate?: number | null;
  lastSuccessfulAt?: string | null;
  lastBackupAt?: string | null;
}

export interface AnalyticsInsight {
  severity: 'info' | 'good' | 'warning' | 'critical';
  title: string;
  description: string;
}

export interface AnalyticsData {
  period: AnalyticsPeriod;
  kpis: AnalyticsKpi[];
  activity: AnalyticsActivity;
  security: AnalyticsSecurity;
  ai: AnalyticsAi;
  health: AnalyticsHealth;
  audit: AnalyticsAudit;
  documents: AnalyticsDocuments;
  contracts: AnalyticsContracts;
  backups: AnalyticsBackups;
  insights: AnalyticsInsight[];
}
