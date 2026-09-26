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
  createdAt?: string;
  fileSize?: number;
  filePath?: string;
  fileUrl?: string;
  checksum?: string;
  integrityCheck?: string;
  triggeredBy?: string;
  createdBy?: string;
  moduleScope?: string[];
  exportFormat?: string;
  notes?: string;
  verificationState?: string;
  verifiedAt?: string;
  retentionExpiresAt?: string;
  protected?: boolean;
  protectedAt?: string;
  sourceEnvironment?: string;
  schemaVersion?: string;
  manifestVersion?: number;
  manifestPath?: string;
  tableCount?: number;
  rowCount?: number;
  storageObjectCount?: number;
  failureReason?: string;
  restoreTestStatus?: string;
  lastRestoreTestAt?: string;
  cleanupStatus?: string;
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
/* Phase 6 role-scoped analytics                                      */
/* ------------------------------------------------------------------ */

export interface AnalyticsTrend {
  current: number;
  previous: number;
  kind: 'UP' | 'DOWN' | 'FLAT' | 'NEW' | 'N_A';
  percent: number | null;
}

export interface RuntimeHealthCheck {
  name: string;
  status: 'LIVE' | 'EMPTY' | 'DISCONNECTED';
  latencyMs: number;
  detail: string;
}

export interface AnalyticsData {
  enterprise?: {
    overview: {
      currentState: {
        activeUsers: number;
        openRequests: number;
        facilities: number;
        documents: number;
        activeContracts: number;
        openLegalMatters: number;
        openComplianceIssues: number;
      };
      selectedPeriod: {
        recordedActivity: number;
        auditEvents: number;
        visitors: number;
        documentsUploaded: number;
      };
    };
  };
  scope: string;
  timezone: 'Asia/Manila';
  generatedAt: string;
  period: { from: string; toExclusive: string };
  filter: { preset: string; semantics: 'from-inclusive/to-exclusive' };
  operational?: {
    failedEvents: number;
    failedEventsTrend: AnalyticsTrend;
    activeSessions: number;
    automation: { successfulRuns: number; failedRuns: number; lastRunAt: string | null };
    notificationDeliveryFailures: number;
    realtimeMarkers: number;
    blockedIps: number;
    activeSecurityAlerts: number;
    unreadNotifications: number;
  };
  systemHealth?: {
    checkedAt: string;
    overallStatus: 'LIVE' | 'EMPTY' | 'DISCONNECTED';
    checks: RuntimeHealthCheck[];
  };
  facilities?: Record<string, unknown>;
  visitors?: Record<string, unknown>;
  documents?: Record<string, unknown>;
  contracts?: Record<string, unknown>;
  compliance?: Record<string, unknown>;
  legal?: Record<string, unknown>;
  employee?: Record<string, unknown>;
}
