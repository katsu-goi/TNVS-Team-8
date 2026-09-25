import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, MapPin, Save, Trash2, X } from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import { facilityManagementService, type FacilityPin, type ManagedFacility } from '../../api/facilityManagementService';

type Props = { facility: ManagedFacility; onClose: () => void };
type PinForm = { x: number; y: number; title: string; description: string; imageUrl: string };

const emptyPinForm: PinForm = { x: 50, y: 50, title: '', description: '', imageUrl: '' };
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10';

function toPinForm(pin: FacilityPin): PinForm {
  return { x: pin.x, y: pin.y, title: pin.title, description: pin.description ?? '', imageUrl: pin.imageUrl ?? '' };
}

export const FacilityFloorPlanEditor: React.FC<Props> = ({ facility, onClose }) => {
  const [pins, setPins] = useState<FacilityPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [form, setForm] = useState<PinForm>(emptyPinForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const loadPins = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPins(await facilityManagementService.listPins(facility.id));
    } catch (loadError) {
      setError(extractErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [facility.id]);

  useEffect(() => { void loadPins(); }, [loadPins]);

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!facility.floorPlanUrl) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100));
    setSelectedPinId(null);
    setForm({ ...emptyPinForm, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
    setError('');
  };

  const selectPin = (pin: FacilityPin) => {
    setSelectedPinId(pin.id);
    setForm(toPinForm(pin));
    setError('');
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('Pin title is required.');
      return;
    }
    setSaving(true);
    try {
      const saved = selectedPinId
        ? await facilityManagementService.updatePin(selectedPinId, form)
        : await facilityManagementService.createPin({ facilityId: facility.id, ...form });
      setPins((current) => selectedPinId ? current.map((pin) => pin.id === saved.id ? saved : pin) : [...current, saved]);
      setSelectedPinId(saved.id);
      setForm(toPinForm(saved));
    } catch (saveError) {
      setError(extractErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPinId || !window.confirm('Delete this floor plan pin?')) return;
    setDeleting(true);
    setError('');
    try {
      await facilityManagementService.deletePin(selectedPinId);
      setPins((current) => current.filter((pin) => pin.id !== selectedPinId));
      setSelectedPinId(null);
      setForm(emptyPinForm);
    } catch (deleteError) {
      setError(extractErrorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="floor-plan-editor-title">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Facility mapping</p>
            <h2 id="floor-plan-editor-title" className="mt-1 text-lg font-bold text-slate-900">{facility.facilityName} floor plan</h2>
            <p className="mt-1 text-xs text-slate-500">Click the image to place a pin, then describe the mapped facility feature.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close floor plan editor"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.45fr_0.55fr]">
          <div>
            {facility.floorPlanUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50" onClick={handleMapClick}>
                <img src={facility.floorPlanUrl} alt={`${facility.facilityName} floor plan`} className="block max-h-[62vh] min-h-[300px] w-full object-contain" draggable={false} />
                {pins.map((pin) => (
                  <button key={pin.id} type="button" onClick={(event) => { event.stopPropagation(); selectPin(pin); }} className={`absolute -translate-x-1/2 -translate-y-full rounded-full border-2 border-white p-1.5 shadow-md transition ${selectedPinId === pin.id ? 'bg-red-800 ring-4 ring-red-200' : 'bg-red-700 hover:bg-red-800'}`} style={{ left: `${pin.x}%`, top: `${pin.y}%` }} title={pin.title} aria-label={`Edit pin ${pin.title}`}>
                    <MapPin className="h-4 w-4 text-white" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <div><MapPin className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No floor plan image uploaded</p><p className="mt-1 text-xs text-slate-500">Upload a floor plan from the facility edit form before adding pins.</p></div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{pins.length} mapped pin{pins.length === 1 ? '' : 's'}</span><span>Coordinates use percentages for responsive alignment.</span></div>
          </div>

          <div className="space-y-4">
            <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{selectedPinId ? 'Edit pin' : 'New pin'}</p><p className="mt-1 text-xs text-slate-400">Position {form.x.toFixed(2)}%, {form.y.toFixed(2)}%</p></div><MapPin className="h-5 w-5 text-red-700" /></div>
              <div className="mt-4 space-y-3">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={inputClass} placeholder="e.g. Main Projector" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} className={inputClass} placeholder="Describe this mapped feature." /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Image URL</span><input type="url" value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} className={inputClass} placeholder="https://..." /></label>
              </div>
              {error && <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
              <div className="mt-4 flex gap-2"><button type="submit" disabled={saving || !facility.floorPlanUrl} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving...' : selectedPinId ? 'Save pin' : 'Add pin'}</button>{selectedPinId && <button type="button" onClick={() => void handleDelete()} disabled={deleting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60" aria-label="Delete selected pin">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}</div>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mapped features</p>{loading ? <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-red-700" />Loading pins...</div> : pins.length === 0 ? <p className="mt-4 text-xs text-slate-400">No pins yet. Click the floor plan to place the first one.</p> : <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto">{pins.map((pin) => <button type="button" key={pin.id} onClick={() => selectPin(pin)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${selectedPinId === pin.id ? 'bg-red-50 text-red-800' : 'text-slate-600 hover:bg-slate-50'}`}><MapPin className="h-3.5 w-3.5 shrink-0 text-red-700" /><span className="truncate font-semibold">{pin.title}</span><span className="ml-auto shrink-0 text-[10px] text-slate-400">{pin.x.toFixed(0)}%, {pin.y.toFixed(0)}%</span></button>)}</div>}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacilityFloorPlanEditor;
