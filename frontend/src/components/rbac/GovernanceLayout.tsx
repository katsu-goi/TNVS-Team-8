import React from 'react';
import { LayoutDashboard, Scale, ShieldCheck, Building2, LockKeyhole } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasPermission, hasRole, useAuthStore } from '../../stores/authStore';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { NotificationBell } from '../ui/NotificationBell';
import { UserProfileMenu } from '../ui/UserProfileMenu';
import { HirnaSidebarDecoration } from '../ui/HirnaSidebarDecoration';

const dashboardLabels: Record<string, string> = {
  privacy: 'Data Protection',
  counsel: 'Legal Counsel',
  records: 'Records Governance',
  department: 'Department Leadership',
  security: 'Security Operations',
  infosec: 'Information Security',
};

export const GovernanceLayout: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  useUserHeartbeat();

  const navItems = [
    { label: 'Dashboard', path: '/governance', icon: LayoutDashboard, visible: true },
    { label: 'Compliance Workspace', path: '/compliance', icon: ShieldCheck, visible: hasRole(user, 'COMPLIANCE_OFFICER') },
    { label: 'Legal Workspace', path: '/legal', icon: Scale, visible: hasRole(user, 'LEGAL_OFFICER') },
    { label: 'Employee Services', path: '/employee', icon: Building2, visible: hasRole(user, 'EMPLOYEE') },
    { label: 'Security Monitoring', path: '/governance/security', icon: LockKeyhole, visible: hasPermission(user, 'SECURITY_MONITOR') },
  ].filter((item) => item.visible);

  const portalLabel = dashboardLabels[user?.dashboardKey || ''] || 'Governance';
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="hirna-sidebar fixed inset-y-0 left-0 z-30 flex w-72 flex-col overflow-hidden shadow-2xl">
        <div className="hirna-sidebar-header flex items-center gap-3 p-5">
          <div className="hirna-sidebar-logo flex items-center justify-center overflow-hidden">
            <img src="/hirna-logo.png" alt="Hirna Logo" className="h-full w-full object-contain" draggable={false} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-white">Hirna Portal</h1>
            <p className="truncate text-[10px] font-medium text-[#FFC629]">{portalLabel}</p>
          </div>
        </div>

        <nav className="hirna-sidebar-nav flex flex-1 flex-col overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.path === '/governance'
              ? location.pathname === '/governance'
              : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`hirna-nav-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium ${
                  active ? 'hirna-nav-item-active font-semibold' : ''
                }`}
              >
                <Icon className="hirna-nav-icon h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <HirnaSidebarDecoration />
      </aside>

      <main className="min-h-screen pl-72">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur-md">
          <div>
            <p className="text-sm font-semibold text-slate-800">{portalLabel}</p>
            <p className="text-xs text-slate-500">Role-based dashboard with inherited access and SoD controls</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell />
            <UserProfileMenu />
          </div>
        </header>
        <div className="p-8"><Outlet /></div>
      </main>
    </div>
  );
};
