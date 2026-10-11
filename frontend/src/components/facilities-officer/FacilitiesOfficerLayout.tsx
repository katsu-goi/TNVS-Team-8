import React from 'react';
import { usePortalPresentation } from '../../hooks/usePortalPresentation';
import { PortalShell } from '../layout/PortalShell';

export const FacilitiesOfficerLayout: React.FC = () => {
  const config = usePortalPresentation('FACILITIES_OFFICER');
  return <PortalShell portalLabel={config.portalLabel} roleLabel={config.roleLabel} searchPlaceholder={config.searchPlaceholder} navItems={config.navigation} showSystemStatus={config.showSystemStatus} />;
};
