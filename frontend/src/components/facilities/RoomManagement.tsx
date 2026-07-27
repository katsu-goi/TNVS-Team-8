import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, X, Loader2, Layers, Users } from 'lucide-react';
import { reservationService } from '../../api/reservationService';
import { FacilitiesContext } from './FacilitiesLayout';

export const RoomManagement: React.FC = () => {
 const { rooms, kpis, reload } = useOutletContext<FacilitiesContext>();
 const [addRoomOpen, setAddRoomOpen] = useState(false);
 const [newRoomName, setNewRoomName] = useState('');
 const [newRoomNumber, setNewRoomNumber] = useState('');
 const [newBuilding] = useState('');
 const [newFloor] = useState('');
 const [newCapacity, setNewCapacity] = useState(12);
 const [addRoomLoading, setAddRoomLoading] = useState(false);

 const totalRooms = rooms.length;
 const availableRooms = rooms.filter(r => r.status === 'AVAILABLE').length;
 const occupiedRooms = rooms.filter(r => r.status === 'OCCUPIED').length;
 const maintenanceRooms = rooms.filter(r => r.status === 'MAINTENANCE').length;

 const handleCreateRoom = async (e: React.FormEvent) => {
 e.preventDefault();
 setAddRoomLoading(true);
 try {
 await reservationService.createRoom({ name: newRoomName, roomNumber: newRoomNumber, building: newBuilding, floor: newFloor, capacity: newCapacity });
 setAddRoomOpen(false);
 setNewRoomName('');
 setNewRoomNumber('');
 reload();
 } catch { } finally { setAddRoomLoading(false); }
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
 <div className="flex items-center space-x-3">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600">
 <Layers className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Room Management</h2>
 <p className="text-slate-400 text-xs mt-0.5">Corporate Room Inventory • Allocation & Status Monitoring</p>
 </div>
 </div>
 <button onClick={() => setAddRoomOpen(true)}
 className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-xs transition-all flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20">
 <Plus className="w-4 h-4" />
 <span>Add Room</span>
 </button>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Rooms</span>
 <span className="text-xl font-bold text-white font-mono">{totalRooms || kpis?.totalRooms || 0}</span>
 <span className="text-[10px] text-slate-500 block">Facility Assets</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Available</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{availableRooms}</span>
 <span className="text-[10px] text-emerald-600/80 block">Ready for Allocation</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Occupied</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{occupiedRooms}</span>
 <span className="text-[10px] text-slate-500 block">Active Meetings</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Under Maintenance</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{maintenanceRooms}</span>
 <span className="text-[10px] text-rose-500/80 block">Work Orders Active</span>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 {rooms.map(room => (
 <div key={room.id} className="glass-card p-6 flex flex-col justify-between space-y-4 border-slate-200">
 <div>
 <div className="flex items-start justify-between">
 <div>
 <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">Room #{room.roomNumber}</span>
 <h3 className="font-heading font-bold text-white text-lg mt-1">{room.name}</h3>
 <p className="text-xs text-slate-400">{room.building} • {room.floor}</p>
 </div>
 <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${room.status === 'MAINTENANCE' ? 'bg-rose-500/20 text-rose-400 border-slate-200' : room.status === 'DISABLED' ? 'bg-slate-800 text-slate-400 border-slate-200' : 'bg-emerald-100 text-emerald-600 border-slate-200'}`}>
 {room.status}
 </span>
 </div>
 <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-slate-300">
 <div className="p-2 rounded bg-slate-950 border border-slate-200">
 <span className="text-[10px] text-slate-400 block">Capacity</span>
 <span className="font-bold text-white"><Users className="w-3 h-3 inline-block mr-1 text-emerald-600" />{room.capacity} Seats</span>
 </div>
 <div className="p-2 rounded bg-slate-950 border border-slate-200">
 <span className="text-[10px] text-slate-400 block">Occupancy</span>
 <span className="font-bold text-emerald-600">{room.occupancyPercentage || 0}%</span>
 </div>
 </div>
 {room.maintenanceReason && (
 <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-slate-200 text-rose-300 text-xs">
 <strong>Maintenance Note:</strong> {room.maintenanceReason}
 </div>
 )}
 </div>
 <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
 <button onClick={() => reservationService.toggleDisableRoom(room.id, room.status).then(reload)}
 className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors">
 {room.status === 'DISABLED' ? 'Enable' : 'Disable'}
 </button>
 <button onClick={() => reservationService.archiveRoom(room.id).then(reload)}
 className="px-3 py-1.5 rounded-lg bg-slate-900 text-slate-500 hover:text-rose-400 text-xs font-semibold transition-colors">
 Archive
 </button>
 </div>
 </div>
 ))}
 </div>

 {addRoomOpen && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-lg text-white">Add New Corporate Room</h3>
 <button onClick={() => setAddRoomOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
 </div>
 <form onSubmit={handleCreateRoom} className="space-y-4">
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Room Name *</label>
 <input required type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="e.g. Executive Boardroom Alpha" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Room Number *</label>
 <input required type="text" value={newRoomNumber} onChange={(e) => setNewRoomNumber(e.target.value)} placeholder="101" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Capacity</label>
 <input required type="number" min={1} value={newCapacity} onChange={(e) => setNewCapacity(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 </div>
 <div className="pt-4 flex justify-end space-x-3">
 <button type="button" onClick={() => setAddRoomOpen(false)} className="px-4 py-2 rounded-xl text-slate-400 text-xs font-semibold hover:text-white">Cancel</button>
 <button type="submit" disabled={addRoomLoading} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90 disabled:opacity-50 flex items-center space-x-2">
 {addRoomLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Save Room to Supabase</span>}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 );
};
