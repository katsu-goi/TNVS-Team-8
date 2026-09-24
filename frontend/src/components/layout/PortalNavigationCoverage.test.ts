import { describe, expect, it } from 'vitest';
import { roleRegistry } from '../../config/roleRegistry';
import { getPortalDestinations, shouldStartPortalNavigation } from './portalNavigation';

describe('shared portal navigation loading coverage', () => {
  it('covers every configured sidebar destination for all canonical roles', () => {
    expect(roleRegistry.size).toBe(15);

    for (const [role, presentation] of roleRegistry) {
      const destinations = getPortalDestinations(presentation.navigation);
      const missing = destinations.filter((item) => !shouldStartPortalNavigation('/__coverage_source__', item.path));

      expect(destinations.length, `${role} has no configured destinations`).toBeGreaterThan(0);
      expect(missing, `${role} has destinations outside shared loading`).toEqual([]);
    }
  });

  it('treats nested groups as destinations only when their route changes', () => {
    const superAdmin = roleRegistry.get('SUPER_ADMIN');
    const security = superAdmin?.navigation.find((item) => item.id === 'security');
    const auditLogs = security?.children?.find((item) => item.id === 'security-audit');

    expect(security).toBeDefined();
    expect(auditLogs).toBeDefined();
    expect(shouldStartPortalNavigation(security!.path, security!.path)).toBe(false);
    expect(shouldStartPortalNavigation(security!.path, auditLogs!.path)).toBe(true);
  });
});
