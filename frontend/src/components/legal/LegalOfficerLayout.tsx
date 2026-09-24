import React from 'react';
import { getRolePresentation } from '../../config/roleRegistry';
import { PortalShell } from '../layout/PortalShell';

export const LegalOfficerLayout: React.FC = () => {
  const config = getRolePresentation('LEGAL_OFFICER')!;
  return <PortalShell portalLabel={config.portalLabel} roleLabel={config.roleLabel} searchPlaceholder={config.searchPlaceholder} navItems={config.navigation} />;
};
