import { apiClient } from './client';
import type {
  SecurityMetrics, SecurityLog, BlockedIp, ActiveSession, SecurityAlert,
} from '../types';

/**
 * Two functions here — `unblockIp` and `revokeSession` — no longer do what their
 * names say. `DELETE /security/admin/blocked-ips/{ip}` and
 * `POST /security/admin/sessions/{id}/revoke` both run through
 * `GovernedActionGateway.raise` for IP_UNBLOCK and SESSION_REVOKE and mutate
 * nothing: the 200 carries a pending-approval DTO (`pendingApproval: true`,
 * `approvalRequestId`, `requiredApprovals`, ...), the block is still active and the
 * session is still signed in when the promise resolves. A caller must not read that
 * 200 as "done"; the executor runs later, once the approvals are recorded. That
 * matters more here than elsewhere, because an admin who believes a session is dead
 * stops watching an attacker who is still logged in.
 *
 * Nothing in the front end calls either one — there is no security-admin UI at all
 * yet — so IP_UNBLOCK and SESSION_REVOKE are gated on the server but unreachable
 * from the client. These two are therefore the shape the first screen will copy, and
 * `reason` is required rather than optional so that screen cannot be written without
 * one: the gate refuses any request whose justification is under ten trimmed
 * characters, and a mandatory parameter turns that guaranteed 422 into a compile
 * error. On the DELETE the reason goes in the query string, not a body — the handler
 * accepts either, but a DELETE body is stripped by some proxies and a query
 * parameter always arrives.
 *
 * Both now return the response data instead of `void`. `Promise<void>` discarded the
 * approval DTO, which left a caller no way to tell that the act had only been
 * requested — the one fact it has to convey.
 */
export const securityService = {
  async getMetrics(): Promise<SecurityMetrics> {
    const empty: SecurityMetrics = {
      activeSessions: 0,
      blockedIpsCount: 0,
      activeAlertsCount: 0,
      failedLoginAttempts: 0,
      ddosBlockedRequests: 0,
      suspiciousActivitiesCount: 0,
    };
    try {
      const { data } = await apiClient.get('/security/admin/metrics');
      const m = data ?? {};
      return {
        activeSessions: m.activeSessions ?? 0,
        blockedIpsCount: m.blockedIpsCount ?? 0,
        activeAlertsCount: m.activeAlertsCount ?? 0,
        failedLoginAttempts: m.failedLoginAttempts ?? 0,
        ddosBlockedRequests: m.ddosBlockedRequests ?? 0,
        suspiciousActivitiesCount: m.suspiciousActivitiesCount ?? 0,
      };
    } catch {
      return empty;
    }
  },

  async getLogs(params?: Record<string, string>): Promise<SecurityLog[]> {
    try {
      const { data } = await apiClient.get('/security/admin/logs', { params });
      return data?.content ?? data ?? [];
    } catch {
      return [];
    }
  },

  async getActiveSessions(): Promise<ActiveSession[]> {
    try {
      const { data } = await apiClient.get('/security/admin/sessions');
      return data ?? [];
    } catch {
      return [];
    }
  },

  async getBlockedIps(): Promise<BlockedIp[]> {
    try {
      const { data } = await apiClient.get('/security/admin/blocked-ips');
      return data ?? [];
    } catch {
      return [];
    }
  },

  async getAlerts(): Promise<SecurityAlert[]> {
    try {
      const { data } = await apiClient.get('/security/admin/alerts');
      return data ?? [];
    } catch {
      return [];
    }
  },

  async blockIp(ipAddress: string, reason: string, durationMinutes?: number): Promise<BlockedIp> {
    const { data } = await apiClient.post('/security/admin/blocked-ips', { ipAddress, reason, durationMinutes });
    return data;
  },

  async unblockIp(ipAddress: string, reason: string): Promise<any> {
    const { data } = await apiClient.delete(
      `/security/admin/blocked-ips/${ipAddress}?reason=${encodeURIComponent(reason)}`);
    return data?.data;
  },

  async revokeSession(sessionId: string, reason: string): Promise<any> {
    const { data } = await apiClient.post(`/security/admin/sessions/${sessionId}/revoke`, { reason });
    return data?.data;
  },

  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    await apiClient.post(`/security/admin/alerts/${alertId}/resolve`, { resolvedBy });
  },
};
