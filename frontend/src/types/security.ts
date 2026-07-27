export interface SecurityOverview {
  totalEvents: number;
  failedLogins: number;
  activeSessions: number;
  blockedIps: number;
  openAlerts: number;
}

export interface SecurityLog {
  id: number;
  userId: string;
  fullName: string;
  role: string;
  module: string;
  action: string;
  timestamp: string; // ISO string
  ipAddress: string;
  browser?: string;
  os?: string;
  device?: string;
  sessionId?: string;
  apiEndpoint?: string;
  httpMethod?: string;
  affectedRecord?: string;
  previousValue?: any;
  newValue?: any;
  riskLevel?: string;
  status?: string;
  reason?: string; // added for audit logs
}

export interface ActiveSession {
  id: string;
  userId: string;
  username: string;
  fullName?: string; // optional display name
  role?: string;
  ipAddress: string;
  loginTime: string;
  lastActivity: string;
  device?: string;
  browser?: string;
  os?: string;
  deviceName?: string; // additional field used in UI
  country?: string; // additional field used in UI
}

export interface BlockedIp {
  id: string; // added identifier
  ipAddress: string;
  reason: string;
  blockedBy?: string;
  blockedAt: string;
  expiresAt?: string;
  status: string;
}

export interface SecurityAlert {
  id: number;
  title?: string; // optional title used in UI
  alertType: string;
  severity: string;
  module?: string;
  description: string;
  timestamp: string;
  status: string;
  ipAddress?: string;
  userId?: string;
  targetIp?: string; // used in UI
  resolvedBy?: string; // used when resolved
}

// Interface matching backend metrics
export interface SecurityMetrics {
  activeSessions: number;
  failedLoginAttempts: number;
  blockedIpsCount: number;
  activeAlertsCount: number;
  ddosBlockedRequests: number;
  suspiciousActivitiesCount: number;
  totalUsersOnline?: number; // optional extra metric
  apiRequestsCount?: number; // optional extra metric
}
