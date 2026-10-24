import React, { Suspense, useEffect, useRef, useState } from 'react';
import { CircleHelp, Menu, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { HirnaSidebarDecoration } from '../ui/HirnaSidebarDecoration';
import { NotificationBell } from '../ui/NotificationBell';
import { UserProfileMenu } from '../ui/UserProfileMenu';
import { Modal } from '../ui/SharedUI';
import { PortalMenu } from './PortalMenu';
import { getCurrentNavigationEntry, getPageGuide } from './pageGuidance';
import {
  PortalLoadingOverlay, PortalLoadingProvider, usePortalLoadingController,
} from '../ui/PortalLoadingOverlay';
import {
  getPortalDestinations, getPortalLoadingMessage, normalizePortalPath, shouldStartPortalNavigation,
} from './portalNavigation';
import { NotificationFocusManager } from './NotificationFocusManager';

export type PortalNavItem = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string;
  group?: string;
  children?: PortalNavItem[];
  disclosureOnly?: boolean;
  activePaths?: string[];
};

type PortalShellProps = {
  children?: React.ReactNode;
  portalLabel: string;
  roleLabel: string;
  searchPlaceholder: string;
  navItems: PortalNavItem[];
  profilePath?: string;
  settingsPath?: string;
  showSystemStatus?: boolean;
};

type ContentSlot = {
  key: string;
  node: React.ReactNode;
};

const PortalShellFrame: React.FC<PortalShellProps> = ({
  portalLabel,
  roleLabel,
  navItems,
  profilePath,
  settingsPath,
  showSystemStatus = false,
  children,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const outletRef = useRef(outlet);
  outletRef.current = outlet;
  const loading = usePortalLoadingController();
  const loadingActive = loading.active;
  const requestLoading = loading.request;
  const releaseLoading = loading.release;
  const navigationToken = useRef(Symbol('portal-navigation'));
  const requestedNavigation = useRef<{ path: string; message: string } | null>(null);
  const initialRouteKey = `${location.pathname}${location.search}`;
  const initialNavItem = getPortalDestinations(navItems)
    .filter((item) => normalizePortalPath(location.pathname).startsWith(normalizePortalPath(item.path)))
    .sort((left, right) => right.path.length - left.path.length)[0];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia?.('(max-width: 1023px)').matches ?? false);
  const [helpOpen, setHelpOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const currentPage = getCurrentNavigationEntry(navItems, portalLabel, location.pathname);
  const pageGuide = getPageGuide(location.pathname, currentPage?.label || portalLabel);
  const [clock, setClock] = useState(new Date());
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [contentSlots, setContentSlots] = useState<ContentSlot[]>(() => ([{
    key: initialRouteKey,
    node: outlet,
  }]));
  const [displayedRouteKey, setDisplayedRouteKey] = useState(initialRouteKey);
  const [pendingRouteKey, setPendingRouteKey] = useState<string | null>(null);
  const [armedRouteKey, setArmedRouteKey] = useState<string | null>(null);
  const [routeLoadingMessage, setRouteLoadingMessage] = useState(() => getPortalLoadingMessage(initialNavItem?.label));
  const syncConnected = useRealtimeSyncStore((state) => state.connected);
  const connectSync = useRealtimeSyncStore((state) => state.connectSync);
  const disconnectSync = useRealtimeSyncStore((state) => state.disconnectSync);
  useUserHeartbeat();

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 1023px)');
    if (!media) return;
    const update = () => { setCompact(media.matches); if (!media.matches) setMobileOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobileOpen || !compact) return;
    const previousOverflow = document.body.style.overflow;
    const menuTrigger = menuTriggerRef.current;
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]') || []).filter(element => !element.closest('[hidden]'));
    const focusFrame = window.requestAnimationFrame(() => controls()[0]?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setMobileOpen(false); }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      if (window.matchMedia?.('(max-width: 1023px)').matches) menuTrigger?.focus();
    };
  }, [compact, mobileOpen]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30000);
    connectSync();
    return () => {
      window.clearInterval(interval);
      disconnectSync();
    };
  }, [connectSync, disconnectSync]);

  useEffect(() => {
    const activeParent = navItems.find((item) => item.children?.some((child) => isItemActive(child)));
    if (activeParent) setExpandedMenus((current) => new Set(current).add(activeParent.id));
    setMobileOpen(false);
    // location.pathname intentionally drives this synchronization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const routeKey = `${location.pathname}${location.search}`;
    if (routeKey === displayedRouteKey) return undefined;

    const requested = requestedNavigation.current;
    const matchedItem = getPortalDestinations(navItems)
      .filter((item) => normalizePortalPath(location.pathname).startsWith(normalizePortalPath(item.path)))
      .sort((left, right) => right.path.length - left.path.length)[0];
    const nextMessage = requested && normalizePortalPath(requested.path) === normalizePortalPath(location.pathname)
      ? requested.message
      : getPortalLoadingMessage(matchedItem?.label);

    requestedNavigation.current = null;
    setRouteLoadingMessage(nextMessage);
    setPendingRouteKey(routeKey);
    setArmedRouteKey(null);
    setContentSlots((current) => [
      ...current.filter((slot) => slot.key === displayedRouteKey),
      { key: routeKey, node: outletRef.current },
    ]);
    requestLoading(navigationToken.current, nextMessage);

    const readyCheck = window.setTimeout(() => {
      releaseLoading(navigationToken.current);
      setArmedRouteKey(routeKey);
    }, 0);
    return () => window.clearTimeout(readyCheck);
  }, [displayedRouteKey, location.pathname, location.search, navItems, releaseLoading, requestLoading]);

  useEffect(() => {
    if (!pendingRouteKey || armedRouteKey !== pendingRouteKey || loadingActive) return;
    setDisplayedRouteKey(pendingRouteKey);
    setContentSlots((current) => current.filter((slot) => slot.key === pendingRouteKey));
    setPendingRouteKey(null);
    setArmedRouteKey(null);
  }, [armedRouteKey, loadingActive, pendingRouteKey]);

  const isPathActive = (path: string, exact = false) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname === `${path}/` || location.pathname.startsWith(`${path}/`);
  };
  const isItemActive = (item: PortalNavItem) => isPathActive(item.path,item.exact) || (item.activePaths ?? []).some(path => isPathActive(path));

  const goTo = (path: string, label: string) => {
    if (!shouldStartPortalNavigation(location.pathname, path)) {
      setMobileOpen(false);
      return;
    }
    const message = getPortalLoadingMessage(label);
    requestedNavigation.current = { path, message };
    setRouteLoadingMessage(message);
    requestLoading(navigationToken.current, message);
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
    <aside ref={sidebarRef} inert={compact && !mobileOpen} aria-hidden={compact && !mobileOpen ? true : undefined} role={compact && mobileOpen ? 'dialog' : undefined} aria-modal={compact && mobileOpen ? true : undefined} aria-label={compact && mobileOpen ? `${portalLabel} navigation menu` : undefined} className={`hirna-sidebar fixed inset-y-0 left-0 z-40 flex w-72 max-w-[calc(100vw-3rem)] flex-col overflow-hidden shadow-2xl transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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

      <PortalMenu items={navItems} portalLabel={portalLabel} expanded={expandedMenus} isActive={isItemActive} toggle={toggleMenu} goTo={goTo} />

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
    <div className="hirna-app min-h-screen" aria-busy={loadingActive ? 'true' : 'false'}>
      <a href="#portal-content" className="portal-skip-link" onClick={() => document.getElementById('portal-content')?.focus()}>Skip to page content</a>
      {sidebar}
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}

      <main inert={compact && mobileOpen} className="hirna-main min-h-screen lg:pl-72">
        <NotificationFocusManager />
        <header className="hirna-topbar sticky top-0 z-20 flex min-h-[76px] items-center gap-3 border-b px-4 py-3 sm:px-6 lg:px-8">
          <button ref={menuTriggerRef} type="button" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="rounded-control border border-[var(--hirna-border)] bg-[var(--hirna-surface)] p-2 text-slate-600 shadow-sm lg:hidden" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold text-slate-700">{currentPage?.label || portalLabel}</p>
            <p className="hidden text-xs text-slate-500 sm:block">{currentPage?.context || portalLabel}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            <button type="button" onClick={() => setHelpOpen(true)} className="flex min-h-11 items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" aria-label="Help with this page">
              <CircleHelp aria-hidden="true" className="h-5 w-5" /><span className="hidden sm:inline">Help</span>
            </button>
            <NotificationBell />
            <UserProfileMenu profilePath={profilePath} settingsPath={settingsPath} roleLabelOverride={roleLabel} />
          </div>
        </header>
        <div id="portal-content" tabIndex={-1} className="hirna-content p-4 sm:p-6 lg:p-8">
          {children ?? contentSlots.map((slot) => {
            const displayed = slot.key === displayedRouteKey;
            return (
              <div
                key={slot.key}
                data-portal-route-key={slot.key}
                className={displayed ? 'relative' : 'pointer-events-none invisible absolute inset-0'}
                aria-hidden={displayed ? undefined : 'true'}
              >
                <Suspense fallback={<PortalLoadingOverlay message={routeLoadingMessage} />}>
                  {slot.node}
                </Suspense>
              </div>
            );
          })}
        </div>
      </main>
      <Modal open={helpOpen} title={`Help: ${currentPage?.label || portalLabel}`} description={pageGuide.purpose} onClose={() => setHelpOpen(false)}>
        <h3 className="text-sm font-semibold text-slate-900">How to use this page</h3>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700">{pageGuide.steps.map(step => <li key={step}>{step}</li>)}</ol>
        {pageGuide.note && <p className="mt-4 rounded-control border border-[var(--hirna-border)] bg-[var(--hirna-surface-hover)] p-3 text-sm text-slate-700">{pageGuide.note}</p>}
        <p className="mt-4 text-sm text-slate-500">Use Find a page in the menu to locate a task. Available actions depend on your access and the record’s current status.</p>
      </Modal>
    </div>
  );
};

export const PortalShell: React.FC<PortalShellProps> = (props) => (
  <PortalLoadingProvider>
    <PortalShellFrame {...props} />
  </PortalLoadingProvider>
);
