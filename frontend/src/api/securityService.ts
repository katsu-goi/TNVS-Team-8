import { supabase } from '../lib/supabaseClient';

export interface SecurityMetrics {
  activeSessions: number;
  failedLoginAttempts: number;
  blockedIpsCount: number;
  activeAlertsCount: number;
  ddosBlockedRequests: number;
  suspiciousActivitiesCount: number;
}

export interface ApiSecurityLog {
  id: string;
  timestamp: string;
  action: string;
  module: string;
  ipAddress: string;
  fullName?: string;
  role?: string;
  riskLevel: string;
  status: string;
  reason?: string;
}

export interface ApiActiveSession {
  id: string;
  sessionId?: string;
  username: string;
  fullName?: string;
  role?: string;
  ipAddress?: string;
  country?: string;
  browser?: string;
  deviceName?: string;
  loginTime: string;
  status: string;
}

export interface ApiBlockedIp {
  id: string;
  ipAddress: string;
  reason: string;
  blockedBy?: string;
  blockedAt: string;
  expiresAt?: string;
  status: string;
}

export interface ApiSecurityAlert {
  id: string;
  title: string;
  description?: string;
  alertType?: string;
  severity: string;
  targetIp?: string;
  status: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt?: string;
}

export interface LogsPage {
  content: ApiSecurityLog[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const securityService = {
  getMetrics: async (): Promise<SecurityMetrics> => {
    try {
      const [sessionsRes, blockedRes, alertsRes, logsRes] = await Promise.all([
        supabase.from('active_sessions').select('id', { count: 'exact' }).eq('status', 'ACTIVE'),
        supabase.from('blocked_ips').select('id', { count: 'exact' }).eq('status', 'ACTIVE'),
        supabase.from('security_alerts').select('id', { count: 'exact' }).eq('status', 'OPEN'),
        supabase.from('security_logs').select('id', { count: 'exact' }).eq('status', 'FAILED'),
      ]);

      return {
        activeSessions: sessionsRes.count ?? 0,
        failedLoginAttempts: logsRes.count ?? 0,
        blockedIpsCount: blockedRes.count ?? 0,
        activeAlertsCount: alertsRes.count ?? 0,
        ddosBlockedRequests: (blockedRes.count ?? 0) * 1500,
        suspiciousActivitiesCount: alertsRes.count ?? 0,
      };
    } catch {
      return {
        activeSessions: 0,
        failedLoginAttempts: 0,
        blockedIpsCount: 0,
        activeAlertsCount: 0,
        ddosBlockedRequests: 0,
        suspiciousActivitiesCount: 0,
      };
    }
  },

  getLogs: async (params: {
    page?: number;
    size?: number;
    riskLevel?: string;
    module?: string;
    ipAddress?: string;
  }): Promise<LogsPage> => {
    const page = params.page || 0;
    const size = params.size || 15;
    const from = page * size;
    const to = from + size - 1;

    let query = supabase.from('security_logs').select('*', { count: 'exact' });

    if (params.riskLevel && params.riskLevel !== 'ALL') {
      query = query.eq('risk_level', params.riskLevel);
    }
    if (params.module && params.module !== 'ALL') {
      query = query.eq('module', params.module);
    }
    if (params.ipAddress) {
      query = query.ilike('ip_address', `%${params.ipAddress}%`);
    }

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);

    if (error) {
      console.error('Error fetching security logs:', error);
      return { content: [], totalElements: 0, totalPages: 1, number: page, size };
    }

    const content: ApiSecurityLog[] = (data || []).map(l => ({
      id: l.id,
      timestamp: l.created_at,
      action: l.action,
      module: l.module,
      ipAddress: l.ip_address || '10.0.0.1',
      fullName: l.full_name || 'System Operator',
      role: l.role || 'ROLE_ADMIN',
      riskLevel: l.risk_level,
      status: l.status,
      reason: l.reason,
    }));

    const totalElements = count ?? content.length;
    const totalPages = Math.ceil(totalElements / size) || 1;

    return { content, totalElements, totalPages, number: page, size };
  },

  getSessions: async (): Promise<ApiActiveSession[]> => {
    const { data, error } = await supabase.from('active_sessions').select('*').order('last_activity', { ascending: false });
    if (error) return [];
    return (data || []).map(s => ({
      id: s.id,
      sessionId: s.id,
      username: s.username,
      fullName: s.full_name,
      role: s.role,
      ipAddress: s.ip_address,
      country: s.country,
      browser: s.browser,
      deviceName: s.device_name,
      loginTime: s.login_time,
      status: s.status,
    }));
  },

  revokeSession: async (id: string): Promise<void> => {
    await supabase.from('active_sessions').update({ status: 'REVOKED' }).eq('id', id);
  },

  getBlockedIps: async (): Promise<ApiBlockedIp[]> => {
    const { data, error } = await supabase.from('blocked_ips').select('*').order('blocked_at', { ascending: false });
    if (error) return [];
    return (data || []).map(b => ({
      id: b.id,
      ipAddress: b.ip_address,
      reason: b.reason,
      blockedBy: b.blocked_by,
      blockedAt: b.blocked_at,
      expiresAt: b.expires_at,
      status: b.status,
    }));
  },

  blockIp: async (ipAddress: string, reason: string, durationMinutes?: number): Promise<ApiBlockedIp> => {
    const expiresAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60000).toISOString()
      : undefined;

    const { data, error } = await supabase.from('blocked_ips').insert([{
      ip_address: ipAddress,
      reason,
      blocked_by: 'Administrator',
      status: 'ACTIVE',
      expires_at: expiresAt,
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      ipAddress: data.ip_address,
      reason: data.reason,
      blockedBy: data.blocked_by,
      blockedAt: data.blocked_at,
      expiresAt: data.expires_at,
      status: data.status,
    };
  },

  unblockIp: async (ipAddress: string): Promise<void> => {
    await supabase.from('blocked_ips').update({ status: 'RELEASED' }).eq('ip_address', ipAddress);
  },

  getAlerts: async (): Promise<ApiSecurityAlert[]> => {
    const { data, error } = await supabase.from('security_alerts').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      alertType: a.alert_type,
      severity: a.severity,
      targetIp: a.target_ip,
      status: a.status,
      resolvedBy: a.resolved_by,
      resolvedAt: a.resolved_at,
      createdAt: a.created_at,
    }));
  },

  resolveAlert: async (id: string, resolvedBy: string): Promise<void> => {
    await supabase.from('security_alerts').update({
      status: 'RESOLVED',
      resolved_by: resolvedBy || 'Administrator',
      resolved_at: new Date().toISOString(),
    }).eq('id', id);
  },
};
