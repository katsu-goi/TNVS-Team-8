import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
 Building2, Users, FileText, Scale, LayoutDashboard, LogOut, Search,
  ShieldCheck, Leaf, ChevronRight, ChevronDown, AlertTriangle,
 FileSpreadsheet, Layers, Wrench, Tv, Calendar, BarChart3, UserCheck, Clock,
 Shield, Archive, Brain, ScanLine, Gavel, FileSearch, FileCheck, BookOpen,
 KeyRound, Activity, Monitor, Eye,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { Breadcrumbs } from './Breadcrumbs';

const parentIds = ['facilities', 'visitors', 'documents', 'legal', 'contracts', 'security'];

export const AppLayout: React.FC = () => {
 const { user, logout } = useAuthStore();
 const location = useLocation();
 const navigate = useNavigate();
 const [searchQuery, setSearchQuery] = useState('');
 const [showNotifications, setShowNotifications] = useState(false);
 const [showLogoutModal, setShowLogoutModal] = useState(false);
 const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
 const [clock, setClock] = useState(new Date());
 const notifications = useDashboardStore(s => s.notifications);
 useEffect(() => {
 const seg = location.pathname.split('/')[1];
 if (seg && parentIds.includes(seg)) {
 setExpandedMenus(prev => prev.has(seg) ? prev : new Set([...prev, seg]));
 }
 }, [location.pathname]);

 const connectRealtime = useDashboardStore(s => s.connectWebSocket);
 const disconnectRealtime = useDashboardStore(s => s.disconnectWebSocket);

 useEffect(() => {
 const id = setInterval(() => setClock(new Date()), 30000);
 connectRealtime();
 return () => { clearInterval(id); disconnectRealtime(); };
 }, [connectRealtime, disconnectRealtime]);

 const unreadCount = notifications.length;

 const toggleMenu = (id: string) => {
 setExpandedMenus(prev => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id); else next.add(id);
 return next;
 });
 };

 const isActive = (path: string) => {
 if (path === '/') return location.pathname === '/';
 return location.pathname.startsWith(path);
 };

 const isExactActive = (path: string) => location.pathname === path;

 const navItems = [
 { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard, exact: true },
 {
 id: 'facilities', label: 'Facilities & Rooms', path: '/facilities/reservations', icon: Building2,
 children: [
 { id: 'facilities-reservations', label: 'Reservation Governance', path: '/facilities/reservations', icon: FileSpreadsheet },
 { id: 'facilities-rooms', label: 'Room Management', path: '/facilities/rooms', icon: Layers },
 { id: 'facilities-maintenance', label: 'Maintenance Control', path: '/facilities/maintenance', icon: Wrench },
 { id: 'facilities-equipment', label: 'Equipment Inventory', path: '/facilities/equipment', icon: Tv },
 { id: 'facilities-calendar', label: 'Enterprise Calendar', path: '/facilities/calendar', icon: Calendar },
 { id: 'facilities-analytics', label: 'Analytics & Reports', path: '/facilities/analytics', icon: BarChart3 },
 ],
 },
 {
 id: 'visitors', label: 'Visitor Pass & Security', path: '/visitors', icon: Users,
 children: [
 { id: 'visitors-management', label: 'Visitor Management', path: '/visitors', icon: UserCheck, exact: true },
 { id: 'visitors-clearance', label: 'Security Clearance', path: '/visitors/clearance', icon: Shield },
 { id: 'visitors-approval', label: 'Visitor Approval Queue', path: '/visitors/approval', icon: Clock },
 { id: 'visitors-logs', label: 'Visitor Logs', path: '/visitors/logs', icon: FileText },
 ],
 },
 {
 id: 'documents', label: 'AI Document Management', path: '/documents', icon: FileText,
 children: [
 { id: 'documents-list', label: 'Documents', path: '/documents', icon: FileText, exact: true },
 { id: 'documents-ai', label: 'AI Classification', path: '/documents/ai-classification', icon: Brain },
 { id: 'documents-ocr', label: 'OCR Processing', path: '/documents/ocr', icon: ScanLine },
 { id: 'documents-archive', label: 'Archive', path: '/documents/archive', icon: Archive },
 ],
 },
 {
 id: 'legal', label: 'Legal & Disputes', path: '/legal', icon: Scale,
 children: [
 { id: 'legal-cases', label: 'Legal Cases', path: '/legal', icon: Gavel, exact: true },
 { id: 'legal-hearings', label: 'Hearings', path: '/legal/hearings', icon: Calendar },
 { id: 'legal-compliance', label: 'Compliance', path: '/legal/compliance', icon: ShieldCheck },
 { id: 'legal-evidence', label: 'Evidence', path: '/legal/evidence', icon: Eye },
 ],
 },
 {
 id: 'contracts', label: 'Contract Analytics AI', path: '/contracts', icon: FileText,
 children: [
 { id: 'contracts-list', label: 'Contracts', path: '/contracts', icon: FileText, exact: true },
 { id: 'contracts-risk', label: 'AI Risk Analysis', path: '/contracts/risk-analysis', icon: FileSearch },
 { id: 'contracts-renewals', label: 'Renewals', path: '/contracts/renewals', icon: FileCheck },
 { id: 'contracts-obligations', label: 'Obligations', path: '/contracts/obligations', icon: BookOpen },
 ],
 },
 {
 id: 'security', label: 'Security Center', path: '/security', icon: ShieldCheck,
 children: [
 { id: 'security-audit', label: 'Audit Logs', path: '/security', icon: FileText, exact: true },
 { id: 'security-rbac', label: 'RBAC', path: '/security/rbac', icon: KeyRound },
 { id: 'security-events', label: 'Security Events', path: '/security/events', icon: Activity },
 { id: 'security-monitoring', label: 'System Monitoring', path: '/security/monitoring', icon: Monitor },
 ],
 },
 ];

 return (
  <div className="min-h-screen bg-[#0B0F19] text-[#E2E8F0]">
 {/* Sidebar — fixed, independent of page scroll */}
  <aside className="fixed top-0 left-0 w-72 h-screen z-30 bg-[#0B0F19] flex flex-col overflow-hidden shadow-2xl">
  {/* Brand Header */}
  <div className="p-5 pb-4 flex items-center space-x-3 shrink-0 border-b border-[#00E676]/20">
  <div className="w-9 h-9 rounded-xl bg-[#00E676]/15 flex items-center justify-center shrink-0">
  <Leaf className="w-5 h-5 text-[#00E676]" />
  </div>
  <div className="min-w-0">
  <h1 className="font-heading font-bold text-sm text-[#E2E8F0] leading-tight truncate">Facilities &amp; Admin</h1>
  <p className="text-[10px] text-[#00E676] font-medium truncate">Enterprise Management</p>
  </div>
  </div>

 {/* Navigation — fills remaining space, hidden scrollbar if overflow */}
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
  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${
  isParentActive
  ? 'bg-[#00E676]/15 text-[#00E676] font-semibold'
  : 'text-[#E2E8F0] hover:text-[#00E676] hover:bg-white/5'
  }`}
  >
  <div className="flex items-center space-x-2.5 min-w-0">
  <Icon className={`w-[18px] h-[18px] shrink-0 ${isParentActive ? 'text-[#00E676]' : 'text-[#64748B]'}`} />
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
  className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 ${
  isChildActive
  ? 'bg-[#00E676]/15 text-[#00E676] font-semibold'
  : 'text-[#94A3B8] hover:text-[#00E676] hover:bg-white/5'
  }`}
  >
  <ChildIcon className={`w-3.5 h-3.5 shrink-0 ${isChildActive ? 'text-[#00E676]' : 'text-[#64748B]'}`} />
  <span className="truncate">{child.label}</span>
  {isChildActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-[#00E676]" />}
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
  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${
  navIsActive
  ? 'bg-[#00E676]/15 text-[#00E676] font-semibold'
  : 'text-[#E2E8F0] hover:text-[#00E676] hover:bg-white/5'
  }`}
  >
  <div className="flex items-center space-x-2.5 min-w-0">
  <Icon className={`w-[18px] h-[18px] shrink-0 ${navIsActive ? 'text-[#00E676]' : 'text-[#64748B]'}`} />
  <span className="truncate">{item.label}</span>
  </div>
  {navIsActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#00E676]" />}
 </button>
 );
 })}
 </div>

  {/* System Status */}
  <div className="shrink-0 border-t border-white/5">
  <div className="px-4 py-3 pt-3">
  <div className="flex items-center justify-between mb-2">
  <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-widest">System Status</span>
  <span className="text-[10px] text-[#00E676] font-mono flex items-center space-x-1">
  <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] inline-block" />
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
  <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'operational' ? 'bg-[#00E676]' : 'bg-amber-500'}`} />
  <span className="text-[10px] text-[#64748B] font-mono">{s.label}</span>
  </div>
  ))}
  </div>
  <div className="mt-3 flex items-center justify-between">
  <span className="text-[10px] text-[#475569] font-mono">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  <span className="text-[10px] text-[#475569] font-mono">Local</span>
  </div>
  </div>
  </div>
 </nav>

  {/* User Footer — pinned to bottom */}
  <div className="shrink-0 border-t border-white/5 bg-[#0B0F19]">
  <div className="px-3 py-2.5 pt-2.5">
  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5">
  <div className="flex items-center space-x-2.5 min-w-0">
  <div className="w-8 h-8 rounded-full bg-[#00E676]/15 flex items-center justify-center font-bold text-[#00E676] text-xs shrink-0">
  {user?.fullName?.charAt(0) || 'A'}
  </div>
  <div className="min-w-0">
  <p className="text-xs font-semibold text-[#E2E8F0] truncate leading-tight">{user?.fullName || 'Administrator'}</p>
  <p className="text-[10px] text-[#00E676] font-mono truncate leading-tight">{user?.role || 'SUPER_ADMIN'}</p>
  </div>
  </div>
  <button onClick={() => setShowLogoutModal(true)} title="Logout"
  className="p-1.5 text-[#64748B] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0">
  <LogOut className="w-3.5 h-3.5" />
  </button>
  </div>
  </div>
  </div>
 </aside>

 {/* Main Content — uses natural page scroll (body is the only scrollbar) */}
  <main className="pl-72 min-h-screen relative bg-[#F8FAFC]">
  {/* Top header bar — sticky within main */}
  <header className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
  <div className="flex items-center space-x-4 flex-1 max-w-md">
  <div className="relative w-full">
  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
  <input type="text" placeholder="Search facilities, documents, contracts, or legal cases..."
  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
  className="w-full bg-white border border-slate-300 text-sm rounded-xl pl-9 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676]/30 transition-all" />
  </div>
  </div>
  <div className="flex items-center space-x-3 relative">
  <button onClick={() => setShowNotifications(o => !o)}
  className="relative p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors" title="Notifications">
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
  {unreadCount > 0 && (
  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
  )}
  </button>
  {showNotifications && (
  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-lg border border-slate-200 z-50 overflow-hidden">
  <div className="p-4 flex items-center justify-between border-b border-slate-100">
  <div className="flex items-center space-x-2">
  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
  <span className="font-heading font-bold text-sm text-slate-900">Notifications</span>
  {unreadCount > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold">{unreadCount} new</span>}
  </div>
  <button onClick={() => setShowNotifications(false)} className="text-[11px] text-slate-400 hover:text-slate-700">&times;</button>
  </div>
  <div className="max-h-72 overflow-y-auto">
  {notifications.length === 0 ? (
  <div className="p-6 text-center text-xs text-slate-400">No notifications yet. Notifications appear in real-time as data is created.</div>
  ) : (
  notifications.map(n => (
  <div key={n.id} className="p-3.5 text-xs space-y-1 hover:bg-slate-50 transition-colors">
  <div className="flex items-start space-x-2">
  <span className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 ${
  n.type === 'SECURITY' ? 'bg-red-50 text-red-600' :
  n.type === 'USER' ? 'bg-green-50 text-green-600' :
  'bg-amber-50 text-amber-600'
  }`}>
  {n.type === 'SECURITY' ? '!' : n.type === 'USER' ? 'U' : 'R'}
  </span>
  <div className="flex-1 min-w-0">
  <p className="text-slate-600 leading-snug">{n.message}</p>
  <p className="text-[10px] text-slate-400 mt-1 font-mono">{new Date(n.timestamp).toLocaleTimeString()}</p>
  </div>
  </div>
  </div>
  ))
  )}
  </div>
  </div>
  )}
  </div>
  </header>

 {/* Content — this expands naturally; page scroll is on body/html */}
 <div className="p-8">
 <Breadcrumbs />
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
  <button onClick={() => { setShowLogoutModal(false); logout(); }} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs">Confirm Logout</button>
  </div>
  </div>
  </div>
  )}
 </div>
 );
};
