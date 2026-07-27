// Geographic Threat Data Types
export type ThreatType = 'DDOS' | 'SQL_INJECTION' | 'XSS' | 'BRUTE_FORCE' | 'FAILED_LOGIN' | 'PORT_SCAN' | 'MALWARE' | 'BOT_TRAFFIC';
export type ThreatSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ThreatStatus = 'BLOCKED' | 'ACTIVE' | 'DETECTED';
export type MarkerColor = 'red' | 'blue' | 'yellow' | 'green';

export interface IpThreatEntry {
  ip: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  threatType: ThreatType;
  severity: ThreatSeverity;
  requests: number;
  status: ThreatStatus;
  firstSeen: string;
  lastSeen: string;
  asn?: string;
  isp?: string;
  flag?: string;
}

export interface ThreatMapStats {
  totalThreatIps: number;
  detectedLast24h: number;
  countriesAffected: number;
  blockedIps: number;
  activeSessions: number;
  failedLoginAttempts: number;
}

export type ThreatFilterType = 'ALL' | ThreatType;

export const THREAT_TYPE_LABEL: Record<ThreatType | 'ALL', string> = {
  ALL: 'All Threats',
  DDOS: 'DDoS',
  SQL_INJECTION: 'SQL Injection',
  XSS: 'XSS',
  BRUTE_FORCE: 'Brute Force',
  FAILED_LOGIN: 'Failed Login',
  PORT_SCAN: 'Port Scan',
  MALWARE: 'Malware',
  BOT_TRAFFIC: 'Bot Traffic',
};

/**
 * Requirement 3:
 * 🔴 Red = Attack Source IP (DDoS, SQL Injection, Malware, Port Scan)
 * 🔵 Blue = Failed Login / Scan Source (Failed Login, XSS)
 * 🟡 Yellow = High Request Volume (Bot Traffic, Brute Force)
 * 🟢 Green = Trusted / Internal
 */
export function getMarkerColor(threatType: ThreatType): MarkerColor {
  switch (threatType) {
    case 'DDOS':
    case 'SQL_INJECTION':
    case 'MALWARE':
    case 'PORT_SCAN':
      return 'red';        // Attack Source
    case 'FAILED_LOGIN':
    case 'XSS':
      return 'blue';       // Failed Login / Scan Source
    case 'BOT_TRAFFIC':
    case 'BRUTE_FORCE':
      return 'yellow';     // High Request Volume
    default:
      return 'green';      // Trusted / Internal
  }
}

/**
 * Requirement 3:
 * Small = Low (6px)
 * Medium = Medium (9px)
 * Large = High (13px)
 * Extra Large = Critical (17px)
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
  yellow: { fill: '#f59e0b', border: '#fbbf24', glow: 'rgba(245, 158, 11, 0.4)' },
  green:  { fill: '#10b981', border: '#34d399', glow: 'rgba(16, 185, 129, 0.4)' },
};
