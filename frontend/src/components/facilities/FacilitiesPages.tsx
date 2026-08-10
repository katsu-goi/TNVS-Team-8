import React, { useEffect, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, Calendar, CheckSquare, XSquare, Building2, ClipboardList, BarChart3, Bell, User, Settings, Plus, X, Wrench, Loader2, Save, Sparkles, Mail, CalendarClock, DoorOpen, FileText, ChevronLeft, ChevronRight, Clock, MapPin, AlertTriangle } from 'lucide-react';
import { facilitiesService } from '../../api/facilitiesService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { TimePicker } from '../ui/TimePicker';

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

/** Two-initial avatar seed from a full name. */
function nameInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** "8 Aug 2026" from an ISO / parseable date string. */
function formatDay(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw || '—';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2:00 PM – 3:30 PM" from two ISO datetimes. */
function formatTimeRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isNaN(s.getTime())) return '—';
  return isNaN(e.getTime()) ? fmt(s) : `${fmt(s)} – ${fmt(e)}`;
}

/** Labeled field cell for the approval card grid. */
const ApprovalField: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-start gap-2 min-w-0">
    {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate text-xs font-semibold text-slate-800" title={value}>{value || '—'}</p>
    </div>
  </div>
);

export const ReservationsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const d = await facilitiesService.getReservations(params);
      setData(d);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const revisionRes = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revisionRes > 0) setRetry(r => r + 1); }, [revisionRes]);

  if (loading && !data) return <LoadingSkeleton />;
  if (error && !data) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;
  if (!data) return null;

  const overview = data.overview || {};
  const reservations = data.reservations || [];

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reservations</h2>
          <p className="text-xs text-slate-500">Manage room bookings</p>
        </div>
        <div className="flex items-center space-x-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600">
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>

      {Object.keys(overview).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Pending', value: overview.pending ?? 0, color: 'text-amber-500' },
            { label: 'Approved', value: overview.approved ?? 0, color: 'text-emerald-600' },
            { label: 'Rejected', value: overview.rejected ?? 0, color: 'text-rose-500' },
            { label: "Today's", value: overview.todaysReservations ?? 0, color: 'text-blue-500' },
            { label: 'Upcoming', value: overview.upcomingReservations ?? 0, color: 'text-indigo-500' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {reservations.length === 0 ? (
        <EmptyState icon={Calendar} title="No Reservations" desc="No reservations have been created yet." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Title</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Employee</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Room</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Date/Time</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{r.title}</td>
                    <td className="p-3 text-slate-600">
                      <p>{r.employeeName}</p>
                      <p className="text-[10px] text-slate-400">{r.employeeDepartment}</p>
                    </td>
                    <td className="p-3 text-slate-600">
                      <p>{r.roomName}</p>
                      <p className="text-[10px] text-slate-400">{r.roomNumber} · Floor {r.floorNumber}</p>
                    </td>
                    <td className="p-3 text-slate-600">
                      <p className="text-xs">{new Date(r.startTime).toLocaleDateString()}</p>
                      <p className="text-[10px] text-slate-400">{new Date(r.startTime).toLocaleTimeString()} - {new Date(r.endTime).toLocaleTimeString()}</p>
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' :
                        r.status === 'PENDING' ? 'bg-amber-50 text-amber-600' :
                        r.status === 'REJECTED' ? 'bg-rose-50 text-rose-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const ApprovalPage: React.FC = () => {
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await facilitiesService.getReservations({ status: 'PENDING' });
      setReservations(d.reservations || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const revision = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  const handleApprove = async (id: string) => {
    await facilitiesService.approveReservation(id);
    setReservations(prev => prev.filter(r => r.id !== id));
  };

  const handleReject = async (id: string) => {
    await facilitiesService.rejectReservation(id);
    setReservations(prev => prev.filter(r => r.id !== id));
  };

  const [aiSuggestions, setAiSuggestions] = useState<Record<string, any>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

  const handleAiSuggestApproval = async (id: string) => {
    setAiLoadingId(id);
    try {
      const data = await facilitiesService.aiSuggestApproval(id);
      setAiSuggestions(prev => ({ ...prev, [id]: data }));
    } catch {
      setAiSuggestions(prev => ({ ...prev, [id]: { recommendation: 'UNAVAILABLE', aiSummary: 'AI assistant is temporarily unavailable.', reasons: [], score: 0 } }));
    } finally {
      setAiLoadingId(null);
    }
  };

  const aiRecLabel = (r: string): { text: string; cls: string } => {
    switch (r) {
      case 'APPROVE': return { text: 'AI: Recommend Approve', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'REJECT': return { text: 'AI: Recommend Reject', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'UNAVAILABLE': return { text: 'AI: Unavailable', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
      default: return { text: 'AI: Review', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
  };

  if (loading && reservations.length === 0) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reservation Approval Queue</h2>
          <p className="text-xs text-slate-500">Review each request and approve or reject it</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
            {reservations.length} {reservations.length === 1 ? 'request' : 'requests'}
          </span>
          <button onClick={() => setRetry(r => r + 1)} className="rounded-lg border border-slate-200 bg-slate-100 p-2 transition hover:bg-slate-200" title="Refresh"><RefreshCw className="h-4 w-4 text-slate-400" /></button>
        </div>
      </div>

      {reservations.length === 0 ? (
        <div className="card-stat flex min-h-40 flex-col items-center justify-center border-dashed px-4 text-center">
          <CheckSquare className="mb-2 h-7 w-7 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No pending approvals</p>
          <p className="mt-1 text-xs text-slate-400">All reservation requests have been reviewed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {reservations.map((r: any) => {
            const ai = aiSuggestions[r.id];
            return (
              <article key={r.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                {/* Header: icon + reservation number + status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <DoorOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reservation number</p>
                      <p className="truncate font-mono text-sm font-bold text-slate-900">#{r.id?.slice(0, 8)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">{r.status ?? 'PENDING'}</span>
                </div>

                <div className="my-3 border-t border-slate-100" />

                {/* Two-column labeled info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <ApprovalField label="Requester" value={r.employeeName} icon={<span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">{nameInitials(r.employeeName)}</span>} />
                  <ApprovalField label="Date" value={formatDay(r.startTime)} icon={<Calendar className="h-4 w-4 text-slate-400" />} />
                  <ApprovalField label="E-mail" value={r.employeeEmail} icon={<Mail className="h-4 w-4 text-slate-400" />} />
                  <ApprovalField label="Time" value={formatTimeRange(r.startTime, r.endTime)} icon={<CalendarClock className="h-4 w-4 text-slate-400" />} />
                  <ApprovalField label="Room" value={r.roomName ? `${r.roomName}${r.roomNumber ? ` (${r.roomNumber})` : ''}` : ''} icon={<Building2 className="h-4 w-4 text-slate-400" />} />
                  <ApprovalField label="Purpose" value={r.title ? `${r.title}${r.description ? ` – ${r.description}` : ''}` : ''} icon={<FileText className="h-4 w-4 text-slate-400" />} />
                </div>

                {/* AI recommendation */}
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {!ai ? (
                    <button
                      onClick={() => handleAiSuggestApproval(r.id)}
                      disabled={aiLoadingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                    >
                      {aiLoadingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {aiLoadingId === r.id ? 'Analyzing…' : 'Get AI Recommendation'}
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${aiRecLabel(ai.recommendation).cls}`}>
                          <Sparkles className="h-3 w-3" />
                          {aiRecLabel(ai.recommendation).text}
                        </span>
                        {ai.score != null && (
                          <span className="font-mono text-[10px] text-slate-400">score {ai.score}</span>
                        )}
                      </div>
                      {ai.aiSummary && (
                        <p className="text-[11px] text-slate-600">{ai.aiSummary}</p>
                      )}
                      {(ai.reasons ?? []).length > 0 && (
                        <ul className="space-y-1">
                          {(ai.reasons as any[]).map((f: any, i: number) => (
                            <li key={i} className={`border-l-2 pl-2 text-[10px] ${
                              f.kind === 'ERROR' ? 'border-rose-300 text-rose-700'
                                : f.kind === 'WARNING' ? 'border-amber-300 text-amber-700'
                                  : f.kind === 'POSITIVE' ? 'border-emerald-300 text-emerald-700'
                                    : 'border-slate-300 text-slate-500'
                            }`}>{f.message}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <button onClick={() => handleReject(r.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50" title="Reject request">
                    <XSquare className="mr-1.5 inline-block h-3.5 w-3.5" />Reject
                  </button>
                  <button onClick={() => handleApprove(r.id)} className="ml-auto inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700" title="Approve request">
                    <CheckSquare className="mr-1.5 h-3.5 w-3.5" />Approve
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const RoomsPage: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [addForm, setAddForm] = useState({
    facilityId: '', name: '', roomNumber: '', type: 'CONFERENCE_ROOM', floorNumber: '',
    building: '', capacity: '', openTime: '08:00', closeTime: '18:00', status: 'VACANT',
    hasProjector: false, hasVideoConference: false, hasWhiteboard: false,
    amenities: '',
  });

  const [maintRoom, setMaintRoom] = useState<any>(null);
  const [maintForm, setMaintForm] = useState({ title: 'Scheduled Maintenance', description: '', startTime: '', endTime: '', assignedTo: '', markUnavailable: true });
  const [maintSaving, setMaintSaving] = useState(false);

  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [facilityForm, setFacilityForm] = useState({ name: '', code: '', type: 'HEADQUARTERS', city: '', country: '' });
  const [facilitySaving, setFacilitySaving] = useState(false);
  const [facilityError, setFacilityError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([facilitiesService.getRoomSummary(), facilitiesService.getAllRooms()]);
      setSummary(s);
      setRooms(r);
      try {
        setFacilities(await facilitiesService.getFacilities());
      } catch {
        setFacilities([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const revision = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!addForm.facilityId) { setFormError('Please select a facility.'); return; }
    if (!addForm.name.trim()) { setFormError('Room name is required.'); return; }
    setSaving(true);
    try {
      await facilitiesService.createRoom({
        facilityId: addForm.facilityId,
        name: addForm.name.trim(),
        roomNumber: addForm.roomNumber.trim(),
        type: addForm.type,
        floorNumber: addForm.floorNumber ? Number(addForm.floorNumber) : null,
        building: addForm.building.trim() || null,
        capacity: addForm.capacity ? Number(addForm.capacity) : null,
        openTime: addForm.openTime,
        closeTime: addForm.closeTime,
        status: addForm.status,
        hasProjector: addForm.hasProjector,
        hasVideoConference: addForm.hasVideoConference,
        hasWhiteboard: addForm.hasWhiteboard,
        active: true,
        amenities: addForm.amenities.split(',').map((a: string) => a.trim()).filter(Boolean),
      });
      setShowAddModal(false);
      setAddForm({ facilityId: '', name: '', roomNumber: '', type: 'CONFERENCE_ROOM', floorNumber: '', building: '', capacity: '', openTime: '08:00', closeTime: '18:00', status: 'VACANT', hasProjector: false, hasVideoConference: false, hasWhiteboard: false, amenities: '' });
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Unable to create room. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (room: any, status: string) => {
    try {
      await facilitiesService.updateRoom(room.id, { status });
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Unable to update room status.');
    }
  };

  const handleScheduleMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setMaintSaving(true);
    try {
      await facilitiesService.scheduleMaintenance(maintRoom.id, {
        title: maintForm.title,
        description: maintForm.description,
        startTime: maintForm.startTime,
        endTime: maintForm.endTime,
        assignedTo: maintForm.assignedTo,
        markUnavailable: maintForm.markUnavailable,
      });
      setMaintRoom(null);
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Unable to schedule maintenance.');
    } finally {
      setMaintSaving(false);
    }
  };

  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    setFacilityError('');
    if (!facilityForm.name.trim() || !facilityForm.code.trim()) {
      setFacilityError('Facility name and code are required.');
      return;
    }
    setFacilitySaving(true);
    try {
      const created = await facilitiesService.createFacility({
        name: facilityForm.name.trim(),
        code: facilityForm.code.trim().toUpperCase(),
        type: facilityForm.type,
        city: facilityForm.city.trim() || null,
        country: facilityForm.country.trim() || null,
        totalCapacity: null,
        active: true,
      });
      setShowFacilityModal(false);
      setFacilityForm({ name: '', code: '', type: 'HEADQUARTERS', city: '', country: '' });
      setAddForm(f => ({ ...f, facilityId: created.id }));
      load();
    } catch (err: any) {
      setFacilityError(err?.response?.data?.message ?? 'Unable to create facility. Please try again.');
    } finally {
      setFacilitySaving(false);
    }
  };

  if (loading && rooms.length === 0) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  const statusBadge = (status: string | undefined | null, active?: boolean) => {
    if (!active) return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">INACTIVE</span>;
    const map: Record<string, string> = {
      VACANT: 'bg-emerald-50 text-emerald-600',
      OCCUPIED: 'bg-amber-50 text-amber-600',
      MAINTENANCE: 'bg-rose-50 text-rose-600',
      OUT_OF_SERVICE: 'bg-slate-100 text-slate-500',
    };
    return <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${map[status ?? ''] ?? 'bg-slate-100 text-slate-500'}`}>{status ?? 'VACANT'}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Room Management</h2>
          <p className="text-xs text-slate-500">Manage rooms, availability status, and maintenance schedules</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => { setFacilityError(''); setShowFacilityModal(true); }} className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm" title="Add a facility/building before adding rooms">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>Add Facility</span>
          </button>
          <button onClick={() => { setFormError(''); setShowAddModal(true); }} className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Add Room</span>
          </button>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Rooms', value: summary.totalRooms ?? 0, color: 'text-slate-900' },
            { label: 'Available', value: summary.availableRooms ?? 0, color: 'text-emerald-600' },
            { label: 'Occupied', value: summary.occupiedRooms ?? 0, color: 'text-amber-500' },
            { label: 'Reserved', value: summary.reservedRooms ?? 0, color: 'text-blue-500' },
            { label: 'Under Maintenance', value: summary.maintenanceRooms ?? 0, color: 'text-rose-500' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {rooms.length === 0 ? (
        <EmptyState icon={Building2} title="No Rooms" desc="No rooms have been configured in the system. Use 'Add Room' to register the first room." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Room</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Floor / Building</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Type</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Capacity</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Hours</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Facility</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">
                      {r.name} ({r.roomNumber})
                      {r.amenities?.length > 0 && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{r.amenities.join(' · ')}</div>
                      )}
                    </td>
                    <td className="p-3 text-slate-600">{r.floorNumber ?? '-'}{r.building ? ` / ${r.building}` : ''}</td>
                    <td className="p-3 text-slate-600">{r.type?.replace(/_/g, ' ')}</td>
                    <td className="p-3 text-slate-600">{r.capacity ?? '-'}</td>
                    <td className="p-3 text-slate-600 font-mono text-xs">{r.openTime ? `${String(r.openTime).slice(0, 5)}–${String(r.closeTime).slice(0, 5)}` : '24h'}</td>
                    <td className="p-3 text-slate-600">{r.facilityName}</td>
                    <td className="p-3">{statusBadge(r.status, r.active)}</td>
                    <td className="p-3">
                      <div className="flex items-center space-x-1.5">
                        <select
                          value={r.status ?? 'VACANT'}
                          onChange={e => handleUpdateStatus(r, e.target.value)}
                          className="text-[10px] font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none"
                        >
                          <option value="VACANT">Vacant</option>
                          <option value="OCCUPIED">Occupied</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          <option value="OUT_OF_SERVICE">Out of Service</option>
                        </select>
                        <button
                          onClick={() => setMaintRoom(r)}
                          className="px-2 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-semibold text-[10px] inline-flex items-center space-x-1"
                          title="Schedule Maintenance"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>Maint</span>
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2"><Building2 className="w-5 h-5 text-emerald-400" /> Add New Room</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddRoom} className="p-5 overflow-y-auto space-y-3.5 text-xs">
              {formError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-medium">{formError}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Facility *</label>
                  <div className="flex items-center gap-2">
                    <select required value={addForm.facilityId} onChange={e => setAddForm({ ...addForm, facilityId: e.target.value })} className="flex-1 mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none">
                      <option value="">Select facility</option>
                      {facilities.map((f: any) => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setFacilityError(''); setShowFacilityModal(true); }}
                      className="mt-1 px-2.5 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold text-[10px] shrink-0"
                      title="Add a new facility"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {facilities.length === 0 && <p className="text-[10px] text-amber-600 mt-1">No facilities yet — add one first or use the + button.</p>}
                </div>
                <div>
                  <label className="font-bold text-slate-700">Room Name *</label>
                  <input type="text" required value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Boardroom A" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Room Number</label>
                  <input type="text" value={addForm.roomNumber} onChange={e => setAddForm({ ...addForm, roomNumber: e.target.value })} placeholder="e.g. 12A" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Room Type *</label>
                  <select required value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none">
                    {['CONFERENCE_ROOM', 'MEETING_ROOM', 'TRAINING_ROOM', 'EXECUTIVE_BOARDROOM', 'AUDITORIUM', 'WORKSTATION_POD', 'EVENT_HALL'].map(t => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700">Initial Status</label>
                  <select value={addForm.status} onChange={e => setAddForm({ ...addForm, status: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none">
                    <option value="VACANT">Vacant</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="OUT_OF_SERVICE">Out of Service</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Floor Number</label>
                  <input type="number" value={addForm.floorNumber} onChange={e => setAddForm({ ...addForm, floorNumber: e.target.value })} placeholder="e.g. 12" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Building</label>
                  <input type="text" value={addForm.building} onChange={e => setAddForm({ ...addForm, building: e.target.value })} placeholder="e.g. Main Tower" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Capacity</label>
                  <input type="number" value={addForm.capacity} onChange={e => setAddForm({ ...addForm, capacity: e.target.value })} placeholder="e.g. 20" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Open Time</label>
                  <TimePicker value={addForm.openTime} onChange={t => setAddForm({ ...addForm, openTime: t })} placeholder="Select open time" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Close Time</label>
                  <TimePicker value={addForm.closeTime} onChange={t => setAddForm({ ...addForm, closeTime: t })} minTime={addForm.openTime} align="right" placeholder="Select close time" />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Amenities</label>
                <input type="text" value={addForm.amenities} onChange={e => setAddForm({ ...addForm, amenities: e.target.value })} placeholder="Comma separated, e.g. HD Projector, Whiteboard, Video Conferencing" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                {([
                  { key: 'hasProjector', label: 'Projector' },
                  { key: 'hasVideoConference', label: 'Video Conference' },
                  { key: 'hasWhiteboard', label: 'Whiteboard' },
                ] as const).map(opt => (
                  <label key={opt.key} className="flex items-center space-x-2 text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addForm[opt.key]}
                      onChange={e => setAddForm({ ...addForm, [opt.key]: e.target.checked })}
                      className="w-3.5 h-3.5 accent-emerald-600"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 inline-flex items-center space-x-1.5 disabled:opacity-60">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{saving ? 'Saving…' : 'Create Room'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFacilityModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2"><Building2 className="w-5 h-5 text-emerald-400" /> Add New Facility</h3>
              <button onClick={() => setShowFacilityModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateFacility} className="p-5 space-y-3.5 text-xs">
              {facilityError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-medium">{facilityError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Facility Name *</label>
                  <input type="text" required value={facilityForm.name} onChange={e => setFacilityForm({ ...facilityForm, name: e.target.value })} placeholder="e.g. HQ Tower" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Code *</label>
                  <input type="text" required value={facilityForm.code} onChange={e => setFacilityForm({ ...facilityForm, code: e.target.value })} placeholder="e.g. HQ1" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none uppercase" />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700">Type</label>
                <select value={facilityForm.type} onChange={e => setFacilityForm({ ...facilityForm, type: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none">
                  {['HEADQUARTERS', 'REGIONAL_OFFICE', 'OPERATIONS_HUB', 'MAINTENANCE_DEPOT', 'LOGISTICS_CENTER'].map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">City</label>
                  <input type="text" value={facilityForm.city} onChange={e => setFacilityForm({ ...facilityForm, city: e.target.value })} placeholder="e.g. Manila" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Country</label>
                  <input type="text" value={facilityForm.country} onChange={e => setFacilityForm({ ...facilityForm, country: e.target.value })} placeholder="e.g. PH" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div className="pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowFacilityModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={facilitySaving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 inline-flex items-center space-x-1.5 disabled:opacity-60">
                  {facilitySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{facilitySaving ? 'Saving…' : 'Create Facility'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {maintRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2"><Wrench className="w-5 h-5 text-rose-400" /> Schedule Maintenance</h3>
              <button onClick={() => setMaintRoom(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleScheduleMaintenance} className="p-5 space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                Room: <strong className="text-slate-900">{maintRoom.name}</strong> ({maintRoom.facilityName})
              </div>
              <div>
                <label className="font-bold text-slate-700">Maintenance Title *</label>
                <input type="text" required value={maintForm.title} onChange={e => setMaintForm({ ...maintForm, title: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Start Date/Time *</label>
                  <input type="datetime-local" required value={maintForm.startTime} onChange={e => setMaintForm({ ...maintForm, startTime: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">End Date/Time *</label>
                  <input type="datetime-local" required value={maintForm.endTime} onChange={e => setMaintForm({ ...maintForm, endTime: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700">Description / Notes</label>
                <textarea rows={2} value={maintForm.description} onChange={e => setMaintForm({ ...maintForm, description: e.target.value })} className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="font-bold text-slate-700">Assigned To</label>
                <input type="text" value={maintForm.assignedTo} onChange={e => setMaintForm({ ...maintForm, assignedTo: e.target.value })} placeholder="e.g. Maintenance Team" className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>
              <label className="flex items-center space-x-2 text-slate-700 font-medium cursor-pointer">
                <input type="checkbox" checked={maintForm.markUnavailable} onChange={e => setMaintForm({ ...maintForm, markUnavailable: e.target.checked })} className="w-3.5 h-3.5 accent-rose-600" />
                <span>Mark room unavailable during maintenance</span>
              </label>
              <div className="pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setMaintRoom(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={maintSaving} className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 inline-flex items-center space-x-1.5 disabled:opacity-60">
                  {maintSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                  <span>{maintSaving ? 'Scheduling…' : 'Schedule Maintenance'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================ Facility Calendar ============================ */
/* A week-based time-grid (Google/Outlook style) that surfaces conflicts,
   overlaps, room availability, and time-utilization at a glance. */

interface CalEvent {
  id: string;
  title: string;
  start: string;              // local ISO, e.g. "2026-08-09T10:00"
  end: string;
  type: 'reservation' | 'maintenance' | string;
  roomName?: string;
  status?: string;
  employeeName?: string;
  _s: Date;                   // parsed start
  _e: Date;                   // parsed end
  _col?: number;              // overlap column index
  _cols?: number;             // overlap column count in its cluster
  _conflict?: boolean;        // overlaps another event in the SAME room
}

const HOUR_PX = 52;           // vertical pixels per hour
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Midnight of `d`, cloned (no mutation of input). */
function atMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday of the week containing `d` (weeks start Monday, per the reference). */
function startOfWeek(d: Date): Date {
  const x = atMidnight(d);
  const dow = (x.getDay() + 6) % 7;   // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow);
  return x;
}

/** `d` shifted by `n` days (clone). */
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Unique {year, month} pairs (month 1-based) the 7-day week spans. */
function monthsForWeek(weekStart: Date): Array<{ year: number; month: number }> {
  const seen = new Set<string>();
  const out: Array<{ year: number; month: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!seen.has(key)) { seen.add(key); out.push({ year: d.getFullYear(), month: d.getMonth() + 1 }); }
  }
  return out;
}
/** Visual style per event, keyed on type then reservation status. */
function eventStyle(e: CalEvent): { bar: string; bg: string; text: string; dot: string } {
  if (e.type === 'maintenance') {
    return { bar: 'border-l-rose-400', bg: 'bg-rose-50 hover:bg-rose-100', text: 'text-rose-900', dot: 'bg-rose-400' };
  }
  switch ((e.status || '').toUpperCase()) {
    case 'APPROVED':
      return { bar: 'border-l-emerald-500', bg: 'bg-emerald-50 hover:bg-emerald-100', text: 'text-emerald-900', dot: 'bg-emerald-500' };
    case 'PENDING':
      return { bar: 'border-l-amber-400', bg: 'bg-amber-50 hover:bg-amber-100', text: 'text-amber-900', dot: 'bg-amber-400' };
    case 'REJECTED':
    case 'CANCELLED':
    case 'CANCELED':
      return { bar: 'border-l-slate-300', bg: 'bg-slate-100 hover:bg-slate-200', text: 'text-slate-500', dot: 'bg-slate-300' };
    default:
      return { bar: 'border-l-blue-500', bg: 'bg-blue-50 hover:bg-blue-100', text: 'text-blue-900', dot: 'bg-blue-500' };
  }
}

/** Do two events overlap in time? (touching edges do not count as overlap.) */
function overlaps(a: CalEvent, b: CalEvent): boolean {
  return a._s < b._e && b._s < a._e;
}

/**
 * Assign side-by-side columns to overlapping events within a single day, the
 * standard calendar approach: sort by start, break into clusters of mutually
 * overlapping events, greedily pack each cluster into the fewest columns.
 * Also flags `_conflict` when two overlapping events share the same room.
 */
function layoutDay(dayEvents: CalEvent[]): CalEvent[] {
  const items = [...dayEvents].sort((a, b) => a._s.getTime() - b._s.getTime() || b._e.getTime() - a._e.getTime());

  let cluster: CalEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const cols: CalEvent[][] = [];        // each col = events stacked in it
    for (const ev of cluster) {
      let placed = false;
      for (const col of cols) {
        if (!overlaps(col[col.length - 1], ev)) { col.push(ev); ev._col = cols.indexOf(col); placed = true; break; }
      }
      if (!placed) { ev._col = cols.length; cols.push([ev]); }
    }
    const total = cols.length;
    cluster.forEach(ev => { ev._cols = total; });
    cluster = [];
  };

  for (const ev of items) {
    if (cluster.length > 0 && ev._s.getTime() >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev._e.getTime());
  }
  flush();

  // Same-room conflict detection (pairwise within the day — day sizes are small).
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (overlaps(items[i], items[j]) && items[i].roomName && items[i].roomName === items[j].roomName) {
        items[i]._conflict = true; items[j]._conflict = true;
      }
    }
  }
  return items;
}

/** Fractional hour (e.g. 9.5 for 9:30) clamped to the day. */
function hourOf(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

/** Visible [startHour, endHour] window: padded around the events, business-day default. */
function timeWindow(events: CalEvent[]): [number, number] {
  let min = 8, max = 18;
  for (const e of events) {
    min = Math.min(min, Math.floor(hourOf(e._s)));
    max = Math.max(max, Math.ceil(hourOf(e._e)));
  }
  return [Math.max(0, min), Math.min(24, Math.max(max, min + 1))];
}

/** "9 AM" / "12 PM" hour label. */
function hourLabel(h: number): string {
  const period = h < 12 || h === 24 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}
export const CalendarPage: React.FC = () => {
  const [rawEvents, setRawEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [selected, setSelected] = useState<CalEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // A week can straddle a month boundary; fetch every month it touches.
      const months = monthsForWeek(weekStart);
      const batches = await Promise.all(months.map(m => facilitiesService.getCalendar(m.year, m.month)));
      const byId = new Map<string, CalEvent>();
      for (const batch of batches) {
        for (const e of (batch as any[])) {
          if (byId.has(e.id)) continue;
          const s = new Date(e.start);
          const en = new Date(e.end);
          if (isNaN(s.getTime())) continue;
          byId.set(e.id, { ...e, _s: s, _e: isNaN(en.getTime()) ? new Date(s.getTime() + 3600000) : en });
        }
      }
      setRawEvents([...byId.values()]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, weekStart]);

  useEffect(() => { load(); }, [load]);

  const revision = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);

  // Room options for the filter (from all loaded events).
  const rooms = React.useMemo(() => {
    const set = new Set<string>();
    rawEvents.forEach(e => { if (e.roomName) set.add(e.roomName); });
    return [...set].sort();
  }, [rawEvents]);

  // Events visible in this week + room filter.
  const weekEvents = React.useMemo(
    () => rawEvents.filter(e =>
      e._s >= weekStart && e._s < addDays(weekStart, 7) &&
      (roomFilter === 'ALL' || e.roomName === roomFilter)
    ),
    [rawEvents, weekStart, roomFilter]
  );

  // Group by day index (0..6) with overlap columns + conflict flags resolved per day.
  const perDay = React.useMemo(() => {
    const buckets: CalEvent[][] = Array.from({ length: 7 }, () => []);
    for (const e of weekEvents) {
      const idx = Math.floor((atMidnight(e._s).getTime() - weekStart.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) buckets[idx].push(e);
    }
    return buckets.map(layoutDay);
  }, [weekEvents, weekStart]);

  const [winStart, winEnd] = React.useMemo(() => timeWindow(weekEvents), [weekEvents]);
  const hours = Array.from({ length: winEnd - winStart }, (_, i) => winStart + i);
  const gridHeight = (winEnd - winStart) * HOUR_PX;
  const conflictCount = weekEvents.filter(e => e._conflict).length / 2; // counted pairwise

  const rangeLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  if (loading && rawEvents.length === 0) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Facility Calendar</h2>
          <p className="text-xs text-slate-500">{rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
            title="Filter by room to spot double-bookings"
          >
            <option value="ALL">All rooms</option>
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5">
            <button onClick={() => setWeekStart(w => addDays(w, -7))} className="rounded-lg p-1.5 hover:bg-slate-100" title="Previous week"><ChevronLeft className="h-4 w-4 text-slate-500" /></button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-600">Today</button>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} className="rounded-lg p-1.5 hover:bg-slate-100" title="Next week"><ChevronRight className="h-4 w-4 text-slate-500" /></button>
          </div>
          <button onClick={() => setRetry(r => r + 1)} className="rounded-lg border border-slate-200 bg-slate-100 p-2 transition hover:bg-slate-200" title="Refresh"><RefreshCw className="h-4 w-4 text-slate-400" /></button>
        </div>
      </div>

      {/* Legend + conflict summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11px] text-slate-500">
        <LegendDot className="bg-emerald-500" label="Approved" />
        <LegendDot className="bg-amber-400" label="Pending" />
        <LegendDot className="bg-rose-400" label="Maintenance" />
        <LegendDot className="bg-slate-300" label="Cancelled / rejected" />
        {conflictCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {conflictCount} scheduling {conflictCount === 1 ? 'conflict' : 'conflicts'} this week
          </span>
        )}
      </div>

      <WeekGrid
        weekDays={weekDays}
        today={today}
        perDay={perDay}
        hours={hours}
        winStart={winStart}
        gridHeight={gridHeight}
        onSelect={setSelected}
        empty={weekEvents.length === 0}
      />

      {selected && <EventDetail event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

const LegendDot: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
    {label}
  </span>
);
interface WeekGridProps {
  weekDays: Date[];
  today: Date;
  perDay: CalEvent[][];
  hours: number[];
  winStart: number;
  gridHeight: number;
  onSelect: (e: CalEvent) => void;
  empty: boolean;
}

const WeekGrid: React.FC<WeekGridProps> = ({ weekDays, today, perDay, hours, winStart, gridHeight, onSelect, empty }) => {
  const nowFrac = hourOf(today);
  const nowVisible = nowFrac >= winStart && nowFrac <= winStart + hours.length;
  const nowTop = (nowFrac - winStart) * HOUR_PX;

  return (
    <div className="card-stat overflow-hidden p-0">
      {empty && (
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
          <Calendar className="h-4 w-4 text-slate-300" />
          No reservations this week — the grid below shows full availability.
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Day header row */}
          <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
            <div className="border-r border-slate-100" />
            {weekDays.map((d, i) => {
              const isToday = sameDay(d, today);
              return (
                <div key={i} className={`border-r border-slate-100 py-2 text-center ${isToday ? 'bg-emerald-50/60' : ''}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{DAY_LABELS[i]}</p>
                  <p className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${isToday ? 'bg-emerald-600 text-white' : 'text-slate-700'}`}>
                    {d.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time grid body */}
          <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
            {/* Time axis */}
            <div className="relative border-r border-slate-100" style={{ height: gridHeight }}>
              {hours.map((h, i) => (
                <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] font-medium text-slate-400" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? '' : hourLabel(h)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((d, di) => {
              const isToday = sameDay(d, today);
              return (
                <div key={di} className={`relative border-r border-slate-100 ${isToday ? 'bg-emerald-50/30' : ''}`} style={{ height: gridHeight }}>
                  {/* hour lines */}
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * HOUR_PX }} />
                  ))}
                  {/* current-time line */}
                  {isToday && nowVisible && (
                    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                      <div className="relative">
                        <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />
                        <div className="border-t border-rose-500" />
                      </div>
                    </div>
                  )}
                  {/* events */}
                  {perDay[di].map(ev => (
                    <EventBlock key={ev.id} ev={ev} winStart={winStart} onSelect={onSelect} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const EventBlock: React.FC<{ ev: CalEvent; winStart: number; onSelect: (e: CalEvent) => void }> = ({ ev, winStart, onSelect }) => {
  const top = (hourOf(ev._s) - winStart) * HOUR_PX;
  const rawH = (hourOf(ev._e) - hourOf(ev._s)) * HOUR_PX;
  const height = Math.max(18, rawH - 2);            // min height keeps short events tappable
  const cols = ev._cols || 1;
  const col = ev._col || 0;
  const widthPct = 100 / cols;
  const s = eventStyle(ev);

  return (
    <button
      type="button"
      onClick={() => onSelect(ev)}
      title={`${ev.title} · ${formatTimeRange(ev.start, ev.end)}${ev.roomName ? ` · ${ev.roomName}` : ''}`}
      className={`absolute z-10 overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-left shadow-sm transition-shadow hover:z-30 hover:shadow-md ${s.bar} ${s.bg} ${ev._conflict ? 'ring-2 ring-rose-400 ring-offset-0' : ''}`}
      style={{
        top,
        height,
        left: `calc(${col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      <div className="flex items-center gap-1">
        {ev._conflict && <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" />}
        <p className={`truncate text-[11px] font-semibold leading-tight ${s.text}`}>{ev.title}</p>
      </div>
      {height > 30 && (
        <p className={`truncate text-[10px] leading-tight opacity-80 ${s.text}`}>
          {formatTimeRange(ev.start, ev.end)}
        </p>
      )}
      {height > 44 && ev.roomName && (
        <p className={`truncate text-[10px] leading-tight opacity-70 ${s.text}`}>{ev.roomName}</p>
      )}
    </button>
  );
};
const EventDetail: React.FC<{ event: CalEvent; onClose: () => void }> = ({ event, onClose }) => {
  const s = eventStyle(event);
  const statusText = event.type === 'maintenance' ? 'MAINTENANCE' : (event.status || '').toUpperCase();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className={`flex items-start justify-between gap-3 border-l-4 p-4 ${s.bar} ${s.bg}`}>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${s.text}`}>{event.title}</p>
            {statusText && <span className={`mt-1 inline-block rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold ${s.text}`}>{statusText}</span>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-white/60"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-4">
          {event._conflict && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Double-booked: this room has an overlapping reservation.
            </div>
          )}
          <DetailRow icon={<Clock className="h-4 w-4 text-slate-400" />} label="Time" value={`${formatDay(event.start)} · ${formatTimeRange(event.start, event.end)}`} />
          {event.roomName && <DetailRow icon={<MapPin className="h-4 w-4 text-slate-400" />} label="Room" value={event.roomName} />}
          {event.employeeName && (
            <DetailRow
              icon={<span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">{nameInitials(event.employeeName)}</span>}
              label="Requested by"
              value={event.employeeName}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-2.5">
    <div className="mt-0.5 shrink-0">{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  </div>
);

export const AssetsPage: React.FC = () => {
  const [overview, setOverview] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, a] = await Promise.all([facilitiesService.getAssetOverview(), facilitiesService.listAssets()]);
      setOverview(o);
      setAssets(a);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const revision = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  if (loading && assets.length === 0) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Asset Overview</h2>
          <p className="text-xs text-slate-500">Equipment and facility assets</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Assets', value: overview.totalAssets ?? 0, color: 'text-slate-900' },
            { label: 'Active Assets', value: overview.activeAssets ?? 0, color: 'text-emerald-600' },
            { label: 'Under Maintenance', value: overview.maintenanceAssets ?? 0, color: 'text-amber-500' },
            { label: 'Utilization Rate', value: overview.utilizationRate != null ? `${overview.utilizationRate}%` : 'N/A', color: 'text-blue-500' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {overview?.categories && Object.keys(overview.categories).length > 0 && (
        <div className="card-stat p-4">
          <h3 className="text-xs font-bold text-slate-900 mb-2">Asset Categories</h3>
          <div className="space-y-2">
            {Object.entries(overview.categories).map(([cat, count]: [string, any]) => (
              <div key={cat} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-600">{cat}</span>
                <span className="text-xs font-bold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No Assets" desc="No equipment has been registered." />
      ) : (
        <div className="card-stat overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Name</th>
                <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Category</th>
                <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Room</th>
                <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Next Maintenance</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a: any) => (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-medium text-slate-900">{a.name}</td>
                  <td className="p-3 text-slate-600">{a.category || '-'}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      a.status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-600' :
                      a.status === 'IN_USE' ? 'bg-blue-50 text-blue-600' :
                      a.status === 'UNDER_MAINTENANCE' ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>{a.status}</span>
                  </td>
                  <td className="p-3 text-slate-600">{a.roomName || '-'}</td>
                  <td className="p-3 text-xs text-slate-400 font-mono">{a.nextMaintenanceDate ? new Date(a.nextMaintenanceDate).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const ReportsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await facilitiesService.getReports();
      setData(d);
    } catch {} finally { setLoading(false); }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const revisionRep = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revisionRep > 0) setRetry(r => r + 1); }, [revisionRep]);

  if (loading && !data) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Facility Reports</h2>
          <p className="text-xs text-slate-500">Live backend data only</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.reservationReports && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><Calendar className="w-4 h-4 mr-2 text-emerald-600" />Reservation Reports</h3>
              {Object.entries(data.reservationReports).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 text-xs"><span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-bold text-slate-900">{v as any}</span></div>
              ))}
            </div>
          )}
          {data.facilityUtilization && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><Building2 className="w-4 h-4 mr-2 text-emerald-600" />Facility Utilization</h3>
              {Object.entries(data.facilityUtilization).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 text-xs"><span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-bold text-slate-900">{v as any}{k.includes('Rate') ? '%' : ''}</span></div>
              ))}
            </div>
          )}
          {data.assetReports && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><ClipboardList className="w-4 h-4 mr-2 text-emerald-600" />Asset Reports</h3>
              {Object.entries(data.assetReports).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 text-xs"><span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-bold text-slate-900">{v as any}{k.includes('Rate') ? '%' : ''}</span></div>
              ))}
            </div>
          )}
          {data.occupancyReports && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><BarChart3 className="w-4 h-4 mr-2 text-emerald-600" />Occupancy Reports</h3>
              {Object.entries(data.occupancyReports).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 text-xs"><span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-bold text-slate-900">{v as any}{k.includes('Rate') ? '%' : ''}</span></div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon={BarChart3} title="No Report Data" desc="No data available for report generation." />
      )}
    </div>
  );
};

export const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await facilitiesService.getAnalytics();
      setData(d);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load analytics.');
    } finally { setLoading(false); }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const revisionAna = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revisionAna > 0) setRetry(r => r + 1); }, [revisionAna]);

  if (loading && !data) return <LoadingSkeleton />;

  const hasData = data && Object.keys(data).length > 0;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Analytics</h2>
          <p className="text-xs text-slate-500">Live utilization and trends</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />
      ) : hasData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.monthlyReservationTrends && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Monthly Reservation Trends</h3>
              <p className="text-2xl font-bold text-emerald-600">{data.monthlyReservationTrends.total}</p>
              <p className="text-xs text-slate-500">This month</p>
            </div>
          )}
          {data.peakReservationHours && Object.keys(data.peakReservationHours).length > 0 && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Peak Reservation Hours</h3>
              <div className="space-y-1">
                {Object.entries(data.peakReservationHours).sort(([,a]: any, [,b]: any) => b - a).slice(0, 5).map(([hour, count]: [string, any]) => (
                  <div key={hour} className="flex justify-between text-xs"><span className="text-slate-600">{hour}:00</span><span className="font-bold text-slate-900">{count}</span></div>
                ))}
              </div>
            </div>
          )}
          {data.departmentDistribution && Object.keys(data.departmentDistribution).length > 0 && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Department Distribution</h3>
              <div className="space-y-1">
                {Object.entries(data.departmentDistribution).map(([dept, count]: [string, any]) => (
                  <div key={dept} className="flex justify-between text-xs"><span className="text-slate-600">{dept}</span><span className="font-bold text-slate-900">{count}</span></div>
                ))}
              </div>
            </div>
          )}
          {data.mostFrequentlyUsedRooms && data.mostFrequentlyUsedRooms.length > 0 && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Most Used Rooms</h3>
              <div className="space-y-1">
                {data.mostFrequentlyUsedRooms.slice(0, 5).map((r: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs"><span className="text-slate-600">{r.roomName} ({r.roomNumber})</span><span className="font-bold text-slate-900">{r.count} bookings</span></div>
                ))}
              </div>
            </div>
          )}
          {data.dailyRoomUtilization && (
            <div className="card-stat p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Daily Room Utilization</h3>
              <p className="text-xs text-slate-500">{Object.keys(data.dailyRoomUtilization).length} days with reservations</p>
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon={BarChart3} title="No Analytics Data" desc="No data available for analytics." />
      )}
    </div>
  );
};

export const FacilitiesNotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await facilitiesService.getReservations();
      const items = (d.reservations || []).slice(0, 15).map((r: any) => ({
        id: r.id,
        message: `${r.employeeName} ${r.status === 'PENDING' ? 'requested' : r.status === 'APPROVED' ? 'got approved for' : r.status === 'REJECTED' ? 'was rejected for' : 'cancelled'} "${r.title}"`,
        type: r.status === 'PENDING' ? 'NEW' : r.status === 'APPROVED' ? 'APPROVED' : r.status === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
        timestamp: r.createdAt,
        room: r.roomName,
      }));
      setNotifications(items);
    } catch {} finally { setLoading(false); }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const revisionN = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revisionN > 0) setRetry(r => r + 1); }, [revisionN]);

  if (loading && notifications.length === 0) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
          <p className="text-xs text-slate-500">Real-time facility updates</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No Notifications" desc="No facility notifications yet." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <div key={n.id} className={`card-stat p-3 flex items-start space-x-3 ${
              n.type === 'PENDING' || n.type === 'NEW' ? 'border-l-4 border-l-amber-400' :
              n.type === 'APPROVED' ? 'border-l-4 border-l-emerald-400' :
              n.type === 'REJECTED' ? 'border-l-4 border-l-rose-400' : ''
            }`}>
              <div className="flex-1">
                <p className="text-sm text-slate-900">{n.message}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.room}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">{n.timestamp ? new Date(n.timestamp).toLocaleString() : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Profile</h2>
          <p className="text-xs text-slate-500">Facilities Manager account</p>
        </div>
      </div>
      <EmptyState icon={User} title="Profile Settings" desc="Profile management will be available via TEAM 1 - Human Resource Management integration." />
    </div>
  );
};

export const FacilitiesSettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Settings</h2>
          <p className="text-xs text-slate-500">Facilities Manager account and module preferences</p>
        </div>
      </div>
      <EmptyState icon={Settings} title="Settings" desc="Account and module settings will be available via TEAM 1 - Human Resource Management integration." />
    </div>
  );
};
