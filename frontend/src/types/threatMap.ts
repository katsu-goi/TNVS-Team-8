// Geographic Threat Data Types (backed by real /v1/security/ip-threats data)
export type ThreatType =
  | 'FAILED_LOGIN'
  | 'ACCOUNT_LOCKED'
  | 'SQL_INJECTION'
  | 'XSS'
  | 'PORT_SCAN'
  | 'RATE_LIMIT'
  | 'BLOCKED_IP'
  | 'TRUSTED';

export type ThreatSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ThreatStatus = 'BLOCKED' | 'DETECTED';
export type MarkerColor = 'red' | 'blue' | 'orange' | 'green';

export type ThreatWindow = '15m' | '1h' | '24h' | '7d';

export interface ThreatTypeCount {
  type: ThreatType;
  count: number;
}

export interface IpThreatEntry {
  ip: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isp: string | null;
  asn: string | null;
  accuracyRadiusKm: number | null;
  confidence: number | null;
  ipVersion: number;
  privateIp: boolean;
  threatTypes: ThreatTypeCount[];
  primaryThreat: ThreatType;
  severity: ThreatSeverity;
  eventCount: number;
  status: ThreatStatus;
  firstSeen: string | null;
  lastSeen: string | null;
  source: string;
}

export interface ThreatMapStats {
  totalThreatIps: number;
  detectedLast24h: number;
  countriesAffected: number;
  blockedIps: number;
  activeSessions: number;
  failedLoginAttempts: number;
}

export interface TrustedSessionEntry {
  sessionId: string;
  username: string;
  role: string;
  ip: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isp: string | null;
  asn: string | null;
  accuracyRadiusKm: number | null;
  confidence: number | null;
  ipVersion: number;
  privateIp: boolean;
  loginTime: string | null;
  lastActivity: string | null;
}

export interface GatewayLogEntry {
  timestamp: string;
  action: string;
  ip: string;
  username: string | null;
  severity: ThreatSeverity;
  module: string;
  status: string;
  reason: string;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  privateIp: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracyRadiusKm: number | null;
  confidence: number | null;
  isp: string | null;
  asn: string | null;
}

export interface ThreatMapResponse {
  window: ThreatWindow;
  generatedAt: string;
  threats: IpThreatEntry[];
  trustedSessions: TrustedSessionEntry[];
  stats: ThreatMapStats;
  recentLogs: GatewayLogEntry[];
}

// STOMP envelope broadcast on /topic/security/threats
export interface SecurityThreatEvent {
  type: 'EVENT' | 'SYNC';
  window: ThreatWindow;
  threat: IpThreatEntry | null;
  log: GatewayLogEntry | null;
  trustedSession: TrustedSessionEntry | null;
  threats: IpThreatEntry[] | null;
  trustedSessions: TrustedSessionEntry[] | null;
  stats: ThreatMapStats;
  timestamp: string;
}

export interface ThreatMapDiagnostics {
  clientIp: string;
  ipVersion: number;
  privateIp: boolean;
  geoProvider: string;
  geoResolved: boolean;
  geolocation: {
    country: string | null;
    countryCode: string | null;
    region: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
    isp: string | null;
    asn: string | null;
    accuracyRadiusKm: number | null;
    confidence: number | null;
  } | null;
  broadcastWindow: string;
  trustedHeaderChain: string;
}

export type ThreatFilterType = 'ALL' | ThreatType;

export const THREAT_TYPE_LABEL: Record<ThreatType | 'ALL', string> = {
  ALL: 'All Threats',
  FAILED_LOGIN: 'Failed Login',
  ACCOUNT_LOCKED: 'Account Lockout',
  SQL_INJECTION: 'SQL Injection',
  XSS: 'XSS',
  PORT_SCAN: 'Port Scan',
  RATE_LIMIT: 'Rate Limit',
  BLOCKED_IP: 'Blocked IP',
  TRUSTED: 'Trusted Session',
};

export const THREAT_WINDOWS: ThreatWindow[] = ['15m', '1h', '24h', '7d'];

export const THREAT_WINDOW_LABEL: Record<ThreatWindow, string> = {
  '15m': 'Last 15 minutes',
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
};

/** Matches a threat against the selected map filter, including secondary classifications. */
export function matchesThreatFilter(threat: IpThreatEntry, filter: ThreatFilterType): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'TRUSTED') return false;
  return threat.primaryThreat === filter
    || threat.threatTypes.some((entry) => entry.type === filter);
}

/**
 * Marker color mapping:
 * 🔴 Red = Critical attack sources (SQL Injection, XSS, Blocked IP, Account Lockout)
 * 🔵 Blue = Failed login / scanner sources
 * 🟠 Orange = High volume (rate limiting)
 * 🟢 Green = Trusted / internal sessions
 */
export function getMarkerColor(threatType: ThreatType): MarkerColor {
  switch (threatType) {
    case 'SQL_INJECTION':
    case 'XSS':
    case 'BLOCKED_IP':
    case 'ACCOUNT_LOCKED':
      return 'red';
    case 'FAILED_LOGIN':
    case 'PORT_SCAN':
      return 'blue';
    case 'RATE_LIMIT':
      return 'orange';
    default:
      return 'green';
  }
}

/**
 * Marker size by severity:
 * Low = 6px, Medium = 9px, High = 13px, Critical = 17px
 */
export function getMarkerRadius(severity: ThreatSeverity): number {
  switch (severity) {
    case 'CRITICAL': return 17;
    case 'HIGH':     return 13;
    case 'MEDIUM':   return 9;
    case 'LOW':      return 6;
  }
}

export const MARKER_COLORS: Record<MarkerColor, { fill: string; border: string; glow: string }> = {
  red:    { fill: '#ef4444', border: '#f87171', glow: 'rgba(239, 68, 68, 0.4)' },
  blue:   { fill: '#38bdf8', border: '#60a5fa', glow: 'rgba(56, 189, 248, 0.4)' },
  orange: { fill: '#f59e0b', border: '#fbbf24', glow: 'rgba(245, 158, 11, 0.4)' },
  green:  { fill: '#10b981', border: '#34d399', glow: 'rgba(16, 185, 129, 0.4)' },
};

export function emptyStats(): ThreatMapStats {
  return {
    totalThreatIps: 0,
    detectedLast24h: 0,
    countriesAffected: 0,
    blockedIps: 0,
    activeSessions: 0,
    failedLoginAttempts: 0,
  };
}

/**
 * True for loopback / RFC 1918 private / link-local / CGNAT addresses.
 * Private IPs can never be geolocated by the public provider, so the UI
 * renders them as LOCAL / PRIVATE sources and explains why no marker appears.
 */
export function isPrivateIp(ip: string | null | undefined): boolean {
  if (!ip) return true;
  const value = ip.trim();
  if (value === '127.0.0.1' || value === '::1' || value === 'localhost') return true;
  if (value.includes(':')) {
    const lower = value.toLowerCase();
    return lower.startsWith('0:') || lower.startsWith('::') || lower.startsWith('fc') ||
      lower.startsWith('fd') || lower.startsWith('fe80:');
  }
  const parts = value.split('.');
  if (parts.length !== 4) return true;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  if (isNaN(a) || isNaN(b)) return true;
  if (a === 127 || a === 10 || a === 0 || a === 255) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
