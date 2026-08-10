import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, RefreshCw, Plus, X, Pencil, Ban, CheckCircle2,
  CalendarClock, Users, FileText, FileSignature, Bell, Settings,
  Building2, MapPin, Users as UsersIcon, Upload, Download, Trash2, Check,
} from 'lucide-react';
import { employeeService } from '../../api/employeeService';
import { DocumentUploadPanel } from '../documents/DocumentUploadPanel';

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="glass-panel p-5 animate-pulse"><div className="h-5 w-56 bg-slate-200 rounded" /></div>
    <div className="glass-panel p-5 animate-pulse"><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 w-full bg-slate-200 rounded" />)}</div></div>
  </div>
);

const EmptyState: React.FC<{ icon: React.ElementType; title: string; desc: string }> = ({ icon: Icon, title, desc }) => (
  <div className="card-stat p-12 flex flex-col items-center justify-center text-center space-y-4">
    <div className="p-4 rounded-2xl bg-slate-100"><Icon className="w-10 h-10 text-slate-400" /></div>
    <p className="text-lg font-bold text-slate-700">{title}</p>
    <p className="text-sm text-slate-500 max-w-md">{desc}</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="card-stat p-8 flex flex-col items-center justify-center text-center space-y-3">
    <AlertCircle className="w-10 h-10 text-rose-400" />
    <p className="text-sm text-slate-600">{message}</p>
    <button onClick={onRetry} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center space-x-2">
      <RefreshCw className="w-4 h-4" /><span>Retry</span>
    </button>
  </div>
);

const Badge: React.FC<{ text?: string; className: string }> = ({ text, className }) => (
  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${className}`}>{text || '-'}</span>
);

type ActionVariant = 'primary' | 'neutral' | 'danger';
const actionClasses: Record<ActionVariant, string> = {
  primary: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700',
  neutral: 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
  danger: 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50',
};
const ActionButton: React.FC<{
  onClick: () => void; icon?: React.ElementType; children: React.ReactNode;
  variant?: ActionVariant; disabled?: boolean;
}> = ({ onClick, icon: Icon, children, variant = 'neutral', disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className={`inline-flex items-center space-x-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${actionClasses[variant]}`}>
    {Icon && <Icon className="w-3.5 h-3.5" />}<span>{children}</span>
  </button>
);

const Toast: React.FC<{ message: string; kind: 'ok' | 'err'; onClose: () => void }> = ({ message, kind, onClose }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
    kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
  }`}>
    {kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
    <span>{message}</span>
    <button onClick={onClose} className="ml-2 opacity-80 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
  </div>
);

const useToast = () => {
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'err' } | null>(null);
  const show = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3200);
  }, []);
  const node = toast ? <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} /> : null;
  return { show, node };
};

const inputCls = 'mt-1 w-full text-sm bg-white text-slate-900 placeholder-slate-400 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const labelCls = 'text-[11px] font-semibold text-slate-500 uppercase';

const reservationStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-600';
    case 'PENDING': return 'bg-amber-50 text-amber-600';
    case 'REJECTED': return 'bg-rose-50 text-rose-600';
    case 'CANCELLED': return 'bg-slate-100 text-slate-500';
    case 'CHECKED_IN': return 'bg-blue-50 text-blue-600';
    case 'COMPLETED': return 'bg-teal-50 text-teal-600';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const requestStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-600';
    case 'PENDING': return 'bg-amber-50 text-amber-600';
    case 'IN_REVIEW': return 'bg-blue-50 text-blue-600';
    case 'REJECTED': return 'bg-rose-50 text-rose-600';
    case 'CANCELLED': return 'bg-slate-100 text-slate-500';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const visitorStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'REGISTERED': return 'bg-blue-50 text-blue-600';
    case 'CHECKED_IN': return 'bg-emerald-50 text-emerald-600';
    case 'CHECKED_OUT': return 'bg-slate-100 text-slate-500';
    case 'CANCELLED': return 'bg-rose-50 text-rose-600';
    default: return 'bg-slate-100 text-slate-500';
  }
};

const docStatusBadge = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED': return 'bg-emerald-50 text-emerald-600';
    case 'PENDING_REVIEW': return 'bg-amber-50 text-amber-600';
    case 'ARCHIVED': return 'bg-slate-100 text-slate-500';
    case 'REJECTED': return 'bg-rose-50 text-rose-600';
    default: return 'bg-blue-50 text-blue-600';
  }
};

const fmtDateTime = (v?: string) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
};

const PageHeader: React.FC<{ title: string; subtitle: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
  <div className="glass-panel p-5 flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-extrabold font-heading text-slate-900 leading-tight">{title}</h1>
      <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
    </div>
    {action}
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        <h3 className="font-heading font-bold text-base text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5 overflow-y-auto">{children}</div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

interface AvailableRoom {
  id: string; roomName: string; roomNumber: string; facilityName: string;
  capacity?: number | null; floorNumber?: number | null; building?: string | null;
  availability: string; selectable: boolean;
}

export const EmpReservationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { show, node } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ date: '', startTime: '10:00', endTime: '11:00', title: '', description: '', expectedAttendees: '' });
  const [room, setRoom] = useState<AvailableRoom | null>(null);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await employeeService.getReservations()); }
    catch (e: any) { setError(e?.message || 'Failed to load reservations'); }
    finally { setLoading(false); }
  }, [retry]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null); setRoom(null); setRooms([]);
    setForm({ date: '', startTime: '10:00', endTime: '11:00', title: '', description: '', expectedAttendees: '' });
    setShowModal(true);
  };

  useEffect(() => {
    if (searchParams.get('new') === '1') { openNew(); searchParams.delete('new'); setSearchParams(searchParams, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openEdit = (r: any) => {
    setEditing(r);
    const s = r.startTime ? new Date(r.startTime) : null;
    const e = r.endTime ? new Date(r.endTime) : null;
    const iso = (d: Date | null) => d ? d.toISOString().slice(0, 10) : '';
    const hm = (d: Date | null) => d ? d.toTimeString().slice(0, 5) : '';
    setForm({ date: iso(s), startTime: hm(s), endTime: hm(e), title: r.title || '', description: r.description || '', expectedAttendees: r.expectedAttendees != null ? String(r.expectedAttendees) : '' });
    setRoom(null); setRooms([]);
    setShowModal(true);
  };

  const searchRooms = async () => {
    if (!form.date || !form.startTime || !form.endTime) { show('Pick a date and time first.', 'err'); return; }
    setRoomsLoading(true);
    try {
      const data = await employeeService.getAvailableRooms({ date: form.date, startTime: form.startTime, endTime: form.endTime, availability: 'AVAILABLE' });
      setRooms((data.rooms ?? []).map((r: any) => ({ ...r })));
    } catch (e: any) { show(e?.response?.data?.message || 'Failed to search rooms', 'err'); }
    finally { setRoomsLoading(false); }
  };

  const submitCreate = async () => {
    if (!room) { show('Select a room.', 'err'); return; }
    if (!form.title.trim()) { show('Title is required.', 'err'); return; }
    setSaving(true);
    try {
      await employeeService.createReservation({
        roomId: room.id, title: form.title, description: form.description,
        startTime: `${form.date}T${form.startTime}:00`, endTime: `${form.date}T${form.endTime}:00`,
        expectedAttendees: form.expectedAttendees ? Number(form.expectedAttendees) : undefined,
      });
      show('Reservation request submitted.'); setShowModal(false); setRetry(r => r + 1);
    } catch (e: any) { show(e?.response?.data?.message || 'Failed to create reservation', 'err'); }
    finally { setSaving(false); }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await employeeService.updateReservation(editing.id, {
        title: form.title, description: form.description,
        expectedAttendees: form.expectedAttendees ? Number(form.expectedAttendees) : null,
      });
      show('Reservation updated.'); setShowModal(false); setRetry(r => r + 1);
    } catch (e: any) { show(e?.response?.data?.message || 'Failed to update reservation', 'err'); }
    finally { setSaving(false); }
  };

  const cancel = async (r: any) => {
    if (!window.confirm(`Cancel reservation "${r.title}"?`)) return;
    try { await employeeService.cancelReservation(r.id); show('Reservation cancelled.'); setRetry(x => x + 1); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed to cancel', 'err'); }
  };

  if (loading && !rows.length) return <LoadingSkeleton />;
  if (error && !rows.length) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Facilities Reservation" subtitle="Book rooms and track approval status"
        action={<ActionButton onClick={openNew} icon={Plus} variant="primary">New Reservation</ActionButton>} />

      {rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No reservations yet" desc="Create a reservation request to book a room. It will appear here with its approval status." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="divide-y divide-slate-50">
            {rows.map((r) => {
              const editable = (r.status || '').toUpperCase() === 'PENDING';
              const cancellable = !['APPROVED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes((r.status || '').toUpperCase());
              return (
                <div key={r.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                      <Badge text={r.status} className={reservationStatusBadge(r.status)} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{r.roomName || '—'} · {fmtDateTime(r.startTime)} – {fmtDateTime(r.endTime)}</p>
                    {r.rejectionReason && <p className="text-[11px] text-rose-500 mt-0.5">Rejected: {r.rejectionReason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {editable && <ActionButton onClick={() => openEdit(r)} icon={Pencil}>Edit</ActionButton>}
                    {cancellable && <ActionButton onClick={() => cancel(r)} icon={Ban} variant="danger">Cancel</ActionButton>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Reservation' : 'New Reservation'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            {!editing && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className={labelCls}>Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>Start</label><input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>End</label><input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} className={inputCls} /></div>
                </div>
                <button onClick={searchRooms} disabled={roomsLoading} className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  <Building2 className="w-4 h-4" />{roomsLoading ? 'Searching…' : 'Find Available Rooms'}
                </button>
                {rooms.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-100 rounded-xl p-2">
                    {rooms.map((rm) => (
                      <button key={rm.id} onClick={() => setRoom(rm)} disabled={!rm.selectable}
                        className={`w-full text-left p-2.5 rounded-lg border transition ${room?.id === rm.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'} disabled:opacity-40`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">{rm.roomName}</span>
                          {room?.id === rm.id && <Check className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{rm.facilityName}</span>
                          <span className="inline-flex items-center gap-1"><UsersIcon className="w-3 h-3" />{rm.capacity ?? '—'} seats</span>
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div><label className={labelCls}>Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Meeting title" /></div>
            <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} rows={2} /></div>
            <div><label className={labelCls}>Expected Attendees</label><input type="number" min={0} value={form.expectedAttendees} onChange={e => setForm({ ...form, expectedAttendees: e.target.value })} className={inputCls} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton onClick={() => setShowModal(false)}>Cancel</ActionButton>
              <ActionButton onClick={editing ? submitEdit : submitCreate} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save Changes' : 'Submit Request')}</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {node}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------------

export const EmpVisitorsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { show, node } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phoneNumber: '', company: '', purposeOfVisit: '', expectedArrival: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await employeeService.getVisitors()); }
    catch (e: any) { setError(e?.message || 'Failed to load visitors'); }
    finally { setLoading(false); }
  }, [retry]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ fullName: '', email: '', phoneNumber: '', company: '', purposeOfVisit: '', expectedArrival: '' });
    setShowModal(true);
  };
  useEffect(() => {
    if (searchParams.get('new') === '1') { openNew(); searchParams.delete('new'); setSearchParams(searchParams, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openEdit = (v: any) => {
    setEditing(v);
    setForm({
      fullName: v.fullName || '', email: v.email || '', phoneNumber: v.phoneNumber || '',
      company: v.company || '', purposeOfVisit: v.purposeOfVisit || '',
      expectedArrival: v.expectedArrival ? new Date(v.expectedArrival).toISOString().slice(0, 16) : '',
    });
    setShowModal(true);
  };

  const submit = async () => {
    if (!form.fullName.trim() || !form.email.trim() || !form.purposeOfVisit.trim() || !form.expectedArrival) {
      show('Name, email, purpose, and arrival are required.', 'err'); return;
    }
    setSaving(true);
    const body = { ...form, expectedArrival: `${form.expectedArrival}:00`.slice(0, 19) };
    try {
      if (editing) { await employeeService.updateVisitor(editing.id, body); show('Visitor updated.'); }
      else { await employeeService.createVisitor(body); show('Visitor registered.'); }
      setShowModal(false); setRetry(r => r + 1);
    } catch (e: any) { show(e?.response?.data?.message || 'Failed to save visitor', 'err'); }
    finally { setSaving(false); }
  };

  if (loading && !rows.length) return <LoadingSkeleton />;
  if (error && !rows.length) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Visitor Management" subtitle="Register visitors and monitor their status"
        action={<ActionButton onClick={openNew} icon={Plus} variant="primary">Register Visitor</ActionButton>} />

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No visitors yet" desc="Register a visitor to generate a visit record. You can edit it before check-in." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="divide-y divide-slate-50">
            {rows.map((v) => {
              const editable = (v.status || '').toUpperCase() === 'REGISTERED';
              return (
                <div key={v.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{v.fullName}</p>
                      <Badge text={v.status} className={visitorStatusBadge(v.status)} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{v.company || '—'} · {v.purposeOfVisit}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Expected {fmtDateTime(v.expectedArrival)}</p>
                  </div>
                  {editable && <ActionButton onClick={() => openEdit(v)} icon={Pencil}>Edit</ActionButton>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Visitor' : 'Register Visitor'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div><label className={labelCls}>Full Name</label><input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>Phone</label><input value={form.phoneNumber} onChange={e => setForm({ ...form, phoneNumber: e.target.value })} className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>Company</label><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Purpose of Visit</label><input value={form.purposeOfVisit} onChange={e => setForm({ ...form, purposeOfVisit: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Expected Arrival</label><input type="datetime-local" value={form.expectedArrival} onChange={e => setForm({ ...form, expectedArrival: e.target.value })} className={inputCls} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton onClick={() => setShowModal(false)}>Cancel</ActionButton>
              <ActionButton onClick={submit} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save Changes' : 'Register')}</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {node}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const EmpDocumentsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { show, node } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', fileName: '', fileType: 'application/pdf', classificationLevel: 'INTERNAL' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await employeeService.getDocuments()); }
    catch (e: any) { setError(e?.message || 'Failed to load documents'); }
    finally { setLoading(false); }
  }, [retry]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ title: '', fileName: '', fileType: 'application/pdf', classificationLevel: 'INTERNAL' }); setShowModal(true); };
  useEffect(() => {
    if (searchParams.get('new') === '1') { openNew(); searchParams.delete('new'); setSearchParams(searchParams, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const submit = async () => {
    if (!form.title.trim() || !form.fileName.trim()) { show('Title and file name are required.', 'err'); return; }
    setSaving(true);
    try { await employeeService.createDocument(form); show('Document uploaded.'); setShowModal(false); setRetry(r => r + 1); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed to upload', 'err'); }
    finally { setSaving(false); }
  };

  if (loading && !rows.length) return <LoadingSkeleton />;
  if (error && !rows.length) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Documents" subtitle="Upload documents and track approval status"
        action={<ActionButton onClick={openNew} icon={Upload} variant="primary">Upload Document</ActionButton>} />

      <DocumentUploadPanel
        title="Upload a Real File"
        subtitle="Attach an actual file — it is stored on the file server, OCR-scanned, classified by AI, then queued for compliance review."
        onUploaded={() => setRetry(r => r + 1)}
      />

      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" desc="Upload document metadata to submit it for review. Approved documents can be downloaded." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="divide-y divide-slate-50">
            {rows.map((d) => {
              const approved = (d.status || '').toUpperCase() === 'APPROVED';
              return (
                <div key={d.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{d.title}</p>
                      <Badge text={(d.status || '').replace(/_/g, ' ')} className={docStatusBadge(d.status)} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{d.fileName} · {d.classificationLevel}</p>
                  </div>
                  <ActionButton onClick={() => { if (d.supabaseStorageUrl) window.open(d.supabaseStorageUrl, '_blank'); else show('No file available to download.', 'err'); }} icon={Download} disabled={!approved}>Download</ActionButton>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <Modal title="Upload Document" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div><label className={labelCls}>Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>File Name</label><input value={form.fileName} onChange={e => setForm({ ...form, fileName: e.target.value })} className={inputCls} placeholder="e.g. report.pdf" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>File Type</label><input value={form.fileType} onChange={e => setForm({ ...form, fileType: e.target.value })} className={inputCls} /></div>
              <div>
                <label className={labelCls}>Classification</label>
                <select value={form.classificationLevel} onChange={e => setForm({ ...form, classificationLevel: e.target.value })} className={inputCls}>
                  {['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].map(c => <option key={c} value={c} className="bg-white text-slate-900">{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton onClick={() => setShowModal(false)}>Cancel</ActionButton>
              <ActionButton onClick={submit} icon={Upload} variant="primary" disabled={saving}>{saving ? 'Uploading…' : 'Upload'}</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {node}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const EmpRequestsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { show, node } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'CONTRACT', title: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await employeeService.getRequests()); }
    catch (e: any) { setError(e?.message || 'Failed to load requests'); }
    finally { setLoading(false); }
  }, [retry]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ type: 'CONTRACT', title: '', description: '' }); setShowModal(true); };
  useEffect(() => {
    if (searchParams.get('new') === '1') { openNew(); searchParams.delete('new'); setSearchParams(searchParams, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const submit = async () => {
    if (!form.title.trim()) { show('Title is required.', 'err'); return; }
    setSaving(true);
    try { await employeeService.createRequest(form); show('Request submitted.'); setShowModal(false); setRetry(r => r + 1); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed to submit', 'err'); }
    finally { setSaving(false); }
  };

  const cancel = async (r: any) => {
    if (!window.confirm(`Cancel request "${r.title}"?`)) return;
    try { await employeeService.cancelRequest(r.id); show('Request cancelled.'); setRetry(x => x + 1); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed to cancel', 'err'); }
  };

  if (loading && !rows.length) return <LoadingSkeleton />;
  if (error && !rows.length) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Requests" subtitle="Submit contract and legal requests and track their status"
        action={<ActionButton onClick={openNew} icon={Plus} variant="primary">Submit Request</ActionButton>} />

      {rows.length === 0 ? (
        <EmptyState icon={FileSignature} title="No requests yet" desc="Submit a contract or legal request. You can cancel it while it's still pending or in review." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="divide-y divide-slate-50">
            {rows.map((r) => {
              const cancellable = ['PENDING', 'IN_REVIEW'].includes((r.status || '').toUpperCase());
              return (
                <div key={r.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                      <Badge text={r.type} className="bg-slate-100 text-slate-600" />
                      <Badge text={(r.status || '').replace(/_/g, ' ')} className={requestStatusBadge(r.status)} />
                    </div>
                    {r.description && <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>}
                    {r.decisionNotes && <p className="text-[11px] text-slate-400 mt-0.5">Notes: {r.decisionNotes}</p>}
                  </div>
                  {cancellable && <ActionButton onClick={() => cancel(r)} icon={Ban} variant="danger">Cancel</ActionButton>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <Modal title="Submit Request" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
                <option value="CONTRACT" className="bg-white text-slate-900">Contract</option>
                <option value="LEGAL" className="bg-white text-slate-900">Legal</option>
              </select>
            </div>
            <div><label className={labelCls}>Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} rows={3} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton onClick={() => setShowModal(false)}>Cancel</ActionButton>
              <ActionButton onClick={submit} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit'}</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {node}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const notifDot = (type?: string) => {
  switch ((type || '').toUpperCase()) {
    case 'APPROVAL': return 'bg-emerald-500';
    case 'REJECTION': return 'bg-rose-500';
    case 'REMINDER': return 'bg-amber-500';
    default: return 'bg-blue-500';
  }
};

export const EmpNotificationsPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { show, node } = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await employeeService.getNotifications()); }
    catch (e: any) { setError(e?.message || 'Failed to load notifications'); }
    finally { setLoading(false); }
  }, [retry]);
  useEffect(() => { load(); }, [load]);

  const markRead = async (n: any) => {
    try { await employeeService.markNotificationRead(n.id); setRetry(r => r + 1); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed', 'err'); }
  };
  const markAll = async () => {
    try { await employeeService.markAllNotificationsRead(); show('All marked as read.'); setRetry(r => r + 1); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed', 'err'); }
  };
  const dismiss = async (n: any) => {
    try { await employeeService.dismissNotification(n.id); show('Dismissed.'); setRetry(r => r + 1); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed', 'err'); }
  };

  if (loading && !rows.length) return <LoadingSkeleton />;
  if (error && !rows.length) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  const anyUnread = rows.some(n => !n.read);

  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" subtitle="Approval alerts, rejections, and reminders"
        action={anyUnread ? <ActionButton onClick={markAll} icon={Check} variant="primary">Mark all read</ActionButton> : undefined} />

      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" desc="You're all caught up. Approval, rejection, and reminder alerts will appear here." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="divide-y divide-slate-50">
            {rows.map((n) => (
              <div key={n.id} className={`p-4 flex items-start gap-3 transition-colors ${n.read ? '' : 'bg-emerald-50/40'}`}>
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${notifDot(n.type)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <Badge text={n.type} className="bg-slate-100 text-slate-600" />
                    {!n.read && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">NEW</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{fmtDateTime(n.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!n.read && <ActionButton onClick={() => markRead(n)} icon={Check}>Read</ActionButton>}
                  <ActionButton onClick={() => dismiss(n)} icon={Trash2} variant="danger">Dismiss</ActionButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {node}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const EmpProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const { show, node } = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', phoneNumber: '', department: '', position: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = await employeeService.getProfile();
      setProfile(p);
      setForm({ firstName: p.firstName || '', lastName: p.lastName || '', phoneNumber: p.phoneNumber || '', department: p.department || '', position: p.position || '' });
    } catch (e: any) { setError(e?.message || 'Failed to load profile'); }
    finally { setLoading(false); }
  }, [retry]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try { const p = await employeeService.updateProfile(form); setProfile(p); show('Profile updated.'); }
    catch (e: any) { show(e?.response?.data?.message || 'Failed to update', 'err'); }
    finally { setSaving(false); }
  };

  if (loading && !profile) return <LoadingSkeleton />;
  if (error && !profile) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" subtitle="Your account details" />
      <div className="card-stat p-6 max-w-2xl space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xl">
            {(profile?.firstName || 'E').charAt(0)}
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{profile?.fullName}</p>
            <p className="text-xs text-slate-500 font-mono">{profile?.email} · {profile?.employeeId}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>First Name</label><input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Last Name</label><input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Phone</label><input value={form.phoneNumber} onChange={e => setForm({ ...form, phoneNumber: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Department</label><input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={inputCls} /></div>
          <div><label className={labelCls}>Position</label><input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className={inputCls} /></div>
        </div>
        <div className="flex justify-end pt-2">
          <ActionButton onClick={save} icon={CheckCircle2} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</ActionButton>
        </div>
      </div>
      {node}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const EmpSettingsPage: React.FC = () => (
  <div className="space-y-5">
    <PageHeader title="Settings" subtitle="Preferences for your self-service portal" />
    <div className="card-stat p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Email notifications</p>
          <p className="text-xs text-slate-500">Receive approval and rejection alerts by email.</p>
        </div>
        <span className="text-[11px] font-mono px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">Enabled</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Reservation reminders</p>
          <p className="text-xs text-slate-500">Get reminders before your upcoming reservations.</p>
        </div>
        <span className="text-[11px] font-mono px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">Enabled</span>
      </div>
      <p className="text-[11px] text-slate-400 pt-2 flex items-center gap-1.5"><Settings className="w-3.5 h-3.5" />Preference management is read-only in this build.</p>
    </div>
  </div>
);
