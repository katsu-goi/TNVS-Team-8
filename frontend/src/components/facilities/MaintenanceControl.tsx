import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Wrench, X, Loader2, Clock } from 'lucide-react';
import { reservationService } from '../../api/reservationService';
import { FacilitiesContext } from './FacilitiesLayout';

export const MaintenanceControl: React.FC = () => {
 const { rooms, kpis, reload } = useOutletContext<FacilitiesContext>();

 const [maintModalOpen, setMaintModalOpen] = useState(false);
 const [maintRoomId, setMaintRoomId] = useState(rooms[0]?.id || '');
 const [maintTitle, setMaintTitle] = useState('');
 const [maintTech, setMaintTech] = useState('');
 const [maintSubmitting, setMaintSubmitting] = useState(false);

 const activeTasks = kpis?.activeMaintenanceCount || 0;
 const maintenanceRooms = rooms.filter(r => r.status === 'MAINTENANCE');
 const availableRooms = rooms.filter(r => r.status === 'AVAILABLE').length;

 const handleScheduleMaint = async (e: React.FormEvent) => {
 e.preventDefault();
 setMaintSubmitting(true);
 try {
 await reservationService.scheduleMaintenance({
 roomId: maintRoomId,
 title: maintTitle,
 type: 'SCHEDULED',
 startTime: new Date().toISOString(),
 endTime: new Date(Date.now() + 86400000).toISOString(),
 reason: 'HVAC & 4K AV Hardware Servicing',
 technician: maintTech,
 });
 setMaintModalOpen(false);
 reload();
 } catch { } finally { setMaintSubmitting(false); }
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
 <div className="flex items-center space-x-3">
 <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-slate-200 text-rose-400">
 <Wrench className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Maintenance Control</h2>
 <p className="text-slate-400 text-xs mt-0.5">Facility Work Orders • HVAC, AV & Structural Servicing</p>
 </div>
 </div>
 <button onClick={() => { setMaintRoomId(rooms[0]?.id || ''); setMaintModalOpen(true); }}
 className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold text-xs transition-all flex items-center space-x-1.5 shadow-lg shadow-rose-500/20">
 <Wrench className="w-4 h-4" />
 <span>Schedule Maintenance</span>
 </button>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Active Work Orders</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{activeTasks}</span>
 <span className="text-[10px] text-rose-500/80 block">In Progress</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Rooms in Maintenance</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{maintenanceRooms.length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Out of Service</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Available Rooms</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{availableRooms}</span>
 <span className="text-[10px] text-emerald-600/80 block">Operational</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Room Assets</span>
 <span className="text-xl font-bold text-white font-mono">{rooms.length}</span>
 <span className="text-[10px] text-slate-500 block">Enterprise-wide</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-white text-lg">Facility Work Orders</h3>
 <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-slate-200 text-xs font-mono">{activeTasks} Active</span>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="p-5 rounded-2xl bg-white border border-slate-200 rounded-card space-y-3">
 <h4 className="font-bold text-white text-sm flex items-center space-x-2">
 <Wrench className="w-4 h-4 text-rose-400" />
 <span>Active Work Orders</span>
 </h4>
 <div className="p-3 rounded-xl bg-rose-500/10 border border-slate-200 text-xs text-rose-300 space-y-1">
 <div className="font-bold text-white">4K Projector Lens Calibration</div>
 <div>Grand Training Auditorium</div>
 <div>Technician: Engr. Alex Rivera</div>
 <div className="text-[10px] text-rose-400 font-mono mt-1 flex items-center space-x-1">
 <Clock className="w-3 h-3" />
 <span>Status: IN_PROGRESS</span>
 </div>
 </div>
 {maintenanceRooms.slice(1).map(room => (
 <div key={room.id} className="p-3 rounded-xl bg-emerald-50 border border-slate-200 text-xs text-emerald-500 space-y-1">
 <div className="font-bold text-white">{room.name}</div>
 <div className="text-[10px]">{room.maintenanceReason || 'Scheduled servicing'}</div>
 </div>
 ))}
 </div>

 <div className="p-5 rounded-2xl bg-white border border-slate-200 rounded-card space-y-3 lg:col-span-2">
 <h4 className="font-bold text-white text-sm">Scheduled Maintenance Logs</h4>
 <div className="p-4 rounded-xl bg-slate-950 border border-slate-200 text-xs text-slate-400">
 All scheduled work orders automatically set the room status to MAINTENANCE in Supabase and prevent employee double booking.
 </div>
 <div className="space-y-2 text-xs font-mono">
 <div className="p-3 rounded-xl bg-slate-950 border border-slate-200 flex justify-between items-center">
 <span className="text-rose-400">HVAC Filter Replacement — Room 301 (Engineering Wing)</span>
 <span className="text-slate-500 text-[10px]">SCHEDULED</span>
 </div>
 <div className="p-3 rounded-xl bg-slate-950 border border-slate-200 flex justify-between items-center">
 <span className="text-emerald-600">Network Rack Cooling Servicing — Server Room B</span>
 <span className="text-slate-500 text-[10px]">COMPLETED</span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {maintModalOpen && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <div className="flex items-center space-x-2">
 <Wrench className="w-5 h-5 text-rose-400" />
 <h3 className="font-heading font-bold text-lg text-white">Schedule Room Maintenance</h3>
 </div>
 <button onClick={() => setMaintModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
 </div>
 <form onSubmit={handleScheduleMaint} className="space-y-4">
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Target Room *</label>
 <select value={maintRoomId} onChange={(e) => setMaintRoomId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-rose-500 focus:outline-none">
 {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.building})</option>)}
 </select>
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Work Order Title *</label>
 <input required type="text" value={maintTitle} onChange={(e) => setMaintTitle(e.target.value)} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-rose-500 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Assigned Technician</label>
 <input required type="text" value={maintTech} onChange={(e) => setMaintTech(e.target.value)} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-rose-500 focus:outline-none" />
 </div>
 <div className="pt-4 flex justify-end space-x-3">
 <button type="button" onClick={() => setMaintModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400 text-xs font-semibold hover:text-white">Cancel</button>
 <button type="submit" disabled={maintSubmitting} className="px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold text-xs hover:bg-rose-400 disabled:opacity-50">
 {maintSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Schedule Work Order</span>}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 );
};
