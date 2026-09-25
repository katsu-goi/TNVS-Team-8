import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), '../supabase/functions/facilities/management.ts'), 'utf8');

describe('facility management Edge route contract', () => {
  it('keeps every management route behind the assigned FACILITIES_MANAGER guard', () => {
    expect(source).toContain('kind: "assignedRoles", roles: ["FACILITIES_MANAGER"]');
    const routeLines = source.split('\n').filter((line) => line.includes('path: "/facilities/management'));
    expect(routeLines.length).toBeGreaterThanOrEqual(18);
    expect(routeLines.every((line) => line.includes('guard'))).toBe(true);
  });

  it('exposes the canonical list, detail, scoped workspace, and protected floor-plan routes', () => {
    for (const route of [
      'GET", path: "/facilities/management"',
      'POST", path: "/facilities/management"',
      'GET", path: "/facilities/management/:id"',
      'PATCH", path: "/facilities/management/:id"',
      'GET", path: "/facilities/management/:id/spaces"',
      'GET", path: "/facilities/management/:id/reservations"',
      'GET", path: "/facilities/management/:id/assets"',
      'GET", path: "/facilities/management/:id/maintenance"',
      'GET", path: "/facilities/management/:id/activity"',
      'DELETE", path: "/facilities/management/:id/floor-plan"',
    ]) expect(source).toContain(route);
    expect(source).toContain('createSignedUrl(path, 900)');
    expect(source).not.toContain('getPublicUrl(');
  });

  it('records auditable facility lifecycle actions', () => {
    for (const action of ['FACILITY_CREATED', 'FACILITY_UPDATED', 'FACILITY_ARCHIVED', 'FACILITY_SPACE_CREATED', 'FACILITY_FLOOR_PLAN_UPDATED']) {
      expect(source).toContain(action);
    }
  });
});
