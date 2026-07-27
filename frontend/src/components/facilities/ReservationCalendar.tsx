import React, { useState } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Plus, Users, MapPin } from 'lucide-react';
import { RoomItem, ReservationItem } from '../../types/reservationSystem';

interface ReservationCalendarProps {
 rooms: RoomItem[];
 reservations: ReservationItem[];
 onSelectTimeSlot: (roomId: string, startTime: string, endTime: string) => void;
 onSelectReservation?: (reservation: ReservationItem) => void;
}

export const ReservationCalendar: React.FC<ReservationCalendarProps> = ({
 rooms,
 reservations,
 onSelectTimeSlot,
 onSelectReservation,
}) => {
 const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
 const [selectedDate, setSelectedDate] = useState<Date>(new Date());

 const dateStr = selectedDate.toISOString().split('T')[0];

 const navigateDate = (direction: 'prev' | 'next') => {
 const next = new Date(selectedDate);
 if (viewMode === 'day') next.setDate(next.getDate() + (direction === 'next' ? 1 : -1));
 else if (viewMode === 'week') next.setDate(next.getDate() + (direction === 'next' ? 7 : -7));
 else next.setMonth(next.getMonth() + (direction === 'next' ? 1 : -1));
 setSelectedDate(next);
 };

 // Generate 8:00 AM - 6:00 PM hours
 const hours = Array.from({ length: 11 }, (_, i) => i + 8);

 const getStatusColor = (status: string) => {
 switch (status) {
 case 'APPROVED': return 'bg-emerald-100 text-emerald-600 border-emerald-200/40';
 case 'CHECKED_IN': return 'bg-emerald-100 text-emerald-600 border-slate-200';
 case 'PENDING_APPROVAL': return 'bg-emerald-100 text-emerald-500 border-slate-200';
 case 'MAINTENANCE': return 'bg-rose-500/20 text-rose-300 border-slate-200';
 default: return 'bg-slate-800 text-slate-300 border-slate-200';
 }
 };

 return (
 <div className="glass-panel p-6 space-y-6">
 {/* Calendar Header Controls */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
 <div className="flex items-center space-x-3">
 <div className="p-2 rounded-xl bg-emerald-50 border border-slate-200 text-emerald-600">
 <CalendarIcon className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-heading font-bold text-white text-base">Room Schedule Calendar</h3>
 <p className="text-slate-400 text-xs mt-0.5">
 {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
 </p>
 </div>
 </div>

 <div className="flex items-center space-x-3">
 {/* Day / Week / Month Switcher */}
 <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-200 text-xs">
 {(['day', 'week', 'month'] as const).map(mode => (
 <button
 key={mode}
 onClick={() => setViewMode(mode)}
 className={`px-3 py-1.5 rounded-lg capitalize font-semibold transition-all ${
 viewMode === mode ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
 }`}
 >
 {mode} View
 </button>
 ))}
 </div>

 {/* Date Navigator */}
 <div className="flex items-center space-x-1">
 <button
 onClick={() => navigateDate('prev')}
 className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-200 transition-colors"
 >
 <ChevronLeft className="w-4 h-4" />
 </button>
 <button
 onClick={() => setSelectedDate(new Date())}
 className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-200 text-xs font-semibold"
 >
 Today
 </button>
 <button
 onClick={() => navigateDate('next')}
 className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-200 transition-colors"
 >
 <ChevronRight className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>

 {/* DAY VIEW GRID (Room Lanes x Hours) */}
 {viewMode === 'day' && (
 <div className="overflow-x-auto">
 <div className="min-w-[800px]">
 {/* Hour Header Bar */}
 <div className="grid grid-cols-12 gap-1 mb-2 text-xs font-semibold text-slate-400 border-b border-slate-200 pb-2">
 <div className="col-span-3 text-slate-300">Room Details</div>
 <div className="col-span-9 grid grid-cols-11 gap-1 text-center">
 {hours.map(h => (
 <span key={h} className="text-[11px] font-mono">
 {h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`}
 </span>
 ))}
 </div>
 </div>

 {/* Room Lanes */}
 <div className="space-y-3">
 {rooms.map(room => {
 const roomRes = reservations.filter(r => r.roomId === room.id && r.reservationDate === dateStr);
 return (
 <div key={room.id} className="grid grid-cols-12 gap-1 items-center p-3 rounded-xl bg-slate-900/50 border border-slate-200 hover:border-slate-200 transition-all">
 {/* Room Info Left */}
 <div className="col-span-3 space-y-1">
 <div className="flex items-center space-x-2">
 <span className="font-heading font-bold text-white text-xs hover:text-emerald-600 transition-colors">{room.name}</span>
 <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${room.status === 'MAINTENANCE' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-100 text-emerald-600'}`}>
 {room.status}
 </span>
 </div>
 <div className="flex items-center space-x-3 text-[11px] text-slate-400">
 <span className="flex items-center space-x-1"><Users className="w-3 h-3 text-emerald-600" /><span>{room.capacity} seats</span></span>
 <span className="flex items-center space-x-1"><MapPin className="w-3 h-3 text-emerald-600" /><span>Floor {room.floor}</span></span>
 </div>
 </div>

 {/* Hours Grid Right */}
 <div className="col-span-9 grid grid-cols-11 gap-1">
 {hours.map(h => {
 const hourPad = h.toString().padStart(2, '0');
 const startISO = `${dateStr}T${hourPad}:00`;
 const endISO = `${dateStr}T${(h + 1).toString().padStart(2, '0')}:00`;
 
 // Check if an existing reservation overlaps this hour
 const matchingRes = roomRes.find(r => {
 const rStartHour = parseInt(r.startTime.split('T')[1]?.split(':')[0] || '0');
 const rEndHour = parseInt(r.endTime.split('T')[1]?.split(':')[0] || '24');
 return h >= rStartHour && h < rEndHour;
 });

 return (
 <div
 key={h}
 onClick={() => {
 if (matchingRes) {
 if (onSelectReservation) onSelectReservation(matchingRes);
 } else {
 onSelectTimeSlot(room.id, startISO, endISO);
 }
 }}
 className={`h-12 rounded-lg p-1 text-[10px] flex flex-col justify-between border cursor-pointer transition-all hover:scale-[1.02] ${
 matchingRes 
 ? `${getStatusColor(matchingRes.status)} shadow-sm`
 : 'bg-slate-950/60 border-slate-200 text-slate-600 hover:border-emerald-200/50 hover:bg-emerald-50 hover:text-emerald-600'
 }`}
 >
 {matchingRes ? (
 <>
 <span className="font-semibold truncate">{matchingRes.meetingTitle}</span>
 <span className="text-[9px] opacity-80">{matchingRes.employeeName.split(' ')[0]}</span>
 </>
 ) : (
 <div className="h-full flex items-center justify-center text-slate-700 hover:text-emerald-600">
 <Plus className="w-3.5 h-3.5 opacity-60" />
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 )}

 {/* WEEK & MONTH VIEW FALLBACK LIST */}
 {(viewMode === 'week' || viewMode === 'month') && (
 <div className="space-y-4">
 <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-200 text-xs text-slate-400 flex items-center justify-between">
 <span>Showing all active reservations for {viewMode === 'week' ? 'the selected week' : 'the current month'}.</span>
 <span className="text-emerald-600 font-semibold">{reservations.length} total bookings</span>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {reservations.map(res => (
 <div 
 key={res.id} 
 onClick={() => onSelectReservation && onSelectReservation(res)}
 className={`p-4 rounded-xl border space-y-3 cursor-pointer transition-all hover:border-emerald-200/40 ${getStatusColor(res.status)}`}
 >
 <div className="flex items-start justify-between">
 <div>
 <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950/60 border border-slate-200">{res.status}</span>
 <h4 className="font-bold text-sm text-white mt-1">{res.meetingTitle}</h4>
 </div>
 <span className="text-xs text-slate-400 font-mono">{res.reservationDate}</span>
 </div>
 <div className="text-xs text-slate-300 space-y-1">
 <div className="flex items-center space-x-1.5"><Clock className="w-3.5 h-3.5 text-emerald-600" /><span>{res.startTime.split('T')[1]?.slice(0, 5) || res.startTime} - {res.endTime.split('T')[1]?.slice(0, 5) || res.endTime}</span></div>
 <div className="flex items-center space-x-1.5"><Users className="w-3.5 h-3.5 text-emerald-600" /><span>{res.employeeName} ({res.employeeDepartment})</span></div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Legend Footer */}
 <div className="pt-3 border-t border-slate-200 flex items-center space-x-6 text-xs text-slate-400 flex-wrap gap-2">
 <span className="font-semibold text-slate-300">Status Legend:</span>
 <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span><span>Approved</span></span>
 <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span><span>Checked In</span></span>
 <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span><span>Pending Officer Review</span></span>
 <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span><span>Maintenance</span></span>
 </div>
 </div>
 );
};
