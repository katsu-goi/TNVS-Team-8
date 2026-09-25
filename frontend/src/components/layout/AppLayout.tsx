import React from 'react';
import { isActorSuperAdmin, isActorSystemAdmin, useAuthStore } from '../../stores/authStore';
import { getRolePresentation } from '../../config/roleRegistry';
import { PortalShell } from './PortalShell';

export const AppLayout: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const superAdministrator = isActorSuperAdmin(user);
  const systemAdministrator = isActorSystemAdmin(user);
  const presentation = getRolePresentation(superAdministrator ? 'SUPER_ADMIN' : systemAdministrator ? 'SYSTEM_ADMIN' : 'SYSTEM_ADMIN')!;

  return (
    <PortalShell
      portalLabel={presentation.portalLabel}
      roleLabel={presentation.roleLabel}
      searchPlaceholder={presentation.searchPlaceholder}
      navItems={presentation.navigation}
      showSystemStatus={presentation.showSystemStatus}
    />
  );
};
