import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
 Search, ShieldCheck, Lock, Ban, Clock, AlertTriangle
} from 'lucide-react';
import { reservationService } from '../../api/reservationService';
import { FacilitiesContext } from './FacilitiesLayout';

export const ReservationGovernance: React.FC = () => {
 const { reservations, kpis, reload, realtimeActive, userRole } = useOutletContext<FacilitiesContext>();
 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState<string>('ALL');

 const isAdmin = userRole === 'ROLE_ADMIN';

 const pendingApprovalsCount = reservations.filter(r => r.status === 'PENDING_APPROVAL').length;
 const approvedCount = reservations.filter(r => r.status === 'APPROVED').length;
 const overriddenCount = reservations.filter(r => r.status === 'OVERRIDDEN').length;

 const handleCancel = async (id: string) => {
 if (!confirm('Governance Warning: Are you sure you want to execute emergency cancellation for this reservation?')) return;
 try { await reservationService.cancelReservation(id); reload(); } catch { }
 };

 const handleOverride = async (id: string) => {
 const reason = prompt('Governance Policy: Enter mandatory reason for Administrator Emergency Override:');
 if (!reason) return;
 try { await reservationService.overrideReservation(id, reason); reload(); } catch { }
 };

 const handleForceRelease = async (id: string) => {
 if (!confirm('Force Release Room: This will immediately vacate the room and cancel this reservation. Continue?')) return;
 try { await reservationService.cancelReservation(id); reload(); } catch { }
 };

 const filteredReservations = reservations.filter(r => {
 const q = searchQuery.toLowerCase();
 const matchesSearch = r.meetingTitle.toLowerCase().includes(q) ||
 r.employeeName.toLowerCase().includes(q) ||
 r.roomName?.toLowerCase().includes(q) ||
 r.employeeDepartment.toLowerCase().includes(q) ||
 (r.reservationIdDisplay || '').toLowerCase().includes(q);
 const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
 return matchesSearch && matchesStatus;
 });

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600">
 <ShieldCheck className="w-6 h-6" />
 </div>
 <div>
 <div className="flex items-center space-x-3">
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Reservation Governance</h2>
 <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${realtimeActive ? 'bg-emerald-50 border-slate-200 text-emerald-600' : 'bg-emerald-50 border-slate-200 text-emerald-600'}`}>
 <Clock className="w-3.5 h-3.5 animate-pulse" />
 <span>{realtimeActive ? 'Supabase Realtime Connected' : 'Connecting…'}</span>
 </div>
 </div>
 <p className="text-slate-400 text-xs mt-0.5">Enterprise Reservation Oversight • Governance & Compliance Monitoring</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Reservations Today</span>
 <span className="text-xl font-bold text-white font-mono">{kpis?.reservationsToday || reservations.length}</span>
 <span className="text-[10px] text-slate-500 block">Active Bookings</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Pending Officer Approval</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{pendingApprovalsCount}</span>
 <span className="text-[10px] text-emerald-600/80 block">Facilities Officer Queue</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Approved Reservations</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{approvedCount}</span>
 <span className="text-[10px] text-emerald-600/80 block">Confirmed Bookings</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Admin Emergency Overrides</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{overriddenCount}</span>
 <span className="text-[10px] text-emerald-600/80 block">Audit Trail Active</span>
 </div>
 </div>

 <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-200 text-xs text-slate-400 flex items-center space-x-2">
 <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
 <span>
 <strong>Governance Policy:</strong> Reservation creation belongs to <strong>Employees</strong> and review/approval belongs exclusively to <strong>Facilities Officers</strong>. System Administrators may only execute <strong>Emergency Override</strong>, <strong>Emergency Cancellation</strong>, <strong>Force Release Room</strong>, and <strong>Audit Review</strong>.
 </span>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search by title, employee, room, or department…"
 className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
 className="bg-white border border-slate-200 rounded-card px-3 py-2 text-xs text-slate-300 focus:border-emerald-200 focus:outline-none">
 <option value="ALL">All Statuses</option>
 <option value="APPROVED">Approved</option>
 <option value="PENDING_APPROVAL">Pending (Officer Queue)</option>
 <option value="REJECTED">Rejected</option>
 <option value="CANCELLED">Cancelled</option>
 <option value="OVERRIDDEN">Emergency Override</option>
 </select>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Reservation ID</th>
 <th className="p-3">Room</th>
 <th className="p-3">Employee / Dept</th>
 <th className="p-3">Purpose</th>
 <th className="p-3">Date & Time</th>
 <th className="p-3">Status</th>
 <th className="p-3">Reviewed By</th>
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
 <div className="text-[10px] text-slate-400">{res.startTime.split('T')[1]?.slice(0, 5) || res.startTime} - {res.endTime.split('T')[1]?.slice(0, 5) || res.endTime}</div>
 </td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${res.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : res.status === 'PENDING_APPROVAL' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : res.status === 'OVERRIDDEN' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-rose-500/20 text-rose-400 border border-slate-200'}`}>
 {res.status}
 </span>
 </td>
 <td className="p-3 text-slate-400">{res.approvedBy || '-'}</td>
 <td className="p-3 text-right">
 <div className="flex items-center justify-end space-x-1.5">
 {isAdmin && (
 <>
 <button onClick={() => handleOverride(res.id)}
 title="Emergency Override"
 className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-500 hover:bg-purple-500 hover:text-white text-[10px] font-bold transition-all flex items-center space-x-1 border border-slate-200">
 <Lock className="w-3 h-3" />
 <span>Override</span>
 </button>
 <button onClick={() => handleCancel(res.id)}
 title="Emergency Cancellation"
 className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white text-[10px] font-bold transition-all flex items-center space-x-1 border border-slate-200">
 <Ban className="w-3 h-3" />
 <span>Cancel</span>
 </button>
 <button onClick={() => handleForceRelease(res.id)}
 title="Force Release Room"
 className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-emerald-600 transition-colors">
 <AlertTriangle className="w-3.5 h-3.5" />
 </button>
 </>
 )}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4 border-slate-200">
 <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
 <ShieldCheck className="w-5 h-5 text-emerald-600" />
 <h3 className="font-heading font-bold text-white text-base">Audit Review Trail</h3>
 </div>
 <p className="text-xs text-slate-500">No audit events recorded yet.</p>
 </div>
 </div>
 );
};
