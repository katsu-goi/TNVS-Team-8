import React from 'react';
import { usePortalPresentation } from '../../hooks/usePortalPresentation';
import { PortalShell } from '../layout/PortalShell';

export const LegalOfficerLayout: React.FC = () => {
  const config = usePortalPresentation('LEGAL_OFFICER');
  return <PortalShell portalLabel={config.portalLabel} roleLabel={config.roleLabel} searchPlaceholder={config.searchPlaceholder} navItems={config.navigation} showSystemStatus={config.showSystemStatus} />;
};
