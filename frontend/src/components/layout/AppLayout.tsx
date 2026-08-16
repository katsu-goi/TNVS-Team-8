import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, LogOut, Search, ShieldCheck, ChevronRight, ChevronDown,
  AlertTriangle, BarChart3, Activity, Monitor, Layers, Download,
  Settings, Bell, FileText, Cpu,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { logout as apiLogout } from '../../api/authService';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { NotificationBell } from '../ui/NotificationBell';
// Breadcrumbs available for future use

const parentIds = ['security'];

export const AppLayout: React.FC = () => {
 const { user, logout } = useAuthStore();
 const location = useLocation();
 const navigate = useNavigate();
 useUserHeartbeat();
 const [searchQuery, setSearchQuery] = useState('');
 const [showLogoutModal, setShowLogoutModal] = useState(false);
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

  const navItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard, exact: true },
  { id: 'integrations', label: 'Integrations', path: '/admin/integrations', icon: Layers, exact: true },
  { id: 'ai-services', label: 'AI Services', path: '/admin/ai-services', icon: Cpu, exact: true },
  { id: 'backup', label: 'Backup & DR', path: '/admin/backup', icon: Download, exact: true },
  { id: 'settings', label: 'System Config', path: '/admin/settings', icon: Settings, exact: true },
  { id: 'notifications', label: 'Notifications', path: '/admin/notifications', icon: Bell, exact: true },
  { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: BarChart3, exact: true },
  {
  id: 'security', label: 'Security Center', path: '/security', icon: ShieldCheck,
  children: [
  { id: 'security-audit', label: 'Audit Logs', path: '/security/audit-logs', icon: FileText, exact: true },
  { id: 'security-sessions', label: 'Sessions', path: '/admin/sessions', icon: Activity, exact: true },
  { id: 'security-health', label: 'System Health', path: '/admin/system-health', icon: Monitor, exact: true },
  ],
  },
  ];

 return (
  <div className="min-h-screen bg-[#F8FAFC]">
   <aside className="fixed top-0 left-0 w-72 h-screen z-30 bg-[#042F24] flex flex-col overflow-hidden shadow-2xl">
   <div className="p-5 pb-4 flex items-center space-x-3 shrink-0 bg-[#011E17] border-b border-[#00E676]/20">
    <div className="w-9 h-9 rounded-xl bg-[#00E676]/20 flex items-center justify-center shrink-0 overflow-hidden">
    <img src="/greengsmlogo.png" alt="Green GSM Logo" className="w-full h-full object-contain" draggable={false} />
    </div>
   <div className="min-w-0">
    <h1 className="font-heading font-bold text-sm text-white leading-tight truncate">Green GSM</h1>
    <p className="text-[10px] text-[#00E676] font-medium truncate">System Administration</p>
   </div>
   </div>

 <nav className="flex-1 flex flex-col min-h-0">
 <div className="flex-1 overflow-y-auto scrollbar-none px-3 py-3 space-y-0.5">
 {navItems.map((item) => {
 const Icon = item.icon;

 if (item.children) {
 const isParentActive = isActive('/' + item.id);
 const isExpanded = expandedMenus.has(item.id);
 return (
 <div key={item.id}>
 <button
 onClick={() => { toggleMenu(item.id); navigate(item.path); }}
   className={`w-full flex items-center justify-between px-3 py-2.5 rounded-full font-medium text-sm transition-all duration-200 ${
   isParentActive
   ? 'bg-[#00E676] text-white font-semibold shadow-[0_0_16px_rgba(0,230,118,0.35)]'
   : 'text-white hover:bg-white/10'
   }`}
   >
   <div className="flex items-center space-x-2.5 min-w-0">
   <Icon className={`w-[18px] h-[18px] shrink-0 ${isParentActive ? 'text-white' : 'text-white/60'}`} />
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
   className={`w-full flex items-center space-x-2 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
   isChildActive
   ? 'bg-[#00E676] text-white font-semibold shadow-[0_0_14px_rgba(0,230,118,0.3)]'
   : 'text-white/70 hover:bg-white/10'
   }`}
   >
   <ChildIcon className={`w-3.5 h-3.5 shrink-0 ${isChildActive ? 'text-white' : 'text-white/50'}`} />
   <span className="truncate">{child.label}</span>
   {isChildActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-white" />}
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
   className={`w-full flex items-center justify-between px-3 py-2.5 rounded-full font-medium text-sm transition-all duration-200 ${
   navIsActive
   ? 'bg-[#00E676] text-white font-semibold shadow-[0_0_16px_rgba(0,230,118,0.35)]'
   : 'text-white hover:bg-white/10'
   }`}
   >
   <div className="flex items-center space-x-2.5 min-w-0">
   <Icon className={`w-[18px] h-[18px] shrink-0 ${navIsActive ? 'text-white' : 'text-white/60'}`} />
   <span className="truncate">{item.label}</span>
   </div>
   {navIsActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white" />}
 </button>
 );
 })}
 </div>

   <div className="shrink-0 px-3 py-2">
   <div className="bg-[#042F24]/80 rounded-xl border border-[#00E676]/15 p-3 backdrop-blur-sm">
   <div className="flex items-center justify-between mb-2">
   <span className="text-[10px] font-semibold text-white/80 uppercase tracking-widest">System Status</span>
   <span className="text-[10px] text-white font-mono flex items-center space-x-1">
   <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] shadow-[0_0_8px_rgba(0,230,118,0.5)] inline-block" />
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
   <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'operational' ? 'bg-[#00E676] shadow-[0_0_8px_rgba(0,230,118,0.5)]' : 'bg-amber-500'}`} />
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

   <div className="shrink-0 px-3 py-2">
   <div className="bg-[#042F24]/80 rounded-xl border border-[#00E676]/15 p-2.5 backdrop-blur-sm">
   <div className="flex items-center justify-between px-3 py-2 rounded-lg">
   <div className="flex items-center space-x-2.5 min-w-0">
   <div className="w-8 h-8 rounded-full bg-[#00E676]/20 flex items-center justify-center font-bold text-[#00E676] text-xs shrink-0">
   {user?.fullName?.charAt(0) || 'A'}
   </div>
   <div className="min-w-0">
   <p className="text-xs font-semibold text-white truncate leading-tight">{user?.fullName || 'Administrator'}</p>
   <p className="text-[10px] text-white/70 font-mono truncate leading-tight">{user?.roles?.[0] || 'SUPER_ADMIN'}</p>
   </div>
   </div>
   <button onClick={() => setShowLogoutModal(true)} title="Logout"
   className="p-1.5 text-white/40 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors shrink-0">
   <LogOut className="w-3.5 h-3.5" />
   </button>
   </div>
   </div>
   </div>
 </aside>

  <main className="pl-72 min-h-screen relative bg-[#F8FAFC]">
  <header className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
  <div className="flex items-center space-x-4 flex-1 max-w-md">
  <div className="relative w-full">
  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
   <input type="text" placeholder="Search logs, settings, or admin pages..."
  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
  className="w-full bg-white border border-slate-300 text-sm rounded-xl pl-9 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676]/30 transition-all" />
  </div>
  </div>
<div className="flex items-center space-x-3 relative">
   <NotificationBell />
   </div>
   </header>

 <div className="p-8">
 <Outlet />
 </div>
 </main>

  {showLogoutModal && (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
  <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
  <div className="flex items-center space-x-3 text-red-600">
  <div className="p-2.5 rounded-xl bg-red-50 border border-red-100"><AlertTriangle className="w-6 h-6" /></div>
  <div>
  <h3 className="font-heading font-bold text-lg text-slate-900">Confirm Logout</h3>
  <p className="text-xs text-slate-500">Terminate administrator session?</p>
  </div>
  </div>
  <p className="text-xs text-slate-600 leading-relaxed">Are you sure you want to end your session? Any unsaved changes in progress will be saved to audit logs.</p>
  <div className="flex justify-end space-x-3 pt-2">
  <button onClick={() => setShowLogoutModal(false)} className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-900 text-xs font-semibold">Cancel</button>
  <button onClick={() => { setShowLogoutModal(false); apiLogout().finally(() => logout()); }} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs">Confirm Logout</button>
  </div>
  </div>
  </div>
  )}
 </div>
 );
};
