import React from 'react';
import { LayoutDashboard, LogOut, Scale, ShieldCheck, Database, Building2, LockKeyhole } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout as apiLogout } from '../../api/authService';
import { hasPermission, hasRole, useAuthStore } from '../../stores/authStore';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { NotificationBell } from '../ui/NotificationBell';

const dashboardLabels: Record<string, string> = {
  privacy: 'Data Protection',
  counsel: 'Legal Counsel',
  records: 'Records Governance',
  department: 'Department Leadership',
  security: 'Security Operations',
  infosec: 'Information Security',
};

export const GovernanceLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
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
  const primaryRole = user?.assignedRoles?.[0] || user?.roles?.[0] || 'GOVERNANCE_USER';

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-72 flex-col bg-[#D02F34] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 bg-[#A9252A] p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-white">Hirna Portal</h1>
            <p className="truncate text-[10px] font-medium text-[#FFC629]">{portalLabel}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.path === '/governance'
              ? location.pathname === '/governance'
              : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                  active ? 'bg-[#A9252A] text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3">
          <div className="rounded-xl border border-white/10 bg-[#A9252A]/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{user?.fullName || user?.email}</p>
                <p className="truncate font-mono text-[10px] text-white/65">{primaryRole}</p>
              </div>
              <button
                title="Logout"
                onClick={() => apiLogout().finally(() => logout())}
                className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen pl-72">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur-md">
          <div>
            <p className="text-sm font-semibold text-slate-800">{portalLabel}</p>
            <p className="text-xs text-slate-500">Role-based dashboard with inherited access and SoD controls</p>
          </div>
          <NotificationBell />
        </header>
        <div className="p-8"><Outlet /></div>
      </main>
    </div>
  );
};
