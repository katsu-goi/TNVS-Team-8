import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Tv, Plus, Monitor, Wifi, Headphones } from 'lucide-react';
import { FacilitiesContext } from './FacilitiesLayout';

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
 Projector: Monitor,
 TV: Tv,
 Whiteboard: Monitor,
 'Video Conference': Wifi,
 Audio: Headphones,
};

export const EquipmentInventory: React.FC = () => {
 const { equipmentAssets, kpis } = useOutletContext<FacilitiesContext>();

 const inUse = equipmentAssets.filter(e => e.status === 'IN_USE').length;
 const available = equipmentAssets.filter(e => e.status === 'AVAILABLE').length;
 const underRepair = equipmentAssets.filter(e => e.status === 'UNDER_REPAIR').length;

 return (
 <div className="space-y-6">
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
 <div className="flex items-center space-x-3">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-indigo-500/30 text-emerald-600">
 <Tv className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Equipment Inventory</h2>
 <p className="text-slate-400 text-xs mt-0.5">Hardware & AV Asset Tracking • Lifecycle Management</p>
 </div>
 </div>
 <button onClick={() => alert('Add Hardware Asset modal')}
 className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-xs transition-all flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20">
 <Plus className="w-4 h-4" />
 <span>Add Hardware Asset</span>
 </button>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Assets</span>
 <span className="text-xl font-bold text-white font-mono">{kpis?.totalEquipmentAssets || equipmentAssets.length}</span>
 <span className="text-[10px] text-slate-500 block">All Equipment</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">In Use</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{inUse}</span>
 <span className="text-[10px] text-emerald-600/80 block">Deployed</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Available</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{available}</span>
 <span className="text-[10px] text-slate-500 block">Ready for Assignment</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Under Repair</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{underRepair}</span>
 <span className="text-[10px] text-emerald-600/80 block">Servicing</span>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {equipmentAssets.map(eq => {
 const Icon = categoryIcons[eq.category] || Monitor;
 return (
 <div key={eq.id} className="p-4 rounded-xl bg-white border border-slate-200 rounded-card space-y-2 hover:border-slate-200 transition-all">
 <div className="flex items-start justify-between">
 <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-emerald-600 border border-slate-200">{eq.assetTag}</span>
 <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${eq.status === 'IN_USE' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : eq.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-emerald-100 text-emerald-600 border border-slate-200'}`}>
 {eq.status}
 </span>
 </div>
 <div className="flex items-center space-x-2">
 <Icon className="w-4 h-4 text-slate-400" />
 <h4 className="font-bold text-white text-sm">{eq.name}</h4>
 </div>
 <p className="text-xs text-slate-400 flex items-center space-x-1">
 <span className="text-slate-500">Assigned:</span>
 <span>{eq.assignedRoomName || 'Unassigned Stock'}</span>
 </p>
 </div>
 );
 })}
 </div>
 </div>
 );
};
