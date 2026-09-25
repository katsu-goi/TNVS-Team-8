import { describe, expect, it } from 'vitest';
import { getDashboardPathForRoles, getNotificationDestination, normalizeRole, roleRegistry } from './roleRegistry';

describe('role registry routing', () => {
  it('maps every registered role to its configured dashboard', () => {
    for (const [role, presentation] of roleRegistry) {
      expect(getDashboardPathForRoles([role])).toBe(presentation.dashboardPath);
    }
  });

  it('normalizes prefixed and mixed-case role names', () => {
    expect(normalizeRole(' role_facilities_officer ')).toBe('FACILITIES_OFFICER');
  });

  it('uses any assigned role and safely handles malformed notification metadata', () => {
    expect(getDashboardPathForRoles(['UNKNOWN', 'FACILITIES_OFFICER'])).toBe('/facilities-officer');
    expect(getNotificationDestination(['EMPLOYEE'], null)).toBe('/employee');
    expect(getNotificationDestination(['EMPLOYEE'], '%%%')).toBe('/employee');
    expect(getNotificationDestination(['EMPLOYEE'], 123)).toBe('/employee');
    expect(getNotificationDestination(['EMPLOYEE'], {})).toBe('/employee');
    expect(getNotificationDestination(['EMPLOYEE'], [])).toBe('/employee');
  });
});
