import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CalendarCheck, ImagePlus, Loader2, MoreVertical, Pencil, Plus, Power, RefreshCw, Save, Upload, Users, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { extractErrorMessage } from '../../api/client';
import { facilityManagementService, type FacilityInput, type ManagedFacility } from '../../api/facilityManagementService';
import { DashboardHero } from '../ui/DashboardPrimitives';

type FormState = {
  facilityName: string; code: string; type: string; description: string; capacity: string;
  amenities: string; status: string; active: boolean;
};

const emptyForm: FormState = { facilityName: '', code: '', type: 'MEETING_ROOM', description: '', capacity: '8', amenities: '', status: 'AVAILABLE', active: true };
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10';

function safeLoadError(error: unknown) {
  const message = extractErrorMessage(error);
  return /no route|not found|404/i.test(message) ? 'Facilities are temporarily unavailable. Refresh the page or contact your system administrator.' : message;
}

function pretty(value: string | null) {
  return (value || 'Other').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toForm(facility: ManagedFacility): FormState {
  return {
    facilityName: facility.facilityName, code: facility.code ?? '', type: facility.type ?? 'MEETING_ROOM',
    description: facility.description ?? '', capacity: String(facility.capacity || 1), amenities: facility.amenities.join(', '),
    status: facility.status === 'INACTIVE' ? 'AVAILABLE' : facility.status, active: facility.active,
  };
}

export const FacilityManagement: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [facilities, setFacilities] = useState<ManagedFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedFacility | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try { setFacilities(await facilityManagementService.listFacilities()); }
    catch (loadError) { setError(safeLoadError(loadError)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const editId = searchParams.get('edit');
    const match = facilities.find((item) => item.id === editId);
    if (match && !modalOpen) {
      openEdit(match);
      setSearchParams({}, { replace: true });
    }
  // openEdit is intentionally driven only after the requested facility loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, modalOpen, searchParams, setSearchParams]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const totals = useMemo(() => facilities.reduce((sum, facility) => ({
    spaces: sum.spaces + facility.activeSpaceCount,
    capacity: sum.capacity + facility.activeCapacity,
    reservations: sum.reservations + facility.activeReservationCount,
  }), { spaces: 0, capacity: 0, reservations: 0 }), [facilities]);
  const summaryCards: Array<{ label: string; value: number; caption: string; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'Configured facilities', value: facilities.length, caption: 'All active and archived records', icon: Building2 },
    { label: 'Active spaces', value: totals.spaces, caption: `${totals.capacity.toLocaleString()} seats across available spaces`, icon: Users },
    { label: 'Total active capacity', value: totals.capacity, caption: `${totals.reservations} current and upcoming reservations`, icon: CalendarCheck },
  ];

  const closeModal = () => {
    setModalOpen(false); setEditing(null); setForm(emptyForm); setFloorPlanFile(null); setFormError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null);
  };
  const openCreate = () => { closeModal(); setModalOpen(true); };
  const openEdit = (facility: ManagedFacility) => { closeModal(); setEditing(facility); setForm(toForm(facility)); setModalOpen(true); };

  const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size < 1) {
      setFormError('Select a non-empty PNG, JPEG, or WebP image up to 5 MB.'); return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFloorPlanFile(file); setPreviewUrl(URL.createObjectURL(file)); setFormError('');
  };

  const input = (): FacilityInput => ({
    facilityName: form.facilityName, code: form.code, type: form.type, description: form.description,
    capacity: Number(form.capacity), amenities: form.amenities.split(',').map((item) => item.trim()).filter(Boolean),
    status: form.status, active: form.active,
  });

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setFormError('');
    if (!form.facilityName.trim() || !form.code.trim()) { setFormError('Facility name and code are required.'); return; }
    if (!Number.isSafeInteger(Number(form.capacity)) || Number(form.capacity) < 1) { setFormError('Capacity must be a positive whole number.'); return; }
    setSaving(true);
    try {
      let saved = editing ? await facilityManagementService.updateFacility(editing.id, input()) : await facilityManagementService.createFacility(input());
      if (floorPlanFile) saved = await facilityManagementService.uploadFloorPlan(saved.id, floorPlanFile);
      setFacilities((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      closeModal();
    } catch (saveError) { setFormError(extractErrorMessage(saveError)); }
    finally { setSaving(false); }
  };

  const toggleActive = async (facility: ManagedFacility) => {
    const verb = facility.active ? 'archive' : 'activate';
    if (!window.confirm(`${verb === 'archive' ? 'Archive' : 'Activate'} ${facility.facilityName}? Existing history will be preserved.`)) return;
    setActionId(facility.id); setOpenMenu(null);
    try {
      const saved = await facilityManagementService.setFacilityActive(facility.id, !facility.active);
      setFacilities((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (actionError) { setError(extractErrorMessage(actionError)); }
    finally { setActionId(null); }
  };

  return <div className="space-y-6">
    <DashboardHero eyebrow="Facilities Administration" title="Facility Management" subtitle="Manage locations, rooms, reservations, assets, maintenance, and protected floor plans." actions={<div className="flex gap-2">
      <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
      <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-800"><Plus className="h-4 w-4" />Add facility</button>
    </div>} />

    <section className="grid gap-4 sm:grid-cols-3">
      {summaryCards.map(({ label, value, caption, icon: Icon }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p></div><div className="rounded-xl bg-red-50 p-2.5 text-red-700"><Icon className="h-5 w-5" /></div></div><p className="mt-2 text-xs text-slate-400">{caption}</p></div>)}
    </section>

    {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

    {loading ? <div className="flex min-h-64 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-red-700" />Loading facilities...</div>
      : facilities.length === 0 ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><Building2 className="mx-auto h-11 w-11 text-slate-300" /><h2 className="mt-4 text-base font-bold text-slate-800">No facilities configured</h2><p className="mt-1 text-sm text-slate-500">Add the first facility to start organizing its spaces and operations.</p><button type="button" onClick={openCreate} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" />Add facility</button></section>
      : <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {facilities.map((facility) => <article key={facility.id} onClick={() => navigate(`/facilities/management/${facility.id}`)} className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/facilities/management/${facility.id}`); }}>
          <div className="relative h-40 bg-gradient-to-br from-slate-100 to-slate-200">
            {facility.floorPlanUrl ? <img src={facility.floorPlanUrl} alt={`${facility.facilityName} floor plan`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Building2 className="h-12 w-12 text-slate-300" /></div>}
            <span className={`absolute left-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm ${facility.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{facility.active ? pretty(facility.status) : 'Archived'}</span>
            <button type="button" aria-label={`Actions for ${facility.facilityName}`} onClick={(event) => { event.stopPropagation(); setOpenMenu((value) => value === facility.id ? null : facility.id); }} className="absolute right-3 top-3 rounded-lg bg-white/90 p-2 text-slate-600 shadow-sm hover:text-red-700"><MoreVertical className="h-4 w-4" /></button>
            {openMenu === facility.id && <div onClick={(event) => event.stopPropagation()} className="absolute right-3 top-12 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1.5 text-xs font-semibold shadow-lg"><button type="button" onClick={() => openEdit(facility)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Edit facility</button><button type="button" disabled={actionId === facility.id} onClick={() => void toggleActive(facility)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 ${facility.active ? 'text-rose-700 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}><Power className="h-3.5 w-3.5" />{facility.active ? 'Archive' : 'Activate'}</button></div>}
          </div>
          <div className="p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-bold text-slate-900 group-hover:text-red-800">{facility.facilityName}</h2><p className="mt-1 text-xs font-semibold text-slate-400">{facility.code} · {pretty(facility.type)}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{facility.capacity} max</span></div>
            {facility.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{facility.description}</p>}
            <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-3 text-center"><div><p className="text-lg font-bold text-slate-900">{facility.spaceCount}</p><p className="text-[10px] font-semibold uppercase text-slate-400">Spaces</p></div><div><p className="text-lg font-bold text-slate-900">{facility.activeCapacity}</p><p className="text-[10px] font-semibold uppercase text-slate-400">Seats</p></div><div><p className="text-lg font-bold text-red-700">{facility.activeReservationCount}</p><p className="text-[10px] font-semibold uppercase text-slate-400">Bookings</p></div></div>
            <div className="mt-4 flex flex-wrap gap-1.5">{facility.amenities.slice(0, 3).map((amenity) => <span key={amenity} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{amenity}</span>)}{facility.amenities.length > 3 && <span className="px-1 py-1 text-[10px] font-semibold text-slate-400">+{facility.amenities.length - 3}</span>}{facility.amenities.length === 0 && <span className="text-xs text-slate-400">No amenities listed</span>}</div>
          </div>
        </article>)}
      </section>}

    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="facility-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"><div className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="facility-dialog-title" className="text-lg font-bold text-slate-900">{editing ? 'Edit facility' : 'Add facility'}</h2><p className="mt-1 text-xs text-slate-500">Required fields are validated again by the server.</p></div><button type="button" onClick={closeModal} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <form onSubmit={save} className="space-y-5 p-5"><div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-500">Facility name *</span><input autoFocus value={form.facilityName} onChange={(event) => setForm({ ...form, facilityName: event.target.value })} className={inputClass} maxLength={160} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-slate-500">Facility code *</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className={inputClass} maxLength={32} placeholder="HQ-MNL" /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-slate-500">Capacity *</span><input type="number" min="1" max="100000" step="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} className={inputClass} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-slate-500">Type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputClass}>{['MEETING_ROOM','CONFERENCE_ROOM','BOARD_ROOM','TRAINING_ROOM','EVENT_HALL','OFFICE','WAREHOUSE','OTHER'].map((value) => <option key={value} value={value}>{pretty(value)}</option>)}</select></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-slate-500">Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={inputClass}><option value="AVAILABLE">Available</option><option value="MAINTENANCE">Maintenance</option></select></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-500">Description</span><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} maxLength={2000} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-500">Amenities</span><input value={form.amenities} onChange={(event) => setForm({ ...form, amenities: event.target.value })} className={inputClass} placeholder="Projector, Whiteboard, Wi-Fi" /></label>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"><div className="flex gap-3"><div className="rounded-xl bg-red-50 p-2.5 text-red-700"><ImagePlus className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">Protected floor plan</p><p className="mt-1 text-xs text-slate-500">PNG, JPEG, or WebP up to 5 MB. Access uses a temporary signed URL.</p><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Upload className="h-4 w-4" />{floorPlanFile ? 'Replace selection' : 'Choose image'}<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={selectFile} /></label>{(previewUrl || editing?.floorPlanUrl) && <img src={previewUrl || editing?.floorPlanUrl || ''} alt="Floor plan preview" className="mt-4 max-h-44 w-full rounded-xl border border-slate-200 bg-white object-contain" />}</div></div></div>
      {formError && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{formError}</div>}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving...' : 'Save facility'}</button></div></form></div></div>}
  </div>;
};

export default FacilityManagement;
