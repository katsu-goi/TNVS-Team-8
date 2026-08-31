import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, CheckSquare,
  Building2, ClipboardList, BarChart3, Bell, User, Settings,
  ChevronRight, Search,
} from 'lucide-react';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { useUserHeartbeat } from '../../hooks/useUserHeartbeat';
import { NotificationBell } from '../ui/NotificationBell';
import { UserProfileMenu } from '../ui/UserProfileMenu';
import { HirnaSidebarDecoration } from '../ui/HirnaSidebarDecoration';

export const FacilitiesManagerLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useUserHeartbeat();
  const [searchQuery, setSearchQuery] = useState('');
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
    if (path === '/facilities') {
      return location.pathname === '/facilities' || location.pathname === '/facilities/';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/facilities', icon: LayoutDashboard },
    { id: 'reservations', label: 'Facility Reservations', path: '/facilities/reservations', icon: Calendar },
    { id: 'approval', label: 'Reservation Approval', path: '/facilities/approval', icon: CheckSquare },
    { id: 'rooms', label: 'Room Management', path: '/facilities/rooms', icon: Building2 },
    { id: 'calendar', label: 'Facility Calendar', path: '/facilities/calendar', icon: Calendar },
    { id: 'assets', label: 'Asset Overview', path: '/facilities/assets', icon: ClipboardList },
    { id: 'reports', label: 'Facility Reports', path: '/facilities/reports', icon: BarChart3 },
    { id: 'analytics', label: 'Analytics', path: '/facilities/analytics', icon: BarChart3 },
    { id: 'notifications', label: 'Notifications', path: '/facilities/notifications', icon: Bell },
    { id: 'profile', label: 'Profile', path: '/facilities/profile', icon: User },
    { id: 'settings', label: 'Settings', path: '/facilities/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="hirna-sidebar fixed top-0 left-0 w-72 h-screen z-30 flex flex-col overflow-hidden shadow-2xl">
        <div className="hirna-sidebar-header p-5 flex items-center space-x-3 shrink-0">
          <div className="hirna-sidebar-logo flex items-center justify-center shrink-0 overflow-hidden">
            <img src="/hirna-logo.png" alt="Hirna Logo" className="w-full h-full object-contain" draggable={false} />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading font-bold text-sm text-white leading-tight truncate">Hirna Portal</h1>
            <p className="text-[10px] text-[#FFC629] font-medium truncate">Facilities Management</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col min-h-0">
          <div className="hirna-sidebar-nav flex-1 overflow-y-auto scrollbar-none px-3 py-3 flex flex-col">
            {navItems.map((item) => {
              const Icon = item.icon;
              const navIsActive = isActive(item.path);
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
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${syncConnected ? 'bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                  <span>{syncConnected ? 'All OK' : 'Connecting...'}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5">
                {[
                  { label: 'Realtime', status: syncConnected ? 'operational' as const : 'connecting' as const },
                  { label: 'API', status: 'operational' as const },
                ].map(s => (
                  <div key={s.label} className="flex items-center space-x-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'operational' ? 'bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-amber-500'}`} />
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

      </aside>

      <main className="pl-72 min-h-screen relative bg-[#F8FAFC]">
        <header className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search facilities, rooms, or reservations..."
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-300 text-sm rounded-xl pl-9 pr-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#D02F34] focus:ring-1 focus:ring-[#D02F34]/30 transition-all" />
            </div>
          </div>
          <div className="flex shrink-0 items-center space-x-2 sm:space-x-3">
            <NotificationBell />
            <UserProfileMenu profilePath="/facilities/profile" settingsPath="/facilities/settings" />
          </div>
        </header>

        <div className="p-8">
          <Outlet />
        </div>
      </main>

    </div>
  );
};
