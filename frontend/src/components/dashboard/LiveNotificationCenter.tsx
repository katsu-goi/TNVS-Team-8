import React, { useState } from 'react';
import { Bell, X, ShieldAlert, UserPlus, FileWarning, AlertTriangle } from 'lucide-react';
import { useDashboardStore } from '../../stores/dashboardStore';

export const LiveNotificationCenter: React.FC = () => {
 const { notifications, removeNotification } = useDashboardStore();
 const [isOpen, setIsOpen] = useState(false);

 const unreadCount = notifications.length;

 const getIcon = (type: string) => {
 switch(type) {
 case 'SECURITY': return <ShieldAlert className="w-4 h-4 text-rose-500" />;
 case 'USER': return <UserPlus className="w-4 h-4 text-emerald-600" />;
 case 'REPORT': return <FileWarning className="w-4 h-4 text-emerald-500" />;
 default: return <AlertTriangle className="w-4 h-4 text-emerald-600" />;
 }
 };

 return (
 <div className="relative">
 <button 
 onClick={() => setIsOpen(!isOpen)}
 className="p-2 relative bg-surface-tertiary border border-slate-200 rounded-lg hover:bg-slate-50 transition"
 >
 <Bell className="w-4 h-4 text-slate-500" />
 {unreadCount > 0 && (
 <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white animate-bounce">
 {unreadCount > 9 ? '9+' : unreadCount}
 </span>
 )}
 </button>

 {isOpen && (
 <div className="absolute right-0 mt-3 w-80 bg-white border border-slate-200 rounded-xl shadow-glass z-50 overflow-hidden flex flex-col max-h-96">
 <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
 <span className="text-xs font-bold text-slate-500 uppercase">Live Notifications</span>
 <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-900"><X className="w-4 h-4" /></button>
 </div>
 <div className="overflow-y-auto flex-1 p-2 space-y-2">
 {notifications.length === 0 ? (
 <div className="p-4 text-center text-xs text-slate-400">No new notifications</div>
 ) : (
 notifications.map((n) => (
 <div key={n.id} className="flex items-start p-3 bg-slate-50 border border-slate-200-secondary rounded-lg group">
 <div className="mt-0.5 mr-3 p-1.5 bg-slate-100 rounded-md">
 {getIcon(n.type)}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-xs text-slate-500 line-clamp-2">{n.message}</p>
 <p className="text-[10px] text-slate-400 mt-1 font-mono">{new Date(Number(n.timestamp)).toLocaleTimeString()}</p>
 </div>
 <button onClick={() => removeNotification(n.id)} className="ml-2 text-slate-400 opacity-0 group-hover:opacity-100 transition hover:text-red-600">
 <X className="w-3.5 h-3.5" />
 </button>
 </div>
 ))
 )}
 </div>
 </div>
 )}
 </div>
 );
};

export default LiveNotificationCenter;
