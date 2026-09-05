import React, { useEffect, useState } from 'react';
import { ChevronRight, LogOut } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout as apiLogout } from '../../api/authService';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { useAuthStore } from '../../stores/authStore';
import { NotificationBell } from '../ui/NotificationBell';
import type { WorkspaceConfig } from './workspaceConfig';

export const RoleWorkspaceLayout: React.FC<{ config: WorkspaceConfig }> = ({ config }) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [clock, setClock] = useState(new Date());
  const syncConnected = useRealtimeSyncStore((state) => state.connected);
  const connectSync = useRealtimeSyncStore((state) => state.connectSync);
  const disconnectSync = useRealtimeSyncStore((state) => state.disconnectSync);
  useUserHeartbeat();

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30000);
    connectSync();
    return () => {
      window.clearInterval(interval);
      disconnectSync();
    };
  }, [connectSync, disconnectSync]);

  const activeSection = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-72 flex-col overflow-hidden bg-[#D02F34] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 bg-[#A9252A] p-5">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white/15">
            <img src="/hirna-logo.png" alt="Hirna" className="h-full w-full object-contain" draggable={false} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-white">Hirna Portal</h1>
            <p className="truncate text-[10px] font-medium text-[#FFC629]">{config.portalLabel}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {config.nav.map((item, index) => {
            const Icon = item.icon;
            const active = activeSection === item.section;
            const previousGroup = index > 0 ? config.nav[index - 1].group : undefined;
            return (
              <React.Fragment key={item.section}>
                {item.group && item.group !== previousGroup && (
                  <p className="mb-1 mt-4 px-4 text-[9px] font-bold uppercase tracking-wider text-white/45">{item.group}</p>
                )}
                <button
                  onClick={() => navigate(`/${config.slug}/${item.section}`)}
                  className={`mb-1 flex w-full items-center justify-between rounded-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                    active ? 'bg-[#A9252A] text-white' : 'text-white/78 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {active && <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="px-3 py-2">
          <div className="rounded-lg border border-white/10 bg-[#A9252A]/80 p-3">
            <div className="mb-2 flex items-center justify-between text-[10px]">
              <span className="font-semibold uppercase tracking-wider text-white/70">Cloud Status</span>
              <span className="flex items-center gap-1 font-mono text-white">
                <span className={`h-1.5 w-1.5 rounded-full ${syncConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {syncConnected ? 'Realtime' : 'Connecting'}
              </span>
            </div>
            <p className="font-mono text-[10px] text-white/45">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Supabase Cloud</p>
          </div>
        </div>

        <div className="p-3 pt-1">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#A9252A]/80 p-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{user?.fullName || user?.email}</p>
              <p className="truncate font-mono text-[10px] text-white/60">{config.role}</p>
            </div>
            <button title="Logout" onClick={() => apiLogout().finally(logout)} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen pl-72">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-8 py-4 backdrop-blur-md">
          <div>
            <p className="text-sm font-semibold text-slate-900">{config.headerLabel}</p>
            <p className="text-xs text-slate-500">{config.description}</p>
          </div>
          <NotificationBell />
        </header>
        <div className="p-8"><Outlet /></div>
      </main>
    </div>
  );
};
