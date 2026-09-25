import React from 'react';
import { getRolePresentation } from '../../config/roleRegistry';
import { PortalShell } from '../layout/PortalShell';

export const FacilitiesManagerLayout: React.FC = () => {
  const config = getRolePresentation('FACILITIES_MANAGER')!;
  return <PortalShell portalLabel={config.portalLabel} roleLabel={config.roleLabel} searchPlaceholder={config.searchPlaceholder} navItems={config.navigation} />;
};
