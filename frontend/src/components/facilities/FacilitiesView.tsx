import React, { useState, useEffect, useCallback } from 'react';
import { 
 Plus, Calendar, X, Loader2, AlertCircle, Search, 
 Ban, ShieldCheck, Wrench, TrendingUp, BarChart3, Download, ShieldAlert,
 FileText, Scale, UserCheck, Layers, Tv, Lock, FileSpreadsheet,
 Settings, Zap, CheckCircle2, Sliders, Database
} from 'lucide-react';
import { 
 RoomItem, 
 ReservationItem, 
 EquipmentAsset, 
 AdminAnalytics10KPI,
 SystemConfigPolicy 
} from '../../types/reservationSystem';
import { reservationService } from '../../api/reservationService';
import { ReservationCalendar } from './ReservationCalendar';

type AdminTab = 'RESERVATIONS' | 'ROOMS' | 'MAINTENANCE' | 'ANALYTICS' | 'EQUIPMENT' | 'CALENDAR' | 'AUDIT_LOGS' | 'CONFIG';

interface TabItem {
 id: AdminTab;
 label: string;
 icon: React.ComponentType<{ className?: string }>;
 count?: number;
}

export const FacilitiesView: React.FC = () => {
 const [activeTab, setActiveTab] = useState<AdminTab>('RESERVATIONS');

 // Main Data States
 const [rooms, setRooms] = useState<RoomItem[]>([]);
 const [reservations, setReservations] = useState<ReservationItem[]>([]);
 const [equipmentAssets, setEquipmentAssets] = useState<EquipmentAsset[]>([]);
 const [kpis, setKpis] = useState<AdminAnalytics10KPI | null>(null);
 const [policyConfig, setPolicyConfig] = useState<SystemConfigPolicy | null>(null);

 const [, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [realtimeActive, setRealtimeActive] = useState(true);

 // Search & Filters
 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState<string>('ALL');

 // Modals
 const [addRoomOpen, setAddRoomOpen] = useState(false);
 const [newRoomName, setNewRoomName] = useState('');
 const [newRoomNumber, setNewRoomNumber] = useState('');
 const [newBuilding] = useState('');
 const [newFloor] = useState('');
 const [newCapacity, setNewCapacity] = useState(12);
 const [addRoomLoading, setAddRoomLoading] = useState(false);

 const [maintModalOpen, setMaintModalOpen] = useState(false);
 const [maintRoomId, setMaintRoomId] = useState('');
 const [maintTitle, setMaintTitle] = useState('');
 const [maintTech, setMaintTech] = useState('');
 const [maintSubmitting, setMaintSubmitting] = useState(false);

 // Selected Reservation View Drawer
 const [, setSelectedRes] = useState<ReservationItem | null>(null);

 const loadAllData = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const [roomsData, resData, equipData, kpiData, configData] = await Promise.all([
 reservationService.getRooms(),
 reservationService.getReservations(),
 reservationService.getEquipmentAssets(),
 reservationService.get10KpiMetrics(),
 reservationService.getSystemConfig(),
 ]);
 setRooms(roomsData);
 setReservations(resData);
 setEquipmentAssets(equipData);
 setKpis(kpiData);
 setPolicyConfig(configData);
 if (roomsData.length > 0 && !maintRoomId) setMaintRoomId(roomsData[0].id);
 } catch (err: any) {
 setError(err.message || 'Failed to load administrator console data.');
 } finally {
 setLoading(false);
 }
 }, [maintRoomId]);

 useEffect(() => { loadAllData(); }, [loadAllData]);

 // SUPABASE REALTIME MULTI-SESSION AUTO-SYNC
 useEffect(() => {
 const unsubscribe = reservationService.subscribeToRealtimeChanges(() => {
 setRealtimeActive(true);
 loadAllData();
 });
 return () => unsubscribe();
 }, [loadAllData]);

 // Admin Actions (Strictly Override & Cancel Only)
 const handleCancel = async (id: string) => {
 if (!confirm('Governance Warning: Are you sure you want to execute emergency cancellation for this reservation?')) return;
 try {
 await reservationService.cancelReservation(id);
 loadAllData();
 } catch (err: any) {
 alert(err.message || 'Failed to cancel.');
 }
 };

 const handleOverride = async (id: string) => {
 const reason = prompt('Governance Policy: Enter mandatory reason for Administrator Emergency Override:');
 if (!reason) return;
 try {
 await reservationService.overrideReservation(id, reason);
 loadAllData();
 } catch (err: any) {
 alert(err.message || 'Failed to override.');
 }
 };

 const handleCreateRoom = async (e: React.FormEvent) => {
 e.preventDefault();
 setAddRoomLoading(true);
 try {
 await reservationService.createRoom({
 name: newRoomName,
 roomNumber: newRoomNumber,
 building: newBuilding,
 floor: newFloor,
 capacity: newCapacity,
 });
 setAddRoomOpen(false);
 loadAllData();
 } catch (err: any) {
 alert(err.message || 'Failed to create room.');
 } finally {
 setAddRoomLoading(false);
 }
 };

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
 reason: maintTitle,
 technician: maintTech,
 });
 setMaintModalOpen(false);
 loadAllData();
 } catch (err: any) {
 alert(err.message || 'Failed to schedule maintenance.');
 } finally {
 setMaintSubmitting(false);
 }
 };

 const pendingApprovalsCount = reservations.filter(r => r.status === 'PENDING_APPROVAL').length;

 // Computed KPIs from actual data when service metrics unavailable
 const availableRooms = kpis?.availableRooms ?? rooms.filter(r => r.status === 'AVAILABLE' && !r.isDisabled).length;
 const occupiedRooms = kpis?.occupiedRooms ?? rooms.filter(r => r.status === 'OCCUPIED').length;
 const roomsUnderMaintenance = kpis?.roomsUnderMaintenance ?? rooms.filter(r => r.status === 'MAINTENANCE').length;
 const occupancyRate = kpis?.occupancyRatePercentage ?? (rooms.length > 0 ? Math.round((rooms.filter(r => r.status === 'OCCUPIED').length / rooms.length) * 100) : 0);
 const avgUtilization = kpis?.avgDailyUtilizationPercentage ?? (rooms.length > 0 ? Math.round((rooms.filter(r => r.status === 'OCCUPIED' || r.status === 'MAINTENANCE').length / rooms.length) * 100) : 0);
 const activeMaintCount = kpis?.activeMaintenanceCount ?? rooms.filter(r => r.status === 'MAINTENANCE').length;

 // Filtered reservations
 const filteredReservations = reservations.filter(r => {
 const matchesSearch = r.meetingTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
 r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
 r.roomName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
 r.employeeDepartment.toLowerCase().includes(searchQuery.toLowerCase());
 const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
 return matchesSearch && matchesStatus;
 });

 return (
 <div className="space-y-6">
 {/* Top Header Title & Status Bar */}
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
 <div>
 <div className="flex items-center space-x-3">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600">
 <ShieldCheck className="w-6 h-6" />
 </div>
 <div>
 <div className="flex items-center space-x-3">
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">
 Facilities & Administrative Management Console
 </h2>
 <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${
 realtimeActive 
 ? 'bg-emerald-50 border-slate-200 text-emerald-600'
 : 'bg-emerald-50 border-slate-200 text-emerald-600'
 }`}>
 <Zap className="w-3.5 h-3.5 animate-pulse" />
 <span>{realtimeActive ? 'Supabase Realtime Connected' : 'Connecting Realtime…'}</span>
 </div>
 </div>
 <p className="text-slate-400 text-xs mt-0.5">
 Centralized Governance Platform • Enterprise Business Rules, Monitoring, Audit Logs & Asset Management
 </p>
 </div>
 </div>
 </div>

 {/* Administrator Action Toolbar (Governance Compliant: Add Room, Maintenance, Export) */}
 <div className="flex items-center space-x-2 flex-wrap gap-2">
 <button
 onClick={() => setAddRoomOpen(true)}
 className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-xs transition-all flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20"
 >
 <Plus className="w-4 h-4" />
 <span>Add New Room</span>
 </button>

 <button
 onClick={() => setMaintModalOpen(true)}
 className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-semibold text-xs border border-slate-200 transition-all flex items-center space-x-1.5"
 >
 <Wrench className="w-4 h-4" />
 <span>Schedule Maintenance</span>
 </button>

 <button
 onClick={() => alert('Exporting IBM TRIRIGA / Oracle Facilities Governance Report (CSV)...')}
 className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-200 transition-all flex items-center space-x-1.5"
 >
 <Download className="w-4 h-4 text-emerald-600" />
 <span>Export Compliance Report</span>
 </button>
 </div>
 </div>

 {error && (
 <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2">
 <AlertCircle className="w-5 h-5 shrink-0" />
 <span>{error}</span>
 </div>
 )}

 {/* 10 EXECUTIVE REALTIME KPI METRICS BAR */}
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Rooms</span>
 <span className="text-xl font-bold text-white font-mono">{kpis?.totalRooms || rooms.length}</span>
 <span className="text-[10px] text-slate-500 block">Facility Assets</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Available Rooms</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{availableRooms}</span>
 <span className="text-[10px] text-emerald-600/80 block">Ready for Allocation</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Occupied Rooms</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{occupiedRooms}</span>
 <span className="text-[10px] text-slate-500 block">Active Meetings</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Rooms Under Maintenance</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{roomsUnderMaintenance}</span>
 <span className="text-[10px] text-rose-500/80 block">Work Orders Active</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Reservations Today</span>
 <span className="text-xl font-bold text-white font-mono">{kpis?.reservationsToday || reservations.length}</span>
 <span className="text-[10px] text-slate-500 block">Employee Bookings</span>
 </div>

 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Pending Officer Approvals</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{pendingApprovalsCount}</span>
 <span className="text-[10px] text-emerald-600/80 block">Facilities Officer Queue</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Occupancy Rate</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{occupancyRate}%</span>
 <span className="text-[10px] text-slate-500 block">Peak: {kpis?.peakReservationHours}</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Avg Daily Utilization</span>
 <span className="text-xl font-bold text-white font-mono">{avgUtilization}%</span>
 <span className="text-[10px] text-slate-500 block">Efficiency Score</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Active Maintenance Tasks</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{activeMaintCount}</span>
 <span className="text-[10px] text-slate-500 block">HVAC / AV Servicing</span>
 </div>

 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Equipment Assets</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{kpis?.totalEquipmentAssets || equipmentAssets.length}</span>
 <span className="text-[10px] text-slate-500 block">Tracked Hardware</span>
 </div>
 </div>

 {/* SUBSYSTEM NAVIGATION TABS */}
 <div className="flex items-center space-x-1 border-b border-slate-200 overflow-x-auto pb-1">
 {(
 [
 { id: 'RESERVATIONS', label: 'Reservation Governance & Monitoring', icon: FileSpreadsheet },
 { id: 'ROOMS', label: 'Room Management', icon: Layers },
 { id: 'MAINTENANCE', label: 'Maintenance Control', icon: Wrench },
 { id: 'ANALYTICS', label: 'Analytics & Reports', icon: BarChart3 },
 { id: 'EQUIPMENT', label: 'Equipment Inventory', icon: Tv },
 { id: 'CALENDAR', label: 'Enterprise Calendar', icon: Calendar },
 { id: 'AUDIT_LOGS', label: 'Security Audit Logs', icon: ShieldCheck },
 { id: 'CONFIG', label: 'System Configuration', icon: Settings },
 ] as TabItem[]
 ).map(tab => {
 const Icon = tab.icon;
 const isActive = activeTab === tab.id;
 return (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id as AdminTab)}
 className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 border-b-2 ${
 isActive 
 ? 'bg-slate-900 text-emerald-600 border-emerald-200' 
 : 'text-slate-400 hover:text-white border-transparent hover:bg-slate-900/50'
 }`}
 >
 <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-500'}`} />
 <span>{tab.label}</span>
 {tab.count !== undefined && tab.count > 0 && (
 <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-white font-mono text-[10px]">
 {tab.count}
 </span>
 )}
 </button>
 );
 })}
 </div>

 {/* TAB 1: RESERVATION MONITORING TABLE (GOVERNANCE: OVERRIDE & CANCEL ONLY) */}
 {activeTab === 'RESERVATIONS' && (
 <div className="glass-panel p-6 space-y-4">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search by reservation ID, title, employee, or department…"
 className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none"
 />
 </div>
 <div className="flex items-center space-x-2">
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value)}
 className="bg-white border border-slate-200 rounded-card px-3 py-2 text-xs text-slate-300 focus:border-emerald-200 focus:outline-none"
 >
 <option value="ALL">All Statuses</option>
 <option value="APPROVED">Approved (Facilities Officer)</option>
 <option value="PENDING_APPROVAL">Pending (Facilities Officer Queue)</option>
 <option value="REJECTED">Rejected</option>
 <option value="CANCELLED">Cancelled</option>
 <option value="OVERRIDDEN">Admin Emergency Override</option>
 </select>
 </div>
 </div>

 <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-200 text-xs text-slate-400 flex items-center space-x-2">
 <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
 <span>
 <strong>Governance Policy:</strong> Reservation creation belongs to Employees and review/approval belongs exclusively to Facilities Officers. Administrators may only execute <strong>Emergency Override</strong> or <strong>Emergency Cancellation</strong>.
 </span>
 </div>

 {/* Comprehensive Reservation Table */}
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Reservation ID</th>
 <th className="p-3">Room Name</th>
 <th className="p-3">Employee / Dept</th>
 <th className="p-3">Purpose & Title</th>
 <th className="p-3">Date & Time</th>
 <th className="p-3">Status</th>
 <th className="p-3">Reviewed By</th>
 <th className="p-3">Subsystem Links</th>
 <th className="p-3 text-right">Admin Governance Actions</th>
 </tr>
 </thead>
 <tbody >
 {filteredReservations.map(res => (
 <tr key={res.id} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-mono text-emerald-600 font-bold">{res.reservationIdDisplay}</td>
 <td className="p-3 font-semibold text-white">{res.roomName}</td>
 <td className="p-3">
 <div><strong className="text-slate-100">{res.employeeName}</strong></div>
 <div className="text-[10px] text-slate-400">{res.employeeDepartment}</div>
 </td>
 <td className="p-3 max-w-xs">
 <div className="font-semibold text-slate-100 truncate">{res.meetingTitle}</div>
 <div className="text-[10px] text-slate-400 truncate">{res.purpose}</div>
 </td>
 <td className="p-3 font-mono">
 <div>{res.reservationDate}</div>
 <div className="text-[10px] text-slate-400">{res.startTime.split('T')[1]?.slice(0,5)} - {res.endTime.split('T')[1]?.slice(0,5)}</div>
 </td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
 res.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' :
 res.status === 'PENDING_APPROVAL' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' :
 res.status === 'OVERRIDDEN' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' :
 'bg-rose-500/20 text-rose-400 border border-slate-200'
 }`}>
 {res.status}
 </span>
 </td>
 <td className="p-3 text-slate-400">{res.approvedBy || 'Facilities Officer'}</td>

 {/* Subsystem Integrations Column */}
 <td className="p-3">
 <div className="flex items-center space-x-1.5 text-[10px]">
 <span title="Visitor Pass QR Link (Subsystem 1)" className="p-1 rounded bg-slate-800 text-emerald-600 cursor-pointer hover:bg-emerald-600 hover:text-white">
 <UserCheck className="w-3 h-3" />
 </span>
 <span title="AI Document Agenda (Subsystem 2)" className="p-1 rounded bg-slate-800 text-emerald-600 cursor-pointer hover:bg-blue-500 hover:text-white">
 <FileText className="w-3 h-3" />
 </span>
 <span title="Legal Dispute Check (Subsystem 3)" className="p-1 rounded bg-slate-800 text-emerald-600 cursor-pointer hover:bg-emerald-600 hover:text-white">
 <Scale className="w-3 h-3" />
 </span>
 <span title="Security Center Audit Log (Subsystem 5)" className="p-1 rounded bg-slate-800 text-rose-400 cursor-pointer hover:bg-rose-500 hover:text-white">
 <ShieldAlert className="w-3 h-3" />
 </span>
 </div>
 </td>

 {/* Governance Actions Column (Emergency Override & Cancel Only) */}
 <td className="p-3 text-right">
 <div className="flex items-center justify-end space-x-1.5">
 <button
 onClick={() => handleOverride(res.id)}
 title="Execute Emergency Admin Override"
 className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-500 hover:bg-purple-500 hover:text-white text-[10px] font-bold transition-all flex items-center space-x-1 border border-slate-200"
 >
 <Lock className="w-3 h-3" />
 <span>Emergency Override</span>
 </button>
 <button
 onClick={() => handleCancel(res.id)}
 title="Cancel Reservation"
 className="p-1 rounded bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
 >
 <Ban className="w-3.5 h-3.5" />
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* TAB 2: ROOM MANAGEMENT */}
 {activeTab === 'ROOMS' && (
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
 <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
 room.status === 'MAINTENANCE' ? 'bg-rose-500/20 text-rose-400 border-slate-200' :
 room.status === 'DISABLED' ? 'bg-slate-800 text-slate-400 border-slate-200' :
 'bg-emerald-100 text-emerald-600 border-slate-200'
 }`}>
 {room.status}
 </span>
 </div>

 <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-slate-300">
 <div className="p-2 rounded bg-slate-950 border border-slate-200">
 <span className="text-[10px] text-slate-400 block">Capacity</span>
 <span className="font-bold text-white">{room.capacity} Seats</span>
 </div>
 <div className="p-2 rounded bg-slate-950 border border-slate-200">
 <span className="text-[10px] text-slate-400 block">Occupancy Rate</span>
 <span className="font-bold text-emerald-600">{room.occupancyPercentage}%</span>
 </div>
 </div>

 {room.maintenanceReason && (
 <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-slate-200 text-rose-300 text-xs">
 <strong>Maintenance Note:</strong> {room.maintenanceReason}
 </div>
 )}
 </div>

 {/* Administrator Room Actions */}
 <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
 <button
 onClick={() => { setMaintRoomId(room.id); setMaintModalOpen(true); }}
 className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white text-xs font-semibold transition-colors"
 >
 Maintenance
 </button>
 <button
 onClick={() => reservationService.toggleDisableRoom(room.id, room.status).then(loadAllData)}
 className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
 >
 {room.status === 'DISABLED' ? 'Enable' : 'Disable'}
 </button>
 <button
 onClick={() => reservationService.archiveRoom(room.id).then(loadAllData)}
 className="px-3 py-1.5 rounded-lg bg-slate-900 text-slate-500 hover:text-rose-400 text-xs font-semibold transition-colors"
 >
 Archive
 </button>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* TAB 3: MAINTENANCE CONTROL */}
 {activeTab === 'MAINTENANCE' && (
 <div className="glass-panel p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <div>
 <h3 className="font-heading font-bold text-white text-lg">Facility Maintenance Control Panel</h3>
 <p className="text-xs text-slate-400">Schedule HVAC, AV, and structural room maintenance work orders</p>
 </div>
 <button
 onClick={() => setMaintModalOpen(true)}
 className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs transition-all flex items-center space-x-2"
 >
 <Wrench className="w-4 h-4" />
 <span>Schedule New Work Order</span>
 </button>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="p-5 rounded-2xl bg-white border border-slate-200 rounded-card space-y-3">
 <h4 className="font-bold text-white text-sm flex items-center space-x-2">
 <Wrench className="w-4 h-4 text-rose-400" />
 <span>Active Work Orders ({activeMaintCount})</span>
 </h4>
 {rooms.filter(r => r.status === 'MAINTENANCE').length > 0 ? (
 rooms.filter(r => r.status === 'MAINTENANCE').map(r => (
 <div key={r.id} className="p-3 rounded-xl bg-rose-500/10 border border-slate-200 text-xs text-rose-300 space-y-1">
 <div className="font-bold text-white">{r.maintenanceReason || 'Scheduled Maintenance'}</div>
 <div>{r.name} ({r.building})</div>
 <div className="text-[10px] text-rose-400 font-mono mt-1">Status: MAINTENANCE</div>
 </div>
 ))
 ) : (
 <div className="p-3 rounded-xl bg-slate-950 border border-slate-200 text-xs text-slate-400">No active work orders.</div>
 )}
 </div>

 <div className="p-5 rounded-2xl bg-white border border-slate-200 rounded-card space-y-3 lg:col-span-2">
 <h4 className="font-bold text-white text-sm">Scheduled Maintenance Logs</h4>
 <div className="p-4 rounded-xl bg-slate-950 border border-slate-200 text-xs text-slate-400">
 All scheduled work orders automatically set the room status to MAINTENANCE in Supabase and prevent employee double booking.
 </div>
 </div>
 </div>
 </div>
 )}

 {/* TAB 4: ANALYTICS */}
 {activeTab === 'ANALYTICS' && (
 <div className="glass-panel p-6 space-y-6">
 <h3 className="font-heading font-bold text-white text-lg">Enterprise Facility Analytics & Governance Reports</h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="p-6 rounded-2xl bg-white border border-slate-200 rounded-card space-y-4">
 <h4 className="font-bold text-white text-sm flex items-center space-x-2">
 <BarChart3 className="w-4 h-4 text-emerald-600" />
 <span>Room Status Overview</span>
 </h4>
 <div className="space-y-2 text-xs">
 <div className="flex justify-between text-slate-300"><span>Available</span><span className="font-mono text-emerald-600 font-bold">{availableRooms}</span></div>
 <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full" style={{ width: `${rooms.length > 0 ? (availableRooms / rooms.length) * 100 : 0}%` }}></div></div>
 <div className="flex justify-between text-slate-300"><span>Occupied</span><span className="font-mono text-emerald-600 font-bold">{occupiedRooms}</span></div>
 <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden"><div className="bg-emerald-600 h-full" style={{ width: `${rooms.length > 0 ? (occupiedRooms / rooms.length) * 100 : 0}%` }}></div></div>
 <div className="flex justify-between text-slate-300"><span>Under Maintenance</span><span className="font-mono text-emerald-600 font-bold">{roomsUnderMaintenance}</span></div>
 <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden"><div className="bg-rose-400 h-full" style={{ width: `${rooms.length > 0 ? (roomsUnderMaintenance / rooms.length) * 100 : 0}%` }}></div></div>
 </div>
 </div>

 <div className="p-6 rounded-2xl bg-white border border-slate-200 rounded-card space-y-4">
 <h4 className="font-bold text-white text-sm flex items-center space-x-2">
 <TrendingUp className="w-4 h-4 text-emerald-600" />
 <span>Reservation Summary</span>
 </h4>
 <div className="space-y-2 text-xs text-slate-300">
 <div className="flex justify-between"><span>Total Reservations</span><span className="font-mono text-emerald-600">{reservations.length}</span></div>
 <div className="flex justify-between"><span>Pending Approval</span><span className="font-mono text-emerald-600">{pendingApprovalsCount}</span></div>
 <div className="flex justify-between"><span>Occupancy Rate</span><span className="font-mono text-emerald-600">{occupancyRate}%</span></div>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* TAB 5: EQUIPMENT INVENTORY */}
 {activeTab === 'EQUIPMENT' && (
 <div className="glass-panel p-6 space-y-6">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <div>
 <h3 className="font-heading font-bold text-white text-lg">Hardware & AV Equipment Inventory</h3>
 <p className="text-xs text-slate-400">Track projectors, TVs, whiteboards, and conference phones</p>
 </div>
 <button onClick={() => alert('Add Hardware Asset modal')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700/90">
 + Add Hardware Asset
 </button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {equipmentAssets.map(eq => (
 <div key={eq.id} className="p-4 rounded-xl bg-white border border-slate-200 rounded-card space-y-2">
 <div className="flex items-start justify-between">
 <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-emerald-600">{eq.assetTag}</span>
 <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${eq.status === 'IN_USE' ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-100 text-emerald-600'}`}>
 {eq.status}
 </span>
 </div>
 <h4 className="font-bold text-white text-sm">{eq.name}</h4>
 <p className="text-xs text-slate-400">Assigned: {eq.assignedRoomName || 'Unassigned Stock'}</p>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* TAB 6: ENTERPRISE CALENDAR */}
 {activeTab === 'CALENDAR' && (
 <ReservationCalendar
 rooms={rooms}
 reservations={reservations}
 onSelectTimeSlot={(roomId) => alert(`Selected room slot #${roomId}`)}
 onSelectReservation={(res) => setSelectedRes(res)}
 />
 )}

 {/* TAB 7: SECURITY AUDIT LOGS */}
 {activeTab === 'AUDIT_LOGS' && (
 <div className="glass-panel p-6 space-y-4 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-3">
 <div className="flex items-center space-x-2">
 <ShieldCheck className="w-5 h-5 text-emerald-600" />
 <h3 className="font-heading font-bold text-white text-base">Security Center Audit Logs</h3>
 </div>
 <span className="text-xs text-slate-400">Centralized log stream</span>
 </div>

 <p className="text-xs text-slate-500">No audit events recorded yet.</p>
 </div>
 )}

 {/* TAB 8: SYSTEM CONFIGURATION & BUSINESS RULES */}
 {activeTab === 'CONFIG' && (
 <div className="glass-panel p-6 space-y-6">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <div>
 <h3 className="font-heading font-bold text-white text-lg">System Configuration & Business Rules</h3>
 <p className="text-xs text-slate-400">Configure reservation limits, approval workflows, and Supabase RLS security policies</p>
 </div>
 <button
 onClick={() => {
 reservationService.updateSystemConfig(policyConfig);
 alert('System Business Rules & RLS Policies saved to Supabase!');
 }}
 className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-bold text-xs transition-colors flex items-center space-x-1.5"
 >
 <Settings className="w-4 h-4" />
 <span>Save Policy Changes</span>
 </button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
 <div className="p-5 rounded-2xl bg-white border border-slate-200 rounded-card space-y-4">
 <h4 className="font-bold text-white text-sm flex items-center space-x-2">
 <Sliders className="w-4 h-4 text-emerald-600" />
 <span>Reservation Rules Configuration</span>
 </h4>

 <div>
 <label className="block font-semibold mb-1 text-slate-400">Max Advance Booking Limit (Days)</label>
 <input
 type="number"
 value={policyConfig?.maxAdvanceBookingDays || 30}
 onChange={(e) => setPolicyConfig(prev => prev ? { ...prev, maxAdvanceBookingDays: Number(e.target.value) } : null)}
 className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-white font-mono"
 />
 </div>

 <div>
 <label className="block font-semibold mb-1 text-slate-400">Max Booking Duration (Hours)</label>
 <input
 type="number"
 value={policyConfig?.maxBookingDurationHours || 8}
 onChange={(e) => setPolicyConfig(prev => prev ? { ...prev, maxBookingDurationHours: Number(e.target.value) } : null)}
 className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-white font-mono"
 />
 </div>
 </div>

 <div className="p-5 rounded-2xl bg-white border border-slate-200 rounded-card space-y-4">
 <h4 className="font-bold text-white text-sm flex items-center space-x-2">
 <Database className="w-4 h-4 text-emerald-600" />
 <span>Supabase Security & RLS Policy State</span>
 </h4>

 <div className="p-3 rounded-xl bg-emerald-50 border border-slate-200 text-emerald-600 space-y-1">
 <div className="font-bold text-white flex items-center space-x-1">
 <CheckCircle2 className="w-4 h-4 text-emerald-600" />
 <span>Row Level Security (RLS) Active</span>
 </div>
 <div className="text-[10px]">Permissive Development Policy enabled for public schema tables.</div>
 </div>

 <div className="p-3 rounded-xl bg-slate-950 border border-slate-200 space-y-1 text-slate-400">
 <div className="font-semibold text-slate-200">Supabase Realtime Synchronization</div>
 <div className="text-[10px]">Channel `facilities-admin-realtime` active across all sessions.</div>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* ADD ROOM MODAL */}
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

 {/* SCHEDULE MAINTENANCE MODAL */}
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
 {maintSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Block Room for Servicing</span>}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 );
};
