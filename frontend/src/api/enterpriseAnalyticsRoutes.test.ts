import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const edgeSource = readFileSync(resolve(process.cwd(), '../supabase/functions/analytics/index.ts'), 'utf8');
const migrationSource = readFileSync(resolve(process.cwd(), '../supabase/migrations/20260926000200_super_admin_enterprise_analytics.sql'), 'utf8');

describe('enterprise analytics authorization contract', () => {
  it('selects Super Admin before System Admin and routes it to the dedicated aggregate', () => {
    expect(edgeSource.indexOf('"SUPER_ADMIN", "SYSTEM_ADMIN"')).toBeGreaterThan(-1);
    expect(edgeSource).toContain('role === "SUPER_ADMIN"');
    expect(edgeSource).toContain('phase9_super_admin_enterprise_analytics');
    expect(edgeSource).toContain('if (role === "SYSTEM_ADMIN")');
    expect(edgeSource).not.toContain('if (role === "SYSTEM_ADMIN" || role === "SUPER_ADMIN")');
  });

  it('exports enterprise summaries rather than raw security audit rows', () => {
    expect(edgeSource).toContain('reportType = "ENTERPRISE_ANALYTICS_GOVERNANCE"');
    expect(edgeSource).toContain('enterpriseCsvRows(data)');
    expect(edgeSource).toContain('Status filtering is not supported for the enterprise aggregate export.');
    expect(edgeSource).toContain('reportType = "SYSTEM_OPERATIONAL_EVENTS"');
  });

  it('keeps the aggregate service-only and returns summary sections without raw entities', () => {
    expect(migrationSource).toContain('security definer');
    expect(migrationSource).toContain('revoke all on function public.phase9_super_admin_enterprise_analytics');
    expect(migrationSource).toContain('from public, anon, authenticated');
    expect(migrationSource).toContain('grant execute on function public.phase9_super_admin_enterprise_analytics');
    expect(migrationSource).toContain("'recordsCompliance', v_records_compliance");
    expect(migrationSource).toContain("'usersGovernance', v_users_governance");
    expect(migrationSource).toContain('from public.audit_logs');
    expect(migrationSource).toContain('from public.security_logs');
    expect(migrationSource).toContain('from public.admin_audit_logs');
  });
});
