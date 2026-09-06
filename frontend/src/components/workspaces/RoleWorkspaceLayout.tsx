import React, { useMemo } from 'react';
import { PortalShell, type PortalNavItem } from '../layout/PortalShell';
import type { WorkspaceConfig } from './workspaceConfig';

export const RoleWorkspaceLayout: React.FC<{ config: WorkspaceConfig }> = ({ config }) => {
  const navItems = useMemo<PortalNavItem[]>(() => config.nav.map((item) => ({
    id: item.section,
    label: item.label,
    path: `/${config.slug}/${item.section}`,
    icon: item.icon,
    exact: true,
    group: item.group,
  })), [config]);
  const hasSettings = config.nav.some((item) => item.section === 'settings');

  return (
    <PortalShell
      portalLabel={config.portalLabel}
      roleLabel={config.headerLabel}
      searchPlaceholder={`Search ${config.portalLabel.toLowerCase()} records...`}
      navItems={navItems}
      settingsPath={hasSettings ? `/${config.slug}/settings` : undefined}
    />
  );
};
