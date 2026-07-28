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
  permissions?: string[];
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
