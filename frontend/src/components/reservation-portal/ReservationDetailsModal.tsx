import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Clock3, Edit3, Loader2, Mail, Save, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import type { ReservationDetails } from '../../api/reservationPortalService';

type ReservationDetailsModalProps = {
  reservation: ReservationDetails | null;
  loading: boolean;
  error: string;
  currentUserId?: string;
  actionLoading: boolean;
  onClose: () => void;
  onSave: (payload: { title: string; startTime: string; endTime: string; notes?: string }) => Promise<void>;
  onCancel: () => Promise<void>;
};

function inputDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inputTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function localDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10';

export const ReservationDetailsModal: React.FC<ReservationDetailsModalProps> = ({ reservation, loading, error, currentUserId, actionLoading, onClose, onSave, onCancel }) => {
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ title: '', date: '', startTime: '', endTime: '', notes: '' });
  const isHost = Boolean(reservation && currentUserId && reservation.hostUserId === currentUserId);

  useEffect(() => {
    if (!reservation) return;
    setEditing(false);
    setFormError('');
    setForm({ title: reservation.title, date: inputDate(reservation.startTime), startTime: inputTime(reservation.startTime), endTime: inputTime(reservation.endTime), notes: reservation.notes ?? '' });
  }, [reservation]);

  if (!reservation && !loading) return null;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.title.trim()) { setFormError('A reservation title is required.'); return; }
    const start = new Date(localDateTime(form.date, form.startTime));
    const end = new Date(localDateTime(form.date, form.endTime));
    if (!form.date || !form.startTime || !form.endTime || end <= start) { setFormError('End time must be after start time.'); return; }
    if (start.getTime() < Date.now()) { setFormError('A reservation cannot start in the past.'); return; }
    await onSave({ title: form.title.trim(), startTime: start.toISOString(), endTime: end.toISOString(), notes: form.notes.trim() });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="reservation-details-title">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Reservation details</p><h2 id="reservation-details-title" className="mt-1 text-lg font-bold text-slate-900">{loading ? 'Loading reservation...' : reservation?.title ?? 'Unable to load reservation'}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close reservation details"><X className="h-5 w-5" /></button></div>
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-red-700" />Loading details...</div> : error ? <div className="m-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4" />{error}</div> : reservation && (editing ? <form onSubmit={handleSave} className="space-y-5 p-5"><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></label><div className="grid gap-4 sm:grid-cols-3"><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span><input type="date" min={inputDate(new Date().toISOString())} value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={inputClass} /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Start</span><input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} className={inputClass} /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">End</span><input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} className={inputClass} /></label></div><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span><textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={inputClass} /></label>{formError && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4" />{formError}</div>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setEditing(false)} disabled={actionLoading} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Back</button><button type="submit" disabled={actionLoading} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-60"><Save className="h-4 w-4" />{actionLoading ? 'Saving...' : 'Save changes'}</button></div></form> : <div className="space-y-5 p-5"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><CalendarDays className="h-4 w-4 text-red-700" />Facility</div><p className="mt-2 text-sm font-bold text-slate-900">{reservation.facilityName}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Clock3 className="h-4 w-4 text-red-700" />Schedule</div><p className="mt-2 text-sm font-bold text-slate-900">{new Date(reservation.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p><p className="mt-1 text-xs text-slate-500">to {new Date(reservation.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p></div></div><div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><ShieldCheck className="h-4 w-4 text-red-700" />Host</div><p className="mt-2 text-sm font-bold text-slate-900">{reservation.hostName}</p><p className="mt-1 text-xs text-slate-500">{reservation.hostEmail || 'Internal Team 8 member'}</p></div><div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Users className="h-4 w-4 text-red-700" />Invitees ({reservation.invitees.length})</div>{reservation.invitees.length ? <div className="mt-3 space-y-2">{reservation.invitees.map((invitee) => <div key={invitee.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{invitee.email}</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${invitee.checkedIn ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{invitee.checkedIn ? 'Checked in' : 'Not checked in'}</span></div>)}</div> : <p className="mt-3 text-xs text-slate-400">No invitees were added.</p>}</div>{reservation.notes && <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{reservation.notes}</p></div>}<div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">{isHost && <><button type="button" onClick={() => setEditing(true)} disabled={actionLoading || reservation.status === 'CANCELLED'} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-red-200 hover:text-red-700 disabled:opacity-50"><Edit3 className="h-4 w-4" />Edit</button><button type="button" onClick={() => void onCancel()} disabled={actionLoading || reservation.status === 'CANCELLED'} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"><Trash2 className="h-4 w-4" />{actionLoading ? 'Cancelling...' : 'Cancel reservation'}</button></>}<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Close</button></div></div>)}
      </div>
    </div>
  );
};

export default ReservationDetailsModal;
