import React from 'react';
import { usePortalPresentation } from '../../hooks/usePortalPresentation';
import { PortalShell } from '../layout/PortalShell';
import type { WorkspaceConfig } from './workspaceConfig';

export const RoleWorkspaceLayout: React.FC<{ config: WorkspaceConfig }> = ({ config }) => {
  const presentation = usePortalPresentation(config.role);

  return (
    <PortalShell
      portalLabel={presentation.portalLabel}
      roleLabel={presentation.roleLabel}
      searchPlaceholder={presentation.searchPlaceholder}
      navItems={presentation.navigation} showSystemStatus={presentation.showSystemStatus}
      profilePath={presentation.profilePath}
      settingsPath={presentation.settingsPath}
    />
  );
};
