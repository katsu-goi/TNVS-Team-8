import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { ReservationCalendar } from './ReservationCalendar';
import { FacilitiesContext } from './FacilitiesLayout';

export const EnterpriseCalendar: React.FC = () => {
 const { rooms, reservations, kpis } = useOutletContext<FacilitiesContext>();

 const todayReservations = reservations.filter(
 r => r.reservationDate === new Date().toISOString().split('T')[0]
 ).length;

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600">
 <CalendarIcon className="w-6 h-6" />
 </div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Enterprise Calendar</h2>
 <p className="text-slate-400 text-xs mt-0.5">Room Schedule Overview • Day / Week / Month View</p>
 </div>
 </div>

 <div className="grid grid-cols-3 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Rooms</span>
 <span className="text-xl font-bold text-white font-mono">{rooms.length}</span>
 <span className="text-[10px] text-slate-500 block">Facility-wide</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Reservations Today</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{todayReservations}</span>
 <span className="text-[10px] text-emerald-600/80 block">{kpis?.reservationsToday || reservations.length} Total</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Occupancy Rate</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{kpis?.occupancyRatePercentage || 0}%</span>
 <span className="text-[10px] text-slate-500 block">Avg Daily</span>
 </div>
 </div>

 <ReservationCalendar
 rooms={rooms}
 reservations={reservations}
 onSelectTimeSlot={(roomId) => alert(`Selected room slot #${roomId}`)}
 onSelectReservation={(res) => alert(`Selected reservation: ${res.meetingTitle}`)}
 />
 </div>
 );
};
