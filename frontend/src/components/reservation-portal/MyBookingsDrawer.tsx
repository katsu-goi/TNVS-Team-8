import React from 'react';
import { CalendarDays, Clock3, Loader2, X } from 'lucide-react';
import type { PortalReservation } from '../../api/reservationPortalService';

type MyBookingsDrawerProps = {
  open: boolean;
  loading: boolean;
  bookings: PortalReservation[];
  onClose: () => void;
  onSelect: (reservation: PortalReservation) => void;
};

function formatRange(reservation: PortalReservation): string {
  const start = new Date(reservation.startTime);
  const end = new Date(reservation.endTime);
  return `${start.toLocaleDateString([], { dateStyle: 'medium' })} · ${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export const MyBookingsDrawer: React.FC<MyBookingsDrawerProps> = ({ open, loading, bookings, onClose, onSelect }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/35" onClick={onClose}>
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Reservation portal</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">My bookings</h2>
            <p className="mt-1 text-xs text-slate-500">Upcoming and past reservations you created.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close my bookings"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-red-700" />Loading bookings...</div> : bookings.length === 0 ? <div className="py-12 text-center"><CalendarDays className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No bookings found</p><p className="mt-1 text-xs text-slate-500">Reservations you create will appear here.</p></div> : <div className="space-y-3">{bookings.map((reservation) => {
            const past = new Date(reservation.endTime).getTime() < Date.now();
            return <button type="button" key={reservation.id} onClick={() => onSelect(reservation)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-red-300 hover:bg-red-50/40"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{reservation.title}</p><p className="mt-1 truncate text-xs text-slate-500">{reservation.facilityName}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${past ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{past ? 'Past' : reservation.status}</span></div><p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><Clock3 className="h-3.5 w-3.5 text-red-700" />{formatRange(reservation)}</p></button>;
          })}</div>}
        </div>
      </aside>
    </div>
  );
};

export default MyBookingsDrawer;
