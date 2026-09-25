import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowLeft, Boxes, Building2, CalendarDays, ClipboardList, DoorOpen, ImagePlus, Loader2, Map, Plus, RefreshCw, Save, Trash2, Upload, Users, Wrench, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { extractErrorMessage } from '../../api/client';
import { facilityManagementService, type FacilitySpace, type FacilitySpaceInput, type ManagedFacility, type WorkspaceRecord } from '../../api/facilityManagementService';
import { ROOM_TYPE_OPTIONS, isRoomType } from '../../contracts/facilityTypes';
import { DashboardHero } from '../ui/DashboardPrimitives';
import { FacilityFloorPlanEditor } from './FacilityFloorPlanEditor';

type Tab = 'overview' | 'spaces' | 'reservations' | 'assets' | 'maintenance' | 'floor-plan' | 'activity';
const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: Building2 }, { id: 'spaces', label: 'Rooms & Spaces', icon: DoorOpen },
  { id: 'reservations', label: 'Reservations', icon: CalendarDays }, { id: 'assets', label: 'Assets', icon: Boxes },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench }, { id: 'floor-plan', label: 'Floor Plan', icon: Map },
  { id: 'activity', label: 'Activity', icon: Activity },
];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-red-700 focus:ring-2 focus:ring-red-700/10';

type SpaceFormState = Omit<FacilitySpaceInput, 'type'> & { type: string };
const emptySpace: SpaceFormState = { name: '', roomNumber: '', building: null, floor: null, floorNumber: null, capacity: 1, type: 'MEETING_ROOM', status: 'AVAILABLE', description: null, active: true };
function pretty(value: unknown) { return String(value ?? '—').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function dateTime(value: unknown) { const date = new Date(String(value ?? '')); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
function text(row: WorkspaceRecord, ...keys: string[]) { for (const key of keys) if (row[key] != null && row[key] !== '') return String(row[key]); return '—'; }

const Empty: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; body: string }> = ({ icon: Icon, title, body }) => <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center"><Icon className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-500">{body}</p></div>;

export const FacilityWorkspace: React.FC = () => {
  const { facilityId = '' } = useParams();
  const navigate = useNavigate();
  const [facility, setFacility] = useState<ManagedFacility | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState('');
  const [spaces, setSpaces] = useState<FacilitySpace[]>([]);
  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [reservationStatus, setReservationStatus] = useState('ALL');
  const [spaceModal, setSpaceModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<FacilitySpace | null>(null);
  const [spaceForm, setSpaceForm] = useState<SpaceFormState>(emptySpace);
  const [saving, setSaving] = useState(false);
  const [floorFile, setFloorFile] = useState<File | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  const loadFacility = useCallback(async () => {
    setLoading(true); setError('');
    try { setFacility(await facilityManagementService.getFacility(facilityId)); }
    catch (loadError) {
      const message = extractErrorMessage(loadError);
      setError(/not found|404/i.test(message) ? 'This facility does not exist or is no longer available.' : message);
    } finally { setLoading(false); }
  }, [facilityId]);

  const loadTab = useCallback(async (selected: Tab, status = reservationStatus) => {
    if (selected === 'overview' || selected === 'floor-plan') return;
    setTabLoading(true); setError('');
    try {
      if (selected === 'spaces') setSpaces(await facilityManagementService.listSpaces(facilityId));
      else if (selected === 'reservations') setRecords(await facilityManagementService.listReservations(facilityId, status));
      else if (selected === 'assets') setRecords(await facilityManagementService.listAssets(facilityId));
      else if (selected === 'maintenance') setRecords(await facilityManagementService.listMaintenance(facilityId));
      else if (selected === 'activity') setRecords(await facilityManagementService.listActivity(facilityId));
    } catch (loadError) { setError(extractErrorMessage(loadError)); }
    finally { setTabLoading(false); }
  }, [facilityId, reservationStatus]);

  useEffect(() => { void loadFacility(); }, [loadFacility]);
  useEffect(() => { void loadTab(tab); }, [tab, loadTab]);

  const selectTab = (next: Tab) => { setTab(next); setRecords([]); setError(''); };
  const openSpace = (space?: FacilitySpace) => {
    setEditingSpace(space ?? null);
    setSpaceForm(space ? { name: space.name, roomNumber: space.roomNumber, building: space.building, floor: space.floor, floorNumber: space.floorNumber, capacity: space.capacity, type: space.type ?? '', status: space.status, description: space.description, active: space.active } : emptySpace);
    setSpaceModal(true); setError('');
  };

  const saveSpace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!spaceForm.name.trim() || !spaceForm.roomNumber.trim() || !Number.isSafeInteger(Number(spaceForm.capacity)) || Number(spaceForm.capacity) < 1) { setError('Space name, room number, and a positive whole-number capacity are required.'); return; }
    if (!isRoomType(spaceForm.type)) { setError('Select a valid room or space type.'); return; }
    const input: FacilitySpaceInput = { ...spaceForm, type: spaceForm.type };
    setSaving(true); setError('');
    try {
      const saved = editingSpace
        ? await facilityManagementService.updateSpace(facilityId, editingSpace.id, input)
        : await facilityManagementService.createSpace(facilityId, input);
      setSpaces((current) => [saved, ...current.filter((space) => space.id !== saved.id)]);
      setSpaceModal(false); setEditingSpace(null); setSpaceForm(emptySpace);
      await loadFacility();
    } catch (saveError) { setError(extractErrorMessage(saveError)); }
    finally { setSaving(false); }
  };

  const uploadFloorPlan = async () => {
    if (!floorFile) return;
    setSaving(true); setError('');
    try { setFacility(await facilityManagementService.uploadFloorPlan(facilityId, floorFile)); setFloorFile(null); }
    catch (uploadError) { setError(extractErrorMessage(uploadError)); }
    finally { setSaving(false); }
  };
  const removeFloorPlan = async () => {
    if (!facility?.floorPlanUrl || !window.confirm('Remove this floor plan and its protected storage object? Pins will remain available if a replacement is uploaded later.')) return;
    setSaving(true); setError('');
    try { await facilityManagementService.removeFloorPlan(facilityId); await loadFacility(); }
    catch (removeError) { setError(extractErrorMessage(removeError)); }
    finally { setSaving(false); }
  };

  const summary = useMemo(() => facility ? [
    ['Spaces', facility.spaceCount, DoorOpen], ['Active spaces', facility.activeSpaceCount, Building2],
    ['Active capacity', facility.activeCapacity, Users], ['Active reservations', facility.activeReservationCount, CalendarDays],
  ] as const : [], [facility]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-red-700" />Loading facility workspace...</div>;
  if (!facility) return <div className="space-y-4"><button type="button" onClick={() => navigate('/facilities/rooms')} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back to facilities</button><div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700"><AlertCircle className="mx-auto mb-3 h-8 w-8" />{error || 'Unable to load this facility.'}</div></div>;

  return <div className="space-y-6">
    <button type="button" onClick={() => navigate('/facilities/rooms')} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-red-700"><ArrowLeft className="h-4 w-4" />Facility Management</button>
    <DashboardHero eyebrow={`${facility.code ?? 'Facility'} · ${pretty(facility.type)}`} title={facility.facilityName} subtitle={facility.description || 'Operational workspace for this facility and its linked records.'} actions={<div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${facility.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{facility.active ? pretty(facility.status) : 'Archived'}</span><button type="button" onClick={() => { void loadFacility(); void loadTab(tab); }} className="rounded-xl border border-slate-200 p-2.5 text-slate-600" aria-label="Refresh workspace"><RefreshCw className="h-4 w-4" /></button></div>} />

    <nav className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Facility sections"><div className="flex min-w-max gap-1">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => selectTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${tab === id ? 'bg-red-700 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></nav>
    {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {tabLoading ? <div className="flex min-h-56 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-red-700" />Loading {tabs.find((item) => item.id === tab)?.label.toLowerCase()}...</div> : <>
      {tab === 'overview' && <div className="space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p></div><div className="rounded-xl bg-red-50 p-2.5 text-red-700"><Icon className="h-5 w-5" /></div></div></div>)}</section><section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-bold text-slate-900">Facility profile</h2><button type="button" onClick={() => navigate(`/facilities/rooms?edit=${facility.id}`)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-red-200 hover:text-red-700">Edit facility</button></div><dl className="mt-4 grid gap-4 sm:grid-cols-2">{[['Code', facility.code], ['Type', pretty(facility.type)], ['Configured capacity', `${facility.capacity} people`], ['Status', facility.active ? pretty(facility.status) : 'Archived'], ['Created', dateTime(facility.createdAt)], ['Last updated', dateTime(facility.updatedAt)]].map(([label, value]) => <div key={label}><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{value}</dd></div>)}</dl></div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-slate-900">Amenities</h2><div className="mt-4 flex flex-wrap gap-2">{facility.amenities.length ? facility.amenities.map((amenity) => <span key={amenity} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{amenity}</span>) : <p className="text-sm text-slate-400">No amenities listed.</p>}</div></div></section></div>}

      {tab === 'spaces' && <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Rooms & spaces</h2><p className="mt-1 text-xs text-slate-500">Only spaces linked to this facility are returned.</p></div><button type="button" onClick={() => openSpace()} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" />Add space</button></div>{spaces.length === 0 ? <Empty icon={DoorOpen} title="No spaces configured" body="Add a room or operational space to this facility." /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{spaces.map((space) => <button type="button" key={space.id} onClick={() => openSpace(space)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-red-200"><div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-900">{space.name}</h3><p className="mt-1 text-xs text-slate-400">{space.roomNumber} · {pretty(space.type)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${space.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{pretty(space.status)}</span></div><div className="mt-4 flex gap-4 text-xs text-slate-500"><span>{space.capacity} seats</span><span>{space.building || 'No building'}</span><span>{space.floor || (space.floorNumber == null ? 'No floor' : `Floor ${space.floorNumber}`)}</span></div></button>)}</div>}</section>}

      {tab === 'reservations' && <section className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Reservations</h2><p className="mt-1 text-xs text-slate-500">Room and facility-level reservations, scoped on the server.</p></div><select value={reservationStatus} onChange={(event) => { setReservationStatus(event.target.value); void loadTab('reservations', event.target.value); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><option value="ALL">All statuses</option>{['TODAY','UPCOMING','PENDING_APPROVAL','PENDING','CONFIRMED','APPROVED','COMPLETED','CANCELLED','REJECTED'].map((value) => <option key={value} value={value}>{pretty(value)}</option>)}</select></div>{records.length === 0 ? <Empty icon={CalendarDays} title="No matching reservations" body="Reservations linked to this facility will appear here." /> : <RecordList records={records} title={(row) => text(row, 'title', 'purpose')} meta={(row) => `${dateTime(row.start_time)} – ${dateTime(row.end_time)}`} badge={(row) => pretty(row.status)} detail={(row) => text(row, 'employee_name', 'employee_email', 'source')} />}</section>}

      {tab === 'assets' && <section className="space-y-4"><div><h2 className="text-base font-bold text-slate-900">Assets</h2><p className="mt-1 text-xs text-slate-500">Equipment assigned to rooms in this facility.</p></div>{records.length === 0 ? <Empty icon={Boxes} title="No linked assets" body="Assets assigned to this facility’s spaces will appear here." /> : <RecordList records={records} title={(row) => text(row, 'name')} meta={(row) => `${text(row, 'serial_number')} · ${pretty(row.category)}`} badge={(row) => pretty(row.status)} detail={(row) => { const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms as Record<string, unknown> | undefined; return room ? `${room.name ?? 'Room'} · ${room.room_number ?? '—'}` : 'Unassigned room'; }} />}</section>}

      {tab === 'maintenance' && <section className="space-y-4"><div><h2 className="text-base font-bold text-slate-900">Maintenance</h2><p className="mt-1 text-xs text-slate-500">Schedules attached to this facility’s spaces.</p></div>{records.length === 0 ? <Empty icon={Wrench} title="No maintenance records" body="Scheduled or completed maintenance will appear here." /> : <RecordList records={records} title={(row) => text(row, 'title')} meta={(row) => `${dateTime(row.start_time)} – ${dateTime(row.end_time)}`} badge={(row) => pretty(row.status)} detail={(row) => text(row, 'description', 'assigned_to')} />}</section>}

      {tab === 'floor-plan' && <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{facility.floorPlanUrl ? <img src={facility.floorPlanUrl} alt={`${facility.facilityName} floor plan`} className="max-h-[60vh] min-h-72 w-full rounded-xl bg-slate-50 object-contain" /> : <Empty icon={Map} title="No floor plan uploaded" body="Upload a protected image to enable visual facility mapping." />}</div><div className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-slate-900">Floor plan controls</h2><p className="mt-2 text-xs leading-5 text-slate-500">Files are stored in a private bucket. The image shown here uses a short-lived signed URL.</p><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-xs font-bold text-slate-600 hover:border-red-300 hover:text-red-700"><Upload className="h-4 w-4" />{floorFile?.name || 'Choose PNG, JPEG, or WebP'}<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFloorFile(event.target.files?.[0] ?? null)} /></label><button type="button" onClick={() => void uploadFloorPlan()} disabled={!floorFile || saving} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{facility.floorPlanUrl ? 'Replace floor plan' : 'Upload floor plan'}</button>{facility.floorPlanUrl && <><button type="button" onClick={() => setMapOpen(true)} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700"><Map className="h-4 w-4" />Manage map pins</button><button type="button" onClick={() => void removeFloorPlan()} disabled={saving} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700"><Trash2 className="h-4 w-4" />Remove floor plan</button></>}</div></div></section>}

      {tab === 'activity' && <section className="space-y-4"><div><h2 className="text-base font-bold text-slate-900">Facility activity</h2><p className="mt-1 text-xs text-slate-500">Authorized change events for this facility.</p></div>{records.length === 0 ? <Empty icon={ClipboardList} title="No activity recorded" body="Create, update, status, space, floor-plan, and pin events will appear here." /> : <div className="space-y-3">{records.map((row) => <div key={row.id} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mt-0.5 rounded-xl bg-red-50 p-2 text-red-700"><Activity className="h-4 w-4" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-slate-800">{pretty(row.action)}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{pretty(row.severity)}</span></div><p className="mt-1 text-xs text-slate-600">{text(row, 'description')}</p><p className="mt-2 text-[11px] text-slate-400">{text(row, 'user_full_name', 'user_email')} · {dateTime(row.created_at)}</p></div></div>)}</div>}</section>}
    </>}

    {spaceModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-slate-900">{editingSpace ? 'Edit space' : 'Add space'}</h2><button type="button" onClick={() => setSpaceModal(false)} aria-label="Close" className="p-2 text-slate-400"><X className="h-5 w-5" /></button></div><form onSubmit={saveSpace} className="grid gap-4 p-5 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-slate-500">Name *</span><input value={spaceForm.name} onChange={(event) => setSpaceForm({ ...spaceForm, name: event.target.value })} className={inputClass} /></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">Room number *</span><input value={spaceForm.roomNumber} onChange={(event) => setSpaceForm({ ...spaceForm, roomNumber: event.target.value })} className={inputClass} /></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">Capacity *</span><input type="number" min="1" step="1" value={spaceForm.capacity} onChange={(event) => setSpaceForm({ ...spaceForm, capacity: Number(event.target.value) })} className={inputClass} /></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">Room / space type *</span><select aria-label="Room / space type" value={spaceForm.type} onChange={(event) => setSpaceForm({ ...spaceForm, type: event.target.value })} className={inputClass}>{!isRoomType(spaceForm.type) && <option value={spaceForm.type} disabled>Legacy: {pretty(spaceForm.type)} — select a room or space type</option>}{ROOM_TYPE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">Status</span><select value={spaceForm.status} onChange={(event) => setSpaceForm({ ...spaceForm, status: event.target.value })} className={inputClass}>{['AVAILABLE','VACANT','OCCUPIED','RESERVED','MAINTENANCE','OUT_OF_SERVICE','INACTIVE'].map((value) => <option key={value} value={value}>{pretty(value)}</option>)}</select></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">Building</span><input value={spaceForm.building ?? ''} onChange={(event) => setSpaceForm({ ...spaceForm, building: event.target.value || null })} className={inputClass} /></label><label><span className="mb-1 block text-xs font-semibold text-slate-500">Floor</span><input value={spaceForm.floor ?? ''} onChange={(event) => setSpaceForm({ ...spaceForm, floor: event.target.value || null })} className={inputClass} /></label><label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-500">Description</span><textarea rows={3} value={spaceForm.description ?? ''} onChange={(event) => setSpaceForm({ ...spaceForm, description: event.target.value || null })} className={inputClass} /></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2"><button type="button" onClick={() => setSpaceModal(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save space</button></div></form></div></div>}
    {mapOpen && <FacilityFloorPlanEditor facility={facility} onClose={() => setMapOpen(false)} />}
  </div>;
};

const RecordList: React.FC<{ records: WorkspaceRecord[]; title: (row: WorkspaceRecord) => string; meta: (row: WorkspaceRecord) => string; badge: (row: WorkspaceRecord) => string; detail: (row: WorkspaceRecord) => string }> = ({ records, title, meta, badge, detail }) => <div className="grid gap-3 md:grid-cols-2">{records.map((row) => <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">{title(row)}</p><p className="mt-1 text-xs text-slate-500">{meta(row)}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{badge(row)}</span></div><p className="mt-3 text-xs text-slate-400">{detail(row)}</p></div>)}</div>;

export default FacilityWorkspace;
