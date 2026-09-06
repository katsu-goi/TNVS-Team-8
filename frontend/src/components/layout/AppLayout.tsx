import React from 'react';
import {
  Activity, BarChart3, Bell, Cpu, Download, FileText, KeyRound,
  Layers, LayoutDashboard, LockKeyhole, Monitor, Settings, ShieldCheck,
} from 'lucide-react';
import { isActorSuperAdmin, isActorSystemAdmin, useAuthStore } from '../../stores/authStore';
import { PortalShell, type PortalNavItem } from './PortalShell';

export const AppLayout: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const superAdministrator = isActorSuperAdmin(user);
  const systemAdministrator = isActorSystemAdmin(user);
  const dashboardPath = superAdministrator ? '/super-admin' : '/system-admin';
  const portalLabel = superAdministrator ? 'Super Administration' : 'System Administration';

  const navItems: PortalNavItem[] = [
    { id: 'dashboard', label: superAdministrator ? 'Executive Dashboard' : 'Dashboard', path: dashboardPath, icon: LayoutDashboard, exact: true },
    ...(superAdministrator ? [
      { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: BarChart3, exact: true },
      { id: 'rbac', label: 'RBAC Administration', path: '/admin/rbac', icon: KeyRound, exact: true },
      {
        id: 'security', label: 'Security Center', path: '/security', icon: ShieldCheck, exact: true,
        children: [{ id: 'security-audit', label: 'Audit Logs', path: '/security/audit-logs', icon: FileText, exact: true }],
      },
    ] satisfies PortalNavItem[] : []),
    ...(systemAdministrator ? [
      { id: 'integrations', label: 'Integrations', path: '/admin/integrations', icon: Layers, exact: true },
      { id: 'ai-services', label: 'AI Services', path: '/admin/ai-services', icon: Cpu, exact: true },
      { id: 'backup', label: 'Backup & DR', path: '/admin/backup', icon: Download, exact: true },
      { id: 'settings', label: 'System Config', path: '/admin/settings', icon: Settings, exact: true },
      { id: 'notifications', label: 'Notifications', path: '/admin/notifications', icon: Bell, exact: true },
      { id: 'system-health', label: 'System Health', path: '/admin/system-health', icon: Monitor, exact: true },
      { id: 'sessions', label: 'Sessions', path: '/admin/sessions', icon: Activity, exact: true },
      { id: 'account-lockouts', label: 'Account Lockouts', path: '/admin/account-lockouts', icon: LockKeyhole, exact: true },
    ] satisfies PortalNavItem[] : []),
  ];

  return (
    <PortalShell
      portalLabel={portalLabel}
      roleLabel={superAdministrator ? 'Super Administrator' : 'System Administrator'}
      searchPlaceholder={superAdministrator ? 'Search analytics, RBAC, or security oversight...' : 'Search logs, settings, or admin pages...'}
      navItems={navItems}
      showSystemStatus
    />
  );
};
