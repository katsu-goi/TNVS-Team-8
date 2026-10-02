import { apiClient } from './client';
import type { User } from '../types';
import {
  clearOversightSession,
  getOversightSessionId,
  persistOversightSession,
} from '../utils/oversightSession';

export type OversightMode = 'IMPERSONATION' | 'SHADOW';

export interface OversightTarget extends User {
  department?: string;
  roles: string[];
  assignedRoles?: string[];
  permissions?: string[];
  dashboardKey?: string;
  isOnline?: boolean;
  lastActiveAt?: string | null;
  lastActiveOperation?: string | null;
  lastActiveOperationAt?: string | null;
}

export interface OversightSession {
  id: string;
  mode: OversightMode;
  actorRole: string;
  readOnly: boolean;
  access: 'FULL_ACCESS' | 'READ_ONLY';
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED';
  justification: string;
  actorUserId: string;
  targetUser: OversightTarget;
  startedAt: string;
  expiresAt: string | null;
  durationMinutes: number | null;
  manualTerminationRequired: boolean;
}

export interface OversightSummary {
  totalUsers: number;
  activeUsers: number;
  offlineUsers: number;
  activeOversightSessions: number;
}

function dataOf<T>(response: { data?: { data?: T } }): T {
  return response.data?.data as T;
}

export async function listOversightTargets(): Promise<OversightTarget[]> {
  return dataOf<OversightTarget[]>(await apiClient.get('/admin/oversight/targets')) || [];
}

export async function getOversightSummary(): Promise<OversightSummary> {
  return dataOf<OversightSummary>(await apiClient.get('/admin/oversight/summary'));
}

export async function getCurrentOversightSession(): Promise<OversightSession | null> {
  const sessionId = getOversightSessionId();
  const response = await apiClient.get('/admin/oversight/current', {
    headers: sessionId ? { 'X-Oversight-Session': sessionId } : undefined,
  });
  const session = dataOf<OversightSession | null>(response);
  if (session) persistOversightSession(session.id, session.targetUser);
  else clearOversightSession();
  return session;
}

export async function startOversightSession(input: {
  targetUserId: string;
  mode: OversightMode;
  justification: string;
  durationMinutes: number | null;
  manualTermination?: boolean;
}): Promise<OversightSession> {
  const session = dataOf<OversightSession>(await apiClient.post('/admin/oversight/start', input));
  persistOversightSession(session.id, session.targetUser);
  return session;
}

export async function stopOversightSession(): Promise<void> {
  const sessionId = getOversightSessionId();
  try {
    await apiClient.post('/admin/oversight/stop', sessionId ? { sessionId } : {});
  } finally {
    clearOversightSession();
  }
}
