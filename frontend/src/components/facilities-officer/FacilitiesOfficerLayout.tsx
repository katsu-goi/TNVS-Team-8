import React from 'react';
import { getRolePresentation } from '../../config/roleRegistry';
import { PortalShell } from '../layout/PortalShell';

export const FacilitiesOfficerLayout: React.FC = () => {
  const config = getRolePresentation('FACILITIES_OFFICER')!;
  return <PortalShell portalLabel={config.portalLabel} roleLabel={config.roleLabel} searchPlaceholder={config.searchPlaceholder} navItems={config.navigation} />;
};
