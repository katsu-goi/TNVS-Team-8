import React from 'react';
import { getRolePresentation } from '../../config/roleRegistry';
import { PortalShell } from '../layout/PortalShell';
import type { WorkspaceConfig } from './workspaceConfig';

export const RoleWorkspaceLayout: React.FC<{ config: WorkspaceConfig }> = ({ config }) => {
  const presentation = getRolePresentation(config.role)!;

  return (
    <PortalShell
      portalLabel={presentation.portalLabel}
      roleLabel={presentation.roleLabel}
      searchPlaceholder={presentation.searchPlaceholder}
      navItems={presentation.navigation}
      profilePath={presentation.profilePath}
      settingsPath={presentation.settingsPath}
    />
  );
};
