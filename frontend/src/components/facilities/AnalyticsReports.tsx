import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { BarChart3, Download, TrendingUp, Users, Clock } from 'lucide-react';
import { FacilitiesContext } from './FacilitiesLayout';

export const AnalyticsReports: React.FC = () => {
 const { rooms, reservations, kpis } = useOutletContext<FacilitiesContext>();

 const occupancyRate = kpis?.occupancyRatePercentage || 74;
 const avgUtilization = kpis?.avgDailyUtilizationPercentage || 68;

 return (
 <div className="space-y-6">
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
 <div className="flex items-center space-x-3">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600">
 <BarChart3 className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Analytics & Reports</h2>
 <p className="text-slate-400 text-xs mt-0.5">Enterprise Facility Intelligence • Occupancy, Utilization & Trends</p>
 </div>
 </div>
 <button onClick={() => alert('Exporting IBM TRIRIGA / Oracle Facilities Governance Report (CSV)...')}
 className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-xs transition-all flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20">
 <Download className="w-4 h-4" />
 <span>Export Reports</span>
 </button>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Occupancy Rate</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{occupancyRate}%</span>
 <span className="text-[10px] text-slate-500 block">Peak: {kpis?.peakReservationHours}</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Avg Daily Utilization</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{avgUtilization}%</span>
 <span className="text-[10px] text-emerald-600/80 block">Efficiency Score</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Rooms</span>
 <span className="text-xl font-bold text-white font-mono">{rooms.length}</span>
 <span className="text-[10px] text-slate-500 block">Facility Assets</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Reservations</span>
 <span className="text-xl font-bold text-white font-mono">{reservations.length}</span>
 <span className="text-[10px] text-slate-500 block">All Time</span>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="glass-panel p-6 space-y-4">
 <h3 className="font-heading font-bold text-white text-sm flex items-center space-x-2">
 <TrendingUp className="w-4 h-4 text-emerald-600" />
 <span>Peak Reservation Hours</span>
 </h3>
 <div className="space-y-3 text-xs">
 <div>
 <div className="flex justify-between text-slate-300 mb-1"><span>10:00 AM - 12:00 PM</span><span className="font-mono text-emerald-600 font-bold">92% Occupied</span></div>
 <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full w-[92%] rounded-full"></div></div>
 </div>
 <div>
 <div className="flex justify-between text-slate-300 mb-1"><span>02:00 PM - 04:00 PM</span><span className="font-mono text-emerald-600 font-bold">84% Occupied</span></div>
 <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full w-[84%] rounded-full"></div></div>
 </div>
 <div>
 <div className="flex justify-between text-slate-300 mb-1"><span>08:00 AM - 10:00 AM</span><span className="font-mono text-emerald-600 font-bold">65% Occupied</span></div>
 <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full w-[65%] rounded-full"></div></div>
 </div>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <h3 className="font-heading font-bold text-white text-sm flex items-center space-x-2">
 <Users className="w-4 h-4 text-emerald-600" />
 <span>Department Usage Distribution</span>
 </h3>
 <div className="space-y-3 text-xs">
 <div>
 <div className="flex justify-between text-slate-300 mb-1"><span>Information Technology & DevOps</span><span className="font-mono text-emerald-600">38%</span></div>
 <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full w-[38%] rounded-full"></div></div>
 </div>
 <div>
 <div className="flex justify-between text-slate-300 mb-1"><span>Executive C-Suite</span><span className="font-mono text-emerald-600">28%</span></div>
 <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full w-[28%] rounded-full"></div></div>
 </div>
 <div>
 <div className="flex justify-between text-slate-300 mb-1"><span>Corporate HR & Recruitment</span><span className="font-mono text-emerald-600">20%</span></div>
 <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full w-[20%] rounded-full"></div></div>
 </div>
 </div>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <h3 className="font-heading font-bold text-white text-sm flex items-center space-x-2">
 <Clock className="w-4 h-4 text-emerald-600" />
 <span>Most Used Room</span>
 </h3>
 <p className="text-sm text-slate-300">
 <span className="text-emerald-600 font-bold">{kpis?.mostUsedRoomName || 'Executive Boardroom Alpha'}</span>
 <span className="text-slate-400"> — Peak hours: {kpis?.peakReservationHours || '10:00 AM - 02:00 PM'}</span>
 </p>
 </div>
 </div>
 );
};
