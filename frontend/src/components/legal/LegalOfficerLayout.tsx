import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, LogOut, FileText, FileSignature,
  Archive, ScrollText, User, Settings,
  ChevronRight, AlertTriangle, Search,
  BellRing, Gavel,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { logout as apiLogout } from '../../api/authService';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { NotificationBell } from '../ui/NotificationBell';

export const LegalOfficerLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  useUserHeartbeat();
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [clock, setClock] = useState(new Date());

  const syncConnected = useRealtimeSyncStore(s => s.connected);
  const connectSync = useRealtimeSyncStore(s => s.connectSync);
  const disconnectSync = useRealtimeSyncStore(s => s.disconnectSync);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30000);
    connectSync();
    return () => { clearInterval(id); disconnectSync(); };
  }, [connectSync, disconnectSync]);

  const isActive = (path: string) => {
    if (path === '/legal') {
      return location.pathname === '/legal' || location.pathname === '/legal/';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/legal', icon: LayoutDashboard },
    { id: 'contracts', label: 'Contracts', path: '/legal/contracts', icon: FileSignature },
    { id: 'cases', label: 'Legal Cases', path: '/legal/cases', icon: Gavel },
    { id: 'notices', label: 'Legal Notices', path: '/legal/notices', icon: BellRing },
    { id: 'documents', label: 'Documents', path: '/legal/documents', icon: FileText },
    { id: 'retention', label: 'Retention', path: '/legal/retention-policies', icon: Archive, view: true },
    { id: 'audit', label: 'Audit Trail', path: '/legal/audit-logs', icon: ScrollText, view: true },
    { id: 'profile', label: 'Profile', path: '/legal/profile', icon: User },
    { id: 'settings', label: 'Settings', path: '/legal/settings', icon: Settings },
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
            <p className="text-[10px] text-[#00E676] font-medium truncate">Legal Officer</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto scrollbar-none px-3 py-3 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const navIsActive = isActive(item.path);
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
                  {item.view && (
                    <span className="text-[9px] text-white/40 font-mono px-1.5 py-0.5 rounded-full border border-white/20">view</span>
                  )}
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
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${syncConnected ? 'bg-[#00E676] shadow-[0_0_8px_rgba(0,230,118,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                  <span>{syncConnected ? 'All OK' : 'Connecting...'}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5">
                {[
                  { label: 'Realtime', status: syncConnected ? 'operational' as const : 'connecting' as const },
                  { label: 'API', status: 'operational' as const },
                ].map(s => (
                  <div key={s.label} className="flex items-center space-x-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'operational' ? 'bg-[#00E676] shadow-[0_0_8px_rgba(0,230,118,0.5)]' : 'bg-amber-500'}`} />
                    <span className="text-[10px] text-white/60 font-mono">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
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
                  {user?.fullName?.charAt(0) || 'L'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate leading-tight">{user?.fullName || 'Legal Officer'}</p>
                  <p className="text-[10px] text-white/70 font-mono truncate leading-tight">LEGAL_OFFICER</p>
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
              <input type="text" placeholder="Search contracts, cases, or documents..."
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-300 text-sm rounded-xl pl-9 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676]/30 transition-all" />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <NotificationBell />
            <span className="text-xs text-slate-400 font-mono">Legal &amp; Contract Management</span>
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
                <p className="text-xs text-slate-500">Terminate legal officer session?</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">Are you sure you want to end your session?</p>
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
