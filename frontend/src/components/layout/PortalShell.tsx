import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { HirnaSidebarDecoration } from '../ui/HirnaSidebarDecoration';
import { NotificationBell } from '../ui/NotificationBell';
import { UserProfileMenu } from '../ui/UserProfileMenu';

export type PortalNavItem = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string;
  group?: string;
  children?: PortalNavItem[];
};

type PortalShellProps = {
  portalLabel: string;
  roleLabel: string;
  searchPlaceholder: string;
  navItems: PortalNavItem[];
  profilePath?: string;
  settingsPath?: string;
  showSystemStatus?: boolean;
};

export const PortalShell: React.FC<PortalShellProps> = ({
  portalLabel,
  roleLabel,
  navItems,
  profilePath,
  settingsPath,
  showSystemStatus = false,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    const activeParent = navItems.find((item) => item.children?.some((child) => isPathActive(child.path, child.exact)));
    if (activeParent) setExpandedMenus((current) => new Set(current).add(activeParent.id));
    setMobileOpen(false);
    // location.pathname intentionally drives this synchronization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const isPathActive = (path: string, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname === `${path}/` || location.pathname.startsWith(`${path}/`);
  };

  const goTo = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const toggleMenu = (id: string) => {
    setExpandedMenus((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sidebar = (
    <aside className={`hirna-sidebar fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden shadow-2xl transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="hirna-sidebar-header flex shrink-0 items-center gap-3 px-5 py-4">
        <div className="hirna-sidebar-logo flex shrink-0 items-center justify-center overflow-hidden">
          <img src="/hirna-logo.png" alt="Hirna Logo" className="h-full w-full object-contain" draggable={false} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-sm font-bold leading-tight text-white">Hirna Portal</h1>
          <p className="truncate text-[10px] font-semibold text-hirna-yellow">{portalLabel}</p>
        </div>
        <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="hirna-sidebar-nav scrollbar-none min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label={`${portalLabel} navigation`}>
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const childActive = item.children?.some((child) => isPathActive(child.path, child.exact)) ?? false;
          const active = childActive || isPathActive(item.path, item.exact);
          const expanded = expandedMenus.has(item.id);
          const previousGroup = index > 0 ? navItems[index - 1].group : undefined;
          return (
            <React.Fragment key={item.id}>
              {item.group && item.group !== previousGroup && (
                <p className="mb-1 mt-4 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">{item.group}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  if (item.children) {
                    toggleMenu(item.id);
                    if (!childActive) goTo(item.path);
                  } else goTo(item.path);
                }}
                className={`hirna-nav-item mb-1 flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium ${active ? 'hirna-nav-item-active font-semibold' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon className="hirna-nav-icon h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {item.badge && <span className="rounded-full border border-current/20 px-1.5 py-0.5 font-mono text-[9px] opacity-70">{item.badge}</span>}
                  {item.children ? (
                    <ChevronDown className={`hirna-nav-chevron h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  ) : active ? <ChevronRight className="hirna-nav-chevron h-3.5 w-3.5" /> : null}
                </span>
              </button>
              {item.children && (
                <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="mb-1 ml-4 space-y-1 border-l border-white/15 pl-2">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const activeChild = isPathActive(child.path, child.exact);
                      return (
                        <button key={child.id} type="button" onClick={() => goTo(child.path)} className={`hirna-nav-item flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${activeChild ? 'hirna-nav-item-active font-semibold' : ''}`}>
                          <ChildIcon className="hirna-nav-icon h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <HirnaSidebarDecoration />

      {showSystemStatus && (
        <div className="shrink-0 px-3 pb-3">
          <div className="hirna-status-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/80">System Status</span>
              <span className="flex items-center gap-1 font-mono text-[10px] text-white">
                <span className={`h-1.5 w-1.5 rounded-full ${syncConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {syncConnected ? 'Realtime connected' : 'Realtime connecting'}
              </span>
            </div>
            <p className="font-mono text-[9px] text-white/65">Only the realtime channel is monitored here.</p>
            <div className="mt-3 flex justify-between font-mono text-[9px] text-white/45">
              <span>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span>Local</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div className="hirna-app min-h-screen">
      {sidebar}
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}

      <main className="hirna-main min-h-screen lg:pl-72">
        <header className="hirna-topbar sticky top-0 z-20 flex min-h-[76px] items-center gap-3 border-b px-4 py-3 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-control border border-[var(--hirna-border)] bg-[var(--hirna-surface)] p-2 text-slate-600 shadow-sm lg:hidden" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1" />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <NotificationBell />
            <UserProfileMenu profilePath={profilePath} settingsPath={settingsPath} roleLabelOverride={roleLabel} />
          </div>
        </header>
        <div className="hirna-content p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
