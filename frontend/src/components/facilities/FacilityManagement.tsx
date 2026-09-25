import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Edit3, ImagePlus, Loader2, MapPin, Plus, Power, RefreshCw, Save, Upload, Users, X } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { facilityManagementService, type FacilityInput, type ManagedFacility } from '../../api/facilityManagementService';
import { FacilityFloorPlanEditor } from './FacilityFloorPlanEditor';

type FacilityForm = {
  facilityName: string;
  code: string;
  type: string;
  capacity: string;
  amenities: string;
  status: string;
  active: boolean;
  floorPlanUrl: string | null;
};

const emptyForm: FacilityForm = {
  facilityName: '',
  code: '',
  type: 'MEETING_ROOM',
  capacity: '8',
  amenities: '',
  status: 'AVAILABLE',
  active: true,
  floorPlanUrl: null,
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString([], { dateStyle: 'medium' });
}

function toForm(facility: ManagedFacility): FacilityForm {
  return {
    facilityName: facility.facilityName,
    code: facility.code ?? '',
    type: facility.type ?? 'MEETING_ROOM',
    capacity: String(facility.capacity || 1),
    amenities: facility.amenities.join(', '),
    status: facility.status === 'INACTIVE' ? 'AVAILABLE' : facility.status,
    active: facility.active,
    floorPlanUrl: facility.floorPlanUrl,
  };
}

export const FacilityManagement: React.FC = () => {
  const [facilities, setFacilities] = useState<ManagedFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<ManagedFacility | null>(null);
  const [mappingFacility, setMappingFacility] = useState<ManagedFacility | null>(null);
  const [form, setForm] = useState<FacilityForm>(emptyForm);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const loadFacilities = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setFacilities(await facilityManagementService.listFacilities());
    } catch (loadError) {
      setError(extractErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadFacilities(); }, [loadFacilities]);

  const activeCount = useMemo(() => facilities.filter((facility) => facility.active).length, [facilities]);
  const totalCapacity = useMemo(() => facilities.filter((facility) => facility.active).reduce((sum, facility) => sum + facility.capacity, 0), [facilities]);

  const clearPreview = () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const closeModal = (..._args: unknown[]) => {
    clearPreview();
    setFloorPlanFile(null);
    setEditingFacility(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(false);
  };

  const openCreate = () => {
    setEditingFacility(null);
    setForm(emptyForm);
    setFloorPlanFile(null);
    clearPreview();
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (facility: ManagedFacility) => {
    setEditingFacility(facility);
    setForm(toForm(facility));
    setFloorPlanFile(null);
    clearPreview();
    setFormError('');
    setModalOpen(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Select a PNG, JPG, JPEG, or WebP image for the floor plan.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Floor plan images must be 5 MB or smaller.');
      return;
    }
    clearPreview();
    setFloorPlanFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFormError('');
  };

  const toInput = (): FacilityInput => ({
    facilityName: form.facilityName.trim(),
    code: form.code.trim(),
    type: form.type,
    capacity: Number(form.capacity),
    amenities: form.amenities.split(',').map((amenity) => amenity.trim()).filter(Boolean),
    status: form.status,
    active: form.active,
    floorPlanUrl: form.floorPlanUrl,
  });

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const capacity = Number(form.capacity);
    if (!form.facilityName.trim()) { setFormError('Facility name is required.'); return; }
    if (!Number.isInteger(capacity) || capacity < 1) { setFormError('Capacity must be a whole number greater than zero.'); return; }

    setSaving(true);
    try {
      let saved: ManagedFacility;
      if (editingFacility) {
        const floorPlanUrl = floorPlanFile
          ? await facilityManagementService.uploadFloorPlan(editingFacility.id, floorPlanFile)
          : form.floorPlanUrl;
        saved = await facilityManagementService.updateFacility(editingFacility.id, { ...toInput(), floorPlanUrl });
      } else {
        saved = await facilityManagementService.createFacility({ ...toInput(), floorPlanUrl: null });
        if (floorPlanFile) {
          const floorPlanUrl = await facilityManagementService.uploadFloorPlan(saved.id, floorPlanFile);
          saved = await facilityManagementService.updateFacility(saved.id, { ...toInput(), floorPlanUrl });
        }
      }
      setFacilities((current) => [saved, ...current.filter((facility) => facility.id !== saved.id)]);
      closeModal(true);
    } catch (saveError) {
      setFormError(extractErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleActivation = async (facility: ManagedFacility) => {
    const action = facility.active ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} ${facility.facilityName}?`)) return;
    setActionId(facility.id);
    try {
      if (facility.active) await facilityManagementService.deactivateFacility(facility.id);
      else await facilityManagementService.activateFacility(facility.id);
      setFacilities((current) => current.map((item) => item.id === facility.id
        ? { ...item, active: !facility.active, status: facility.active ? 'INACTIVE' : 'AVAILABLE' }
        : item));
    } catch (actionError) {
      setError(extractErrorMessage(actionError));
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Facilities Administration</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Facility Management</h1>
          <p className="mt-1 text-sm text-slate-500">Configure meeting spaces, capacities, amenities, and floor plans.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadFacilities(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60" aria-label="Refresh facilities">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-800">
            <Plus className="h-4 w-4" />Add facility
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configured facilities</p><p className="mt-2 text-3xl font-bold text-slate-900">{facilities.length}</p><p className="mt-1 text-xs text-slate-400">All facility records</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active spaces</p><p className="mt-2 text-3xl font-bold text-emerald-700">{activeCount}</p><p className="mt-1 text-xs text-slate-400">Available to the portal</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total active capacity</p><p className="mt-2 flex items-center gap-2 text-3xl font-bold text-slate-900">{totalCapacity}<Users className="h-6 w-6 text-red-700" /></p><p className="mt-1 text-xs text-slate-400">Seats across active spaces</p></div>
      </section>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-base font-bold text-slate-900">Managed facilities</h2><p className="mt-1 text-xs text-slate-500">Floor plans are stored in Supabase Storage and linked to each facility.</p></div><Building2 className="h-5 w-5 text-red-700" /></div>
        {loading ? <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-red-700" />Loading facilities...</div> : facilities.length === 0 ? <div className="px-5 py-16 text-center"><Building2 className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No facilities configured</p><p className="mt-1 text-xs text-slate-500">Add the first space to make it available in the reservation portal.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50"><tr>{['Facility', 'Capacity', 'Amenities', 'Floor plan', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">{heading}</th>)}</tr></thead><tbody>{facilities.map((facility) => <tr key={facility.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-red-50 text-red-700">{facility.floorPlanUrl ? <img src={facility.floorPlanUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5" />}</div><div><p className="font-bold text-slate-900">{facility.facilityName}</p><p className="text-xs text-slate-400">{facility.code || 'No facility code'} · Added {formatDate(facility.createdAt)}</p></div></div></td><td className="px-5 py-4 font-semibold text-slate-700">{facility.capacity} seats</td><td className="max-w-[240px] px-5 py-4"><div className="flex flex-wrap gap-1.5">{facility.amenities.length ? facility.amenities.map((amenity) => <span key={amenity} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{amenity}</span>) : <span className="text-xs text-slate-400">None listed</span>}</div></td><td className="px-5 py-4">{facility.floorPlanUrl ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Uploaded</span> : <span className="text-xs text-slate-400">Not uploaded</span>}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${facility.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{facility.active ? facility.status : 'INACTIVE'}</span></td><td className="px-5 py-4"><div className="flex items-center gap-2"><button type="button" onClick={() => setMappingFacility(facility)} disabled={!facility.floorPlanUrl} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-white hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50" title={facility.floorPlanUrl ? 'Edit floor plan pins' : 'Upload a floor plan first'}><MapPin className="h-3.5 w-3.5" />Map</button><button type="button" onClick={() => openEdit(facility)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-white hover:text-red-700"><Edit3 className="h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => void handleActivation(facility)} disabled={actionId === facility.id} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold ${facility.active ? 'border border-rose-200 text-rose-700 hover:bg-rose-50' : 'bg-emerald-700 text-white hover:bg-emerald-800'} disabled:cursor-not-allowed disabled:opacity-60`}><Power className="h-3.5 w-3.5" />{actionId === facility.id ? 'Saving' : facility.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}</tbody></table></div>}
       </section>

       {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="facility-dialog-title"><div className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="facility-dialog-title" className="text-lg font-bold text-slate-900">{editingFacility ? 'Edit facility' : 'Add facility'}</h2><p className="mt-1 text-xs text-slate-500">Keep facility information accurate for reservation planning.</p></div><button type="button" onClick={closeModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close facility dialog"><X className="h-5 w-5" /></button></div><form onSubmit={handleSave} className="space-y-5 p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Facility name</span><input autoFocus value={form.facilityName} onChange={(event) => setForm((current) => ({ ...current, facilityName: event.target.value }))} className={inputClass} placeholder="e.g. Team 8 Conference Room" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Facility code</span><input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className={inputClass} placeholder="e.g. T8-CONF" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Capacity</span><input type="number" min="1" step="1" value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))} className={inputClass} /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Facility type</span><select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className={inputClass}><option value="MEETING_ROOM">Meeting room</option><option value="CONFERENCE_ROOM">Conference room</option><option value="BOARD_ROOM">Board room</option><option value="TRAINING_ROOM">Training room</option><option value="EVENT_HALL">Event hall</option><option value="OTHER">Other</option></select></label><label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}><option value="AVAILABLE">Available</option><option value="MAINTENANCE">Maintenance</option></select></label><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Amenities</span><input value={form.amenities} onChange={(event) => setForm((current) => ({ ...current, amenities: event.target.value }))} className={inputClass} placeholder="Projector, Whiteboard, Video conference" /><span className="mt-1.5 block text-[11px] text-slate-400">Separate amenities with commas.</span></label></div><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700"><ImagePlus className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">Floor plan image</p><p className="mt-1 text-xs text-slate-500">PNG, JPG, JPEG, or WebP up to 5 MB.</p><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-red-200 hover:text-red-700"><Upload className="h-4 w-4" />{floorPlanFile ? 'Replace image' : 'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="sr-only" /></label>{(previewUrl || form.floorPlanUrl) && <img src={previewUrl || form.floorPlanUrl || ''} alt="Floor plan preview" className="mt-4 max-h-48 w-full rounded-xl border border-slate-200 bg-white object-contain p-2" />}</div></div></div>{formError && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{formError}</span></div>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving...' : editingFacility ? 'Save changes' : 'Create facility'}</button></div></form></div></div>}
       {mappingFacility && <FacilityFloorPlanEditor facility={mappingFacility} onClose={() => setMappingFacility(null)} />}
    </div>
  );
};

export default FacilityManagement;
