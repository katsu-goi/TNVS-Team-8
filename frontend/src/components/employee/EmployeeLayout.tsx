import React from 'react';
import { getRolePresentation } from '../../config/roleRegistry';
import { PortalShell } from '../layout/PortalShell';

export const EmployeeLayout: React.FC = () => {
  const config = getRolePresentation('EMPLOYEE')!;
  return <PortalShell portalLabel={config.portalLabel} roleLabel={config.roleLabel} searchPlaceholder={config.searchPlaceholder} navItems={config.navigation} profilePath={config.profilePath} />;
};
