import { describe, expect, it } from 'vitest';
import { getDashboardPathForRoles, getNotificationDestination, normalizeRole, roleRegistry } from './roleRegistry';

describe('Super Admin module coverage', () => {
  it('has all fourteen other-role sections and every current module destination', () => {
    const nav = roleRegistry.get('SUPER_ADMIN')!.navigation;
    expect(nav.filter(item => item.id.startsWith('role-'))).toHaveLength(14);
    const destinations = nav.flatMap(item => [item, ...(item.children ?? [])]);
    for (const [role,presentation] of roleRegistry) {
      if (role === 'SUPER_ADMIN') continue;
      for (const item of presentation.navigation) expect(destinations.some(destination => destination.path === item.path), `${role}: ${item.path}`).toBe(true);
    }
    expect(destinations.some(item => item.path === '/reservation-portal')).toBe(true);
    expect(new Set(destinations.map(item => item.id)).size).toBe(destinations.length);
  });
});

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
