import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Building2, CalendarDays, CheckCircle2, Clock3, Download, Mail, MapPin, Plus, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { reservationPortalService, type CreateReservationResult, type PortalFacility, type PortalReservation, type ReservationDetails } from '../../api/reservationPortalService';
import { useAuthStore } from '../../stores/authStore';
import { MultiEmailInput } from './MultiEmailInput';
import { MyBookingsDrawer } from './MyBookingsDrawer';
import { ReservationDetailsModal } from './ReservationDetailsModal';
import { TimeSelect } from './TimeSelect';

const DAY_START = 8;
const DAY_END = 20;
const SLOT_WIDTH = 120;
const SLOT_MINUTES = 60;

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayKey(): string {
  return dateKey(new Date());
}

function timeLabel(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${display}:00 ${suffix}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function localDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function reservationOffset(reservation: PortalReservation): { left: number; width: number } {
  const start = new Date(reservation.startTime);
  const end = new Date(reservation.endTime);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  const left = Math.max(0, (startHour - DAY_START) * SLOT_WIDTH);
  const width = Math.max(92, (endHour - startHour) * SLOT_WIDTH - 4);
  return { left, width };
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10';

export const ReservationPortalPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [facilities, setFacilities] = useState<PortalFacility[]>([]);
  const [reservations, setReservations] = useState<PortalReservation[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState<CreateReservationResult | null>(null);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    facilityId: '',
    title: '',
    date: todayKey(),
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
    invitees: [] as string[],
  });
  const [details, setDetails] = useState<ReservationDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [myBookings, setMyBookings] = useState<PortalReservation[]>([]);
  const [myBookingsOpen, setMyBookingsOpen] = useState(false);
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [facilityRows, reservationRows] = await Promise.all([
        reservationPortalService.getFacilities(),
        reservationPortalService.getReservations({ date: selectedDate }),
      ]);
      setFacilities(facilityRows);
      setReservations(reservationRows);
      setForm((current) => ({ ...current, facilityId: current.facilityId || facilityRows[0]?.id || '' }));
    } catch (loadError) {
      setError(extractErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => { void load(true); }, 15000);
    const clockInterval = window.setInterval(() => setNow(new Date()), 30000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clockInterval);
    };
  }, [load]);

  useEffect(() => {
    if (!myBookingsOpen) return;
    setMyBookingsLoading(true);
    reservationPortalService.getMyBookings()
      .then(setMyBookings)
      .catch((loadError) => setError(extractErrorMessage(loadError)))
      .finally(() => setMyBookingsLoading(false));
  }, [myBookingsOpen]);

  const reservationsByFacility = useMemo(() => {
    const map = new Map<string, PortalReservation[]>();
    for (const reservation of reservations) {
      const list = map.get(reservation.facilityId) ?? [];
      list.push(reservation);
      map.set(reservation.facilityId, list);
    }
    return map;
  }, [reservations]);

  const selectedFacility = facilities.find((facility) => facility.id === form.facilityId);
  const timeError = useMemo(() => {
    if (!form.startTime || !form.endTime) return 'Start and end times are required.';
    if (minutesFromTime(form.endTime) <= minutesFromTime(form.startTime)) return 'End time must be after start time.';
    if (form.date < todayKey()) return 'Choose today or a future date.';
    if (form.date === todayKey() && minutesFromTime(form.startTime) <= (now.getHours() * 60) + now.getMinutes()) return 'Start time must be in the future.';
    return '';
  }, [form.date, form.endTime, form.startTime, now]);
  const capacityError = selectedFacility && form.invitees.length > selectedFacility.capacity
    ? `Invitees: ${form.invitees.length} / ${selectedFacility.capacity} (Over capacity)`
    : selectedFacility ? `Invitees: ${form.invitees.length} / ${selectedFacility.capacity}` : '';

  const isPastSlot = (hour: number): boolean => {
    const selectedDay = new Date(`${selectedDate}T00:00:00`);
    const currentDay = new Date(`${todayKey()}T00:00:00`);
    if (selectedDay < currentDay) return true;
    if (selectedDate !== todayKey()) return false;
    return (hour * 60) <= (now.getHours() * 60) + now.getMinutes();
  };

  const isReservedSlot = (facilityId: string, hour: number): boolean => {
    const slotStart = hour * 60;
    const slotEnd = slotStart + SLOT_MINUTES;
    return (reservationsByFacility.get(facilityId) ?? []).some((reservation) => {
      const start = new Date(reservation.startTime);
      const end = new Date(reservation.endTime);
      const startMinutes = (start.getHours() * 60) + start.getMinutes();
      const endMinutes = (end.getHours() * 60) + end.getMinutes();
      return startMinutes < slotEnd && endMinutes > slotStart;
    });
  };

  const openReservationDetails = async (reservation: PortalReservation) => {
    setDetails(reservation as ReservationDetails);
    setDetailsLoading(true);
    setDetailsError('');
    try {
      setDetails(await reservationPortalService.getReservationDetails(reservation.id));
    } catch (loadError) {
      setDetailsError(extractErrorMessage(loadError));
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSaveReservation = async (payload: { title: string; startTime: string; endTime: string; notes?: string }) => {
    if (!details) return;
    setActionLoading(true);
    setDetailsError('');
    try {
      const updated = await reservationPortalService.updateReservation(details.id, payload);
      setDetails((current) => current ? { ...current, ...updated } : current);
      setReservations((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMyBookings((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (saveError) {
      setDetailsError(extractErrorMessage(saveError));
      throw saveError;
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!details || !window.confirm(`Cancel ${details.title}? This releases its time slot.`)) return;
    setActionLoading(true);
    setDetailsError('');
    try {
      await reservationPortalService.cancelReservation(details.id);
      setReservations((current) => current.filter((item) => item.id !== details.id));
      setMyBookings((current) => current.filter((item) => item.id !== details.id));
      setDetails(null);
    } catch (cancelError) {
      setDetailsError(extractErrorMessage(cancelError));
    } finally {
      setActionLoading(false);
    }
  };

  const openModal = () => {
    setFormError('');
    setResult(null);
    setForm((current) => ({ ...current, date: selectedDate, facilityId: current.facilityId || facilities[0]?.id || '' }));
    setShowModal(true);
  };

  const openModalAt = (facilityId: string, startTime: string) => {
    setFormError('');
    setResult(null);
    setForm((current) => ({ ...current, facilityId, date: selectedDate, startTime, endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:00` }));
    setShowModal(true);
  };

  const closeModal = () => {
    if (!saving) {
      setShowModal(false);
      setResult(null);
      setQrImages({});
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.facilityId || !form.title.trim()) { setFormError('Choose a meeting space and enter a title.'); return; }
    if (timeError) { setFormError(timeError); return; }
    if (selectedFacility && form.invitees.length > selectedFacility.capacity) { setFormError(capacityError); return; }
    setSaving(true);
    try {
      const created = await reservationPortalService.createReservation({
        facilityId: form.facilityId,
        title: form.title.trim(),
        startTime: localDateTime(form.date, form.startTime),
        endTime: localDateTime(form.date, form.endTime),
        notes: form.notes.trim(),
        inviteeEmails: form.invitees,
      });
      setResult(created);
      const images = await Promise.all(created.invitations.map(async (invitation) => [
        invitation.id,
        await QRCode.toDataURL(invitation.qrPayload, { width: 220, margin: 1, errorCorrectionLevel: 'M' }),
      ] as const));
      setQrImages(Object.fromEntries(images));
      await load(true);
    } catch (saveError) {
      setFormError(extractErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-700 text-white shadow-sm"><Building2 className="h-5 w-5" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Team 8 Facilities</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Reservation Portal</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-right sm:flex">
              <p className="text-xs font-semibold text-slate-800">{user?.fullName || user?.email}</p>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <button type="button" onClick={() => setMyBookingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:border-red-200 hover:text-red-700"><CalendarDays className="h-4 w-4" />My bookings</button><button type="button" onClick={openModal} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-800"><Plus className="h-4 w-4" />New Visit / Reserve Room</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-5 px-5 py-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rooms available</p><Building2 className="h-4 w-4 text-red-700" /></div><p className="mt-3 text-3xl font-bold text-slate-900">{facilities.filter((facility) => facility.status === 'AVAILABLE').length}</p><p className="mt-1 text-xs text-slate-400">Configured Team 8 meeting spaces</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings today</p><CalendarDays className="h-4 w-4 text-red-700" /></div><p className="mt-3 text-3xl font-bold text-slate-900">{reservations.length}</p><p className="mt-1 text-xs text-slate-400">Confirmed reservations in view</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Portal status</p><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /></div><p className="mt-3 text-xl font-bold text-emerald-700">Online</p><p className="mt-1 text-xs text-slate-400">Availability refreshes automatically</p></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div><h2 className="text-base font-bold text-slate-900">Room availability</h2><p className="mt-1 text-xs text-slate-500">Select a date to review the Team 8 booking grid.</p></div>
            <div className="flex items-center gap-2"><input type="date" min={todayKey()} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-red-700" /><button type="button" onClick={() => void load(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50" title="Refresh availability">{refreshing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button></div>
          </div>
          {error && <div className="m-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
          {loading ? <div className="space-y-3 p-5"><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /></div> : facilities.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">No meeting spaces are configured.</div> : (
            <div className="overflow-x-auto">
              <div className="min-w-[1550px] p-5">
                <div className="ml-[250px] flex border-b border-slate-200" style={{ width: `${(DAY_END - DAY_START) * SLOT_WIDTH}px` }}>{Array.from({ length: DAY_END - DAY_START }, (_, index) => <div key={index} className="shrink-0 border-l border-slate-100 px-2 pb-2 text-[10px] font-semibold text-slate-400" style={{ width: SLOT_WIDTH }}>{timeLabel(DAY_START + index)}</div>)}</div>
                <div className="space-y-2 pt-2">{facilities.map((facility) => {
                  const facilityReservations = reservationsByFacility.get(facility.id) ?? [];
                  return <div key={facility.id} className="flex min-h-[92px] rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="w-[250px] shrink-0 border-r border-slate-200 p-4"><p className="truncate text-sm font-bold text-slate-900">{facility.facilityName}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{facility.capacity} seats</span><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{facility.code || 'Team 8'}</span></div><p className="mt-2 truncate text-[10px] text-slate-400">{facility.amenities.join(' · ') || 'Standard meeting amenities'}</p></div>
                    <div className="relative" style={{ width: `${(DAY_END - DAY_START) * SLOT_WIDTH}px` }}>{Array.from({ length: DAY_END - DAY_START }, (_, index) => { const hour = DAY_START + index; const past = isPastSlot(hour); const reserved = isReservedSlot(facility.id, hour); return <button key={hour} type="button" disabled={past || reserved} onClick={() => openModalAt(facility.id, `${String(hour).padStart(2, '0')}:00`)} className={`absolute inset-y-0 border-l border-slate-200/70 transition ${past ? 'cursor-not-allowed bg-slate-100/80' : reserved ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-red-50/70'}`} style={{ left: index * SLOT_WIDTH, width: SLOT_WIDTH }} aria-label={`${facility.facilityName}, ${timeLabel(hour)}${past ? ', unavailable because this time has passed' : reserved ? ', already reserved' : ', reserve this slot'}`} />; })}{facilityReservations.map((reservation) => { const offset = reservationOffset(reservation); return <button type="button" key={reservation.id} title={`${reservation.title} · ${reservation.hostName}`} onClick={() => void openReservationDetails(reservation)} className="absolute top-3 h-[68px] overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left shadow-sm transition hover:border-red-400 hover:bg-red-100" style={{ left: offset.left, width: offset.width }}><p className="truncate text-[11px] font-bold text-red-900">{reservation.title}</p><p className="mt-1 truncate text-[10px] text-red-700">{new Date(reservation.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {reservation.hostName}</p></button>; })}</div>
                  </div>;
                })}</div>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Today&apos;s reservations</h2><p className="mt-1 text-xs text-slate-500">{selectedDate === todayKey() ? 'Your current day view' : selectedDate}</p></div><Clock3 className="h-4 w-4 text-slate-400" /></div>{reservations.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No reservations for this date.</p> : <div className="divide-y divide-slate-100">{reservations.map((reservation) => <button type="button" key={reservation.id} onClick={() => void openReservationDetails(reservation)} className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left hover:bg-slate-50"><div><p className="text-sm font-semibold text-slate-800">{reservation.title}</p><p className="mt-1 text-xs text-slate-500">{reservation.facilityName} · {formatDateTime(reservation.startTime)} - {new Date(reservation.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{reservation.status}</span></button>)}</div>}</div>
          <div className="rounded-2xl border border-red-100 bg-red-50/60 p-5"><div className="flex items-center gap-2 text-red-800"><ShieldCheck className="h-4 w-4" /><h2 className="text-sm font-bold">Digital pass security</h2></div><p className="mt-3 text-xs leading-5 text-red-900/70">Every invitee receives a unique QR pass. Only its SHA-256 hash is retained in the database; the pass payload is exposed once to the simulated delivery pipeline.</p><div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-red-800"><Mail className="h-3.5 w-3.5" /> Email delivery status is visible after booking</div></div>
        </section>
      </main>

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-bold text-slate-900">{result ? 'Reservation confirmed' : 'New Visit / Reserve Room'}</h2><p className="mt-1 text-xs text-slate-500">{result ? `Invitation delivery: ${result.emailDelivery}.` : 'Choose a space and send secure digital passes to invitees.'}</p></div><button type="button" onClick={closeModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close reservation dialog"><X className="h-5 w-5" /></button></div>{result ? <div className="space-y-5 p-5"><div className={`flex items-start gap-3 rounded-xl border p-4 ${result.emailDelivery === 'SENT' || result.emailDelivery === 'NO_INVITEES' ? 'border-emerald-200 bg-emerald-50' : result.emailDelivery === 'SIMULATED' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'}`}><CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${result.emailDelivery === 'SENT' || result.emailDelivery === 'NO_INVITEES' ? 'text-emerald-600' : result.emailDelivery === 'SIMULATED' ? 'text-amber-600' : 'text-rose-600'}`} /><div><p className={`text-sm font-bold ${result.emailDelivery === 'SENT' || result.emailDelivery === 'NO_INVITEES' ? 'text-emerald-800' : result.emailDelivery === 'SIMULATED' ? 'text-amber-800' : 'text-rose-800'}`}>{result.reservation.title}</p><p className={`mt-1 text-xs ${result.emailDelivery === 'SENT' || result.emailDelivery === 'NO_INVITEES' ? 'text-emerald-700' : result.emailDelivery === 'SIMULATED' ? 'text-amber-700' : 'text-rose-700'}`}>{result.reservation.facilityName} · {formatDateTime(result.reservation.startTime)}</p><p className={`mt-1 text-xs font-semibold ${result.emailDelivery === 'SENT' || result.emailDelivery === 'NO_INVITEES' ? 'text-emerald-700' : result.emailDelivery === 'SIMULATED' ? 'text-amber-700' : 'text-rose-700'}`}>Email delivery: {result.emailDelivery}</p></div></div>{result.invitations.length === 0 ? <p className="text-sm text-slate-500">No invitees were added to this reservation.</p> : <div className="grid gap-4 sm:grid-cols-2">{result.invitations.map((invitation) => <div key={invitation.id} className="rounded-xl border border-slate-200 p-4 text-center"><img src={qrImages[invitation.id]} alt={`Digital QR pass for ${invitation.email}`} className="mx-auto h-[180px] w-[180px]" /><p className="mt-3 truncate text-xs font-bold text-slate-800">{invitation.email}</p><p className="mt-2 text-[11px] font-semibold text-slate-500">{invitation.emailDelivery ?? result.emailDelivery}</p>{invitation.magicLinkUrl ? <a href={invitation.magicLinkUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-[11px] font-semibold text-red-700 hover:bg-red-50">Open guest pass</a> : null}<a href={qrImages[invitation.id]} download={`team8-pass-${invitation.email}.png`} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />Download QR</a></div>)}</div>}<button type="button" onClick={closeModal} className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white hover:bg-red-800">Done</button></div> : <form onSubmit={handleSubmit} className="space-y-5 p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={inputClass} placeholder="e.g. Weekly operations sync" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting space</span><select value={form.facilityId} onChange={(event) => setForm((current) => ({ ...current, facilityId: event.target.value }))} className={inputClass}>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.facilityName} · {facility.capacity} seats</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span><input type="date" min={todayKey()} value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={inputClass} /></label><TimeSelect id="start-time" label="Start time" value={form.startTime} selectedDate={form.date} now={now} dayStart={DAY_START} dayEnd={DAY_END} onChange={(startTime) => setForm((current) => ({ ...current, startTime }))} disabled={saving} hasError={Boolean(timeError)} /><TimeSelect id="end-time" label="End time" value={form.endTime} selectedDate={form.date} now={now} dayStart={DAY_START} dayEnd={DAY_END} onChange={(endTime) => setForm((current) => ({ ...current, endTime }))} disabled={saving} hasError={Boolean(timeError)} /><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Invitee email addresses</span><MultiEmailInput value={form.invitees} onChange={(invitees) => setForm((current) => ({ ...current, invitees }))} disabled={saving} />{capacityError && <p className={`mt-2 text-xs font-semibold ${form.invitees.length > (selectedFacility?.capacity ?? Number.MAX_SAFE_INTEGER) ? 'text-rose-600' : 'text-slate-500'}`}>{capacityError}</p>}</label><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} className={inputClass} placeholder="Optional agenda or visitor notes" /></label></div>{timeError && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{timeError}</span></div>}{formError && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{formError}</span></div>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving || Boolean(timeError) || Boolean(selectedFacility && form.invitees.length > selectedFacility.capacity)} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Confirming...' : 'Confirm reservation'}</button></div></form>}</div></div>}
      <ReservationDetailsModal reservation={details} loading={detailsLoading} error={detailsError} currentUserId={user?.id} actionLoading={actionLoading} onClose={() => setDetails(null)} onSave={handleSaveReservation} onCancel={handleCancelReservation} />
      <MyBookingsDrawer open={myBookingsOpen} loading={myBookingsLoading} bookings={myBookings} onClose={() => setMyBookingsOpen(false)} onSelect={(reservation) => { setMyBookingsOpen(false); void openReservationDetails(reservation); }} />
    </div>
  );
};
