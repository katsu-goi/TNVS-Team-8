import React, { useEffect, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, Calendar, CheckSquare, XSquare, Building2, ClipboardList, BarChart3, Bell, User, Settings, Plus, X, Wrench, Loader2, Save, Sparkles } from 'lucide-react';
import { facilitiesService } from '../../api/facilitiesService';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';

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
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reservation Approval Queue</h2>
          <p className="text-xs text-slate-500">{reservations.length} pending requests</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {reservations.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No Pending Approvals" desc="All reservation requests have been reviewed." />
      ) : (
        <div className="space-y-3">
          {reservations.map((r: any) => (
            <div key={r.id} className="card-stat p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">#{r.id?.slice(0, 8)}</span>
                    <span className="text-sm font-bold text-slate-900">{r.employeeName}</span>
                  </div>
                  <p className="text-xs text-slate-500">{r.employeeDepartment} · {r.employeeEmail}</p>
                  <p className="text-xs text-slate-700 mt-1"><strong>Room:</strong> {r.roomName} ({r.roomNumber})</p>
                  <p className="text-xs text-slate-700"><strong>Date:</strong> {new Date(r.startTime).toLocaleDateString()} <strong>Time:</strong> {new Date(r.startTime).toLocaleTimeString()} - {new Date(r.endTime).toLocaleTimeString()}</p>
                  <p className="text-xs text-slate-700"><strong>Purpose:</strong> {r.title}{r.description ? ` - ${r.description}` : ''}</p>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 inline-block mt-1">{r.status ?? 'PENDING'}</span>

                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {!aiSuggestions[r.id] ? (
                      <button
                        onClick={() => handleAiSuggestApproval(r.id)}
                        disabled={aiLoadingId === r.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-[11px] font-semibold disabled:opacity-60"
                      >
                        {aiLoadingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {aiLoadingId === r.id ? 'Analyzing…' : 'Get AI Recommendation'}
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${aiRecLabel(aiSuggestions[r.id].recommendation).cls}`}>
                            <Sparkles className="w-3 h-3" />
                            {aiRecLabel(aiSuggestions[r.id].recommendation).text}
                          </span>
                          {aiSuggestions[r.id].score != null && (
                            <span className="text-[10px] font-mono text-slate-400">score {aiSuggestions[r.id].score}</span>
                          )}
                        </div>
                        {aiSuggestions[r.id].aiSummary && (
                          <p className="text-[11px] text-slate-600">{aiSuggestions[r.id].aiSummary}</p>
                        )}
                        {(aiSuggestions[r.id].reasons ?? []).length > 0 && (
                          <ul className="space-y-1">
                            {(aiSuggestions[r.id].reasons as any[]).map((f: any, i: number) => (
                              <li key={i} className={`text-[10px] pl-2 border-l-2 ${
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
                </div>
                <div className="flex items-center space-x-2 ml-4 shrink-0">
                  <button onClick={() => handleApprove(r.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1"><CheckSquare className="w-3.5 h-3.5" /><span>Approve</span></button>
                  <button onClick={() => handleReject(r.id)} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center space-x-1"><XSquare className="w-3.5 h-3.5" /><span>Reject</span></button>
                </div>
              </div>
            </div>
          ))}
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
                  <input type="time" value={addForm.openTime} onChange={e => setAddForm({ ...addForm, openTime: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Close Time</label>
                  <input type="time" value={addForm.closeTime} onChange={e => setAddForm({ ...addForm, closeTime: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
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

export const CalendarPage: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await facilitiesService.getCalendar(viewYear, viewMonth);
      setEvents(d);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry, viewMonth, viewYear]);

  useEffect(() => { load(); }, [load]);

  const revision = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revision > 0) setRetry(r => r + 1); }, [revision]);

  if (loading && events.length === 0) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Facility Calendar</h2>
          <p className="text-xs text-slate-500">{viewMonth}/{viewYear}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => { if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); } else { setViewMonth(m => m - 1); } }} className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Prev</button>
          <button onClick={() => { setViewMonth(now.getMonth() + 1); setViewYear(now.getFullYear()); }} className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Today</button>
          <button onClick={() => { if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); } else { setViewMonth(m => m + 1); } }} className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Next</button>
          <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState icon={Calendar} title="No Events" desc="No reservations or events scheduled for this month." />
      ) : (
        <div className="space-y-2">
          {events.map((e: any) => (
            <div key={e.id} className="card-stat p-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{e.roomName} · {e.employeeName}</p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-400 font-mono">
                <p>{new Date(e.start).toLocaleDateString()}</p>
                <p>{new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await facilitiesService.getAnalytics();
      setData(d);
    } catch {} finally { setLoading(false); }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  const revisionAna = useRealtimeSyncStore(s => s.revision);
  useEffect(() => { if (revisionAna > 0) setRetry(r => r + 1); }, [revisionAna]);

  if (loading && !data) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Analytics</h2>
          <p className="text-xs text-slate-500">Live utilization and trends</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {data ? (
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
