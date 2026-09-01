import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Search, ShieldCheck, ChevronRight, ChevronDown,
  BarChart3, Activity, Monitor, Layers, Download,
  Settings, Bell, FileText, Cpu, KeyRound,
} from 'lucide-react';
import { hasPermission, hasRole, isSuperAdmin, useAuthStore } from '../../stores/authStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { NotificationBell } from '../ui/NotificationBell';
import { UserProfileMenu } from '../ui/UserProfileMenu';
import { HirnaSidebarDecoration } from '../ui/HirnaSidebarDecoration';
// Breadcrumbs available for future use

const parentIds = ['security'];

export const AppLayout: React.FC = () => {
 const { user } = useAuthStore();
 const location = useLocation();
 const navigate = useNavigate();
 useUserHeartbeat();
 const [searchQuery, setSearchQuery] = useState('');
 const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
 const [clock, setClock] = useState(new Date());
 useEffect(() => {
 const seg = location.pathname.split('/')[1];
 if (seg && parentIds.includes(seg)) {
 setExpandedMenus(prev => prev.has(seg) ? prev : new Set([...prev, seg]));
 }
 }, [location.pathname]);

 const connectRealtime = useDashboardStore(s => s.connectWebSocket);
 const disconnectRealtime = useDashboardStore(s => s.disconnectWebSocket);
 const connectSync = useRealtimeSyncStore(s => s.connectSync);
 const disconnectSync = useRealtimeSyncStore(s => s.disconnectSync);

 useEffect(() => {
 const id = setInterval(() => setClock(new Date()), 30000);
 connectRealtime();
 connectSync();
 return () => { clearInterval(id); disconnectRealtime(); disconnectSync(); };
 }, [connectRealtime, disconnectRealtime, connectSync, disconnectSync]);

 const toggleMenu = (id: string) => {
 setExpandedMenus(prev => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id); else next.add(id);
 return next;
 });
 };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path;
  };

  const isExactActive = (path: string) => location.pathname === path;

  const systemAdministrator = isSuperAdmin(user) || hasRole(user, 'SYSTEM_ADMIN');
  const navItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard, exact: true, visible: systemAdministrator },
  { id: 'integrations', label: 'Integrations', path: '/admin/integrations', icon: Layers, exact: true, visible: systemAdministrator },
  { id: 'ai-services', label: 'AI Services', path: '/admin/ai-services', icon: Cpu, exact: true, visible: systemAdministrator },
  { id: 'backup', label: 'Backup & DR', path: '/admin/backup', icon: Download, exact: true, visible: systemAdministrator },
  { id: 'settings', label: 'System Config', path: '/admin/settings', icon: Settings, exact: true, visible: systemAdministrator },
  { id: 'notifications', label: 'Notifications', path: '/admin/notifications', icon: Bell, exact: true, visible: systemAdministrator },
  { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: BarChart3, exact: true, visible: systemAdministrator },
  { id: 'rbac', label: 'RBAC Administration', path: '/admin/rbac', icon: KeyRound, exact: true, visible: hasPermission(user, 'RBAC_ADMINISTER') },
  {
  id: 'security', label: 'Security Center', path: '/security', icon: ShieldCheck,
  visible: systemAdministrator,
  children: [
  { id: 'security-audit', label: 'Audit Logs', path: '/security/audit-logs', icon: FileText, exact: true },
  { id: 'security-sessions', label: 'Sessions', path: '/admin/sessions', icon: Activity, exact: true },
  { id: 'security-health', label: 'System Health', path: '/admin/system-health', icon: Monitor, exact: true },
  ],
  },
  ].filter((item) => item.visible);

  return (
   <div className="min-h-screen bg-[#F8FAFC]">
    <aside className="hirna-sidebar fixed top-0 left-0 w-72 h-screen z-30 flex flex-col overflow-hidden shadow-2xl">
    <div className="hirna-sidebar-header p-5 flex items-center space-x-3 shrink-0">
     <div className="hirna-sidebar-logo flex items-center justify-center shrink-0 overflow-hidden">
     <img src="/hirna-logo.png" alt="Hirna Logo" className="w-full h-full object-contain" draggable={false} />
     </div>
    <div className="min-w-0">
     <h1 className="font-heading font-bold text-sm text-white leading-tight truncate">Hirna Portal</h1>
     <p className="text-[10px] text-[#FFC629] font-medium truncate">System Administration</p>
    </div>
    </div>
 
  <nav className="flex-1 flex flex-col min-h-0">
  <div className="hirna-sidebar-nav flex-1 overflow-y-auto scrollbar-none px-3 py-3 flex flex-col">
  {navItems.map((item) => {
  const Icon = item.icon;
 
  if (item.children) {
  const isParentActive = isActive('/' + item.id);
  const isExpanded = expandedMenus.has(item.id);
  return (
  <div key={item.id}>
  <button
  onClick={() => { toggleMenu(item.id); navigate(item.path); }}
    className={`hirna-nav-item w-full flex items-center justify-between px-3 py-2.5 font-medium text-sm ${
    isParentActive
    ? 'hirna-nav-item-active font-semibold'
    : ''
    }`}
    >
    <div className="flex items-center space-x-2.5 min-w-0">
    <Icon className="hirna-nav-icon w-[18px] h-[18px] shrink-0" />
   <span className="truncate">{item.label}</span>
   </div>
   <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
  </button>
  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
  <div className="ml-3 pl-1 mt-0.5 space-y-0.5">
  {item.children.map((child) => {
  const ChildIcon = child.icon;
  const isChildActive = child.exact ? isExactActive(child.path) : isExactActive(child.path);
  return (
  <button
  key={child.id}
  onClick={() => navigate(child.path)}
    className={`hirna-nav-item w-full flex items-center space-x-2 px-3 py-2 text-xs font-medium ${
    isChildActive
    ? 'hirna-nav-item-active font-semibold'
    : ''
    }`}
    >
    <ChildIcon className="hirna-nav-icon w-3.5 h-3.5 shrink-0" />
    <span className="truncate">{child.label}</span>
    {isChildActive && <ChevronRight className="hirna-nav-chevron w-3 h-3 ml-auto shrink-0" />}
  </button>
  );
  })}
  </div>
  </div>
  </div>
  );
  }
 
  const navIsActive = item.exact ? isExactActive(item.path) : isActive(item.path);
  return (
  <button
  key={item.id}
  onClick={() => navigate(item.path)}
    className={`hirna-nav-item w-full flex items-center justify-between px-3 py-2.5 font-medium text-sm ${
    navIsActive
    ? 'hirna-nav-item-active font-semibold'
    : ''
    }`}
    >
    <div className="flex items-center space-x-2.5 min-w-0">
    <Icon className="hirna-nav-icon w-[18px] h-[18px] shrink-0" />
    <span className="truncate">{item.label}</span>
    </div>
    {navIsActive && <ChevronRight className="hirna-nav-chevron w-3.5 h-3.5 shrink-0" />}
  </button>
  );
  })}
  </div>

    <HirnaSidebarDecoration />

    <div className="shrink-0 px-3 py-2">
    <div className="hirna-status-card p-3">
    <div className="flex items-center justify-between mb-2">
    <span className="text-[10px] font-semibold text-white/80 uppercase tracking-widest">System Status</span>
    <span className="text-[10px] text-white font-mono flex items-center space-x-1">
    <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)] inline-block" />
    <span>All OK</span>
    </span>
    </div>
    <div className="grid grid-cols-2 gap-y-1.5">
    {[
    { label: 'Database', status: 'operational' as const },
    { label: 'API', status: 'operational' as const },
    { label: 'WebSocket', status: 'operational' as const },
    { label: 'Storage', status: 'operational' as const },
    ].map(s => (
    <div key={s.label} className="flex items-center space-x-1.5">
    <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'operational' ? 'bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-amber-500'}`} />
    <span className="text-[10px] text-white/60 font-mono">{s.label}</span>
    </div>
    ))}
    </div>
    <div className="mt-3 flex items-center justify-between">
    <span className="text-[10px] text-white/40 font-mono">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    <span className="text-[10px] text-white/40 font-mono">Local</span>
    </div>
    </div>
    </div>
  </nav>
 
  </aside>
 
   <main className="pl-72 min-h-screen relative bg-[#F8FAFC]">
   <header className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
   <div className="flex items-center space-x-4 flex-1 max-w-md">
   <div className="relative w-full">
   <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
    <input type="text" placeholder="Search logs, settings, or admin pages..."
   value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
   className="w-full bg-white border border-slate-300 text-sm rounded-xl pl-9 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#D02F34] focus:ring-1 focus:ring-[#D02F34]/30 transition-all" />
   </div>
   </div>
 <div className="flex shrink-0 items-center space-x-2 sm:space-x-3 relative">
    <NotificationBell />
    <UserProfileMenu roleLabelOverride="System Admin" />
    </div>
    </header>

 <div className="p-8">
 <Outlet />
 </div>
 </main>

 </div>
 );
};
