import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roleRegistry } from '../config/roleRegistry';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const admin = read('../supabase/functions/admin/index.ts');
const guard = read('../supabase/functions/_shared/guard.ts');
const auth = read('../supabase/functions/auth/index.ts');
const migration = read('../supabase/migrations/20261002000100_full_access_super_admin_oversight.sql');
const app = read('src/App.tsx');
const dashboard = read('src/components/sysadmin/SysAdminDashboard.tsx');

describe('full-access Super Admin oversight contract', () => {
  it('moves oversight to a dedicated Super Admin route and navigation item', () => {
    const navigation = roleRegistry.get('SUPER_ADMIN')?.navigation;
    expect(navigation?.find((item) => item.id === 'user-oversight')).toMatchObject({
      label: 'User Oversight', path: '/super-admin/user-oversight', group: 'Administration', exact: true,
    });
    expect(app).toContain('path="super-admin/user-oversight"');
    expect(app).toContain('<SuperAdminRoute><UserOversightPage /></SuperAdminRoute>');
    expect(dashboard).not.toContain('<OversightPanel />');
  });

  it('supports finite 5/10/15-minute sessions and manual termination without an immortal token', () => {
    expect(admin).toContain('const FULL_ACCESS_DURATIONS = new Set([5, 10, 15])');
    expect(admin).toContain('manualTerminationRequired: true');
    expect(admin).toContain('expires_at: expiresAt?.toISOString() ?? null');
    expect(migration).toContain('alter column expires_at drop not null');
    expect(migration).toContain('manual_termination_required boolean not null default false');
    expect(migration).toMatch(/manual_termination_required = true[\s\S]*expires_at is null/);
  });

  it('authorizes as the target while retaining the Super Admin actor in immutable audits', () => {
    expect(guard).toContain('user: target');
    expect(guard).toContain('actorUserId: ctx.userId');
    expect(guard).toContain('actorEmail: ctx.email');
    expect(guard).toContain('targetUserId: target.row.id');
    expect(guard).toContain('auditMarker: "Performed via Super Admin Oversight"');
    expect(guard).toContain('actor_user_id: oversight.actorUserId');
    expect(guard).toContain('target_user_id: oversight.targetUserId');
    expect(guard).toContain('oversight_session_id: oversight.sessionId');
    expect(guard).toContain('resultStatus');
  });

  it('allows target-authorized writes only for full access and retains read-only shadow enforcement', () => {
    expect(admin).toContain('read_only: mode === "SHADOW"');
    expect(guard).toContain('ctx.oversight?.readOnly && MUTATING_METHODS.has(req.method)');
    expect(guard).not.toContain('.eq("read_only", true)');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(guard).toContain(`"${method}"`);
  });

  it('prevents nesting, protects admin targets, audits expiry, and ends oversight on logout', () => {
    expect(admin).toContain('OVERSIGHT_SESSION_ACTIVE');
    expect(admin).toContain('IMPERSONATION_PROTECTED_ROLES');
    expect(admin).toContain('OVERSIGHT_SESSION_EXPIRED');
    expect(guard).toContain('terminateOversightForLogout');
    expect(guard).toContain('ended_reason: "LOGOUT"');
    expect(guard).toContain('OVERSIGHT_SESSION_EXPIRED');
  });

  it('exposes real summary data and server-guards every oversight endpoint', () => {
    expect(admin).toContain('handleOversightSummary');
    expect(admin).toContain('activeOversightSessions: count ?? 0');
    for (const path of ['start', 'summary', 'targets', 'current', 'stop']) {
      expect(admin).toContain(`path: "/admin/oversight/${path}", guard: OVERSIGHT_ADMIN_ROLES`);
    }
  });

  it('keeps Super Admin exempt from idle logout without weakening token expiry or manual logout', () => {
    expect(auth).toContain('idleLogout && hasAnyAssignedRole(ctx, ["SUPER_ADMIN"])');
    expect(auth).toContain('Super Admin is exempt from inactivity logout');
    expect(guard).toContain('reason === "INACTIVITY" && hasAnyAssignedRole(ctx, ["SUPER_ADMIN"])');
    expect(guard).toContain('terminateOversightForLogout(actorCtx, req, body)');
  });
});
