import React from 'react';
import { isActorSuperAdmin, isActorSystemAdmin, useAuthStore } from '../../stores/authStore';
import { usePortalPresentation } from '../../hooks/usePortalPresentation';
import { PortalShell } from './PortalShell';

export const AppLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const user = useAuthStore((state) => state.user);
  const superAdministrator = isActorSuperAdmin(user);
  const systemAdministrator = isActorSystemAdmin(user);
  const presentation = usePortalPresentation(superAdministrator ? 'SUPER_ADMIN' : systemAdministrator ? 'SYSTEM_ADMIN' : 'SYSTEM_ADMIN');

  return (
    <PortalShell
      portalLabel={presentation.portalLabel}
      roleLabel={presentation.roleLabel}
      searchPlaceholder={presentation.searchPlaceholder}
      navItems={presentation.navigation}
      showSystemStatus={presentation.showSystemStatus}
    >{children}</PortalShell>
  );
};
