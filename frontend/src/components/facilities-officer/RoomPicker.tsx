import React, { useEffect, useState } from 'react';
import { X, Search, MapPin, Users, Clock, Video, Monitor, Presentation, Wrench, Ban, Building2, ChevronDown } from 'lucide-react';
import { facilitiesService } from '../../api/facilitiesService';

export interface RoomPickerSelection {
  roomId: string;
  roomName: string;
  roomNumber: string;
  facilityName: string;
  floorNumber?: number | null;
  building?: string | null;
  capacity?: number | null;
  type: string;
  amenities: string[];
}

interface RoomPickerProps {
  open: boolean;
  date: string;
  startTime: string;
  endTime: string;
  onSelect: (room: RoomPickerSelection) => void;
  onClose: () => void;
}

interface AvailableRoom extends RoomPickerSelection {
  availability: string;
  selectable: boolean;
  openTime?: string | null;
  closeTime?: string | null;
  facilityType?: string | null;
  occupiedBy?: string | null;
  occupiedUntil?: string | null;
  withinOperatingHours: boolean;
  hasProjector?: boolean;
  hasVideoConference?: boolean;
  hasWhiteboard?: boolean;
}

const AVAILABILITY_LABEL: Record<string, { text: string; cls: string }> = {
  AVAILABLE: { text: 'Available', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  OCCUPIED: { text: 'Occupied', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  MAINTENANCE: { text: 'Maintenance', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  OUT_OF_SERVICE: { text: 'Out of Service', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  CLOSED: { text: 'Closed Hours', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

export const RoomPicker: React.FC<RoomPickerProps> = ({ open, date, startTime, endTime, onSelect, onClose }) => {
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [facilities, setFacilities] = useState<{ id: string; name: string; code: string; type: string }[]>([]);
  const [buildings, setBuildings] = useState<string[]>([]);
  const [floors, setFloors] = useState<number[]>([]);
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Record<string, number>>({});

  const [filters, setFilters] = useState({
    facilityId: '',
    building: '',
    floor: '',
    minCapacity: '',
    roomType: '',
    availability: 'AVAILABLE',
  });

  const [showFilters, setShowFilters] = useState(false);

  const hasFilters = Object.values(filters).some(v => v !== '' && v !== 'AVAILABLE');

  const loadRooms = async (override?: Partial<typeof filters>) => {
    setLoading(true);
    setError('');
    try {
      const payload: Record<string, any> = { date, startTime, endTime };
      const f = { ...filters, ...override };
      if (f.facilityId) payload.facilityId = f.facilityId;
      if (f.building) payload.building = f.building;
      if (f.floor) payload.floor = Number(f.floor);
      if (f.minCapacity) payload.minCapacity = Number(f.minCapacity);
      if (f.roomType) payload.roomType = f.roomType;
      if (f.availability) payload.availability = f.availability;

      const data = await facilitiesService.searchAvailableRooms(payload);
      setRooms((data.rooms ?? []).map((r: any) => ({ ...r, roomId: r.id })));
      setSummary(data.summary ?? {});
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Unable to load rooms. Please try again.');
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setRooms([]);
    setSummary({});
    setError('');
    facilitiesService.getRoomFilterOptions().then(setFilterOptions).catch(() => {});
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date, startTime, endTime]);

  const setFilterOptions = (data: any) => {
    setFacilities(data?.facilities ?? []);
    setBuildings(data?.buildings ?? []);
    setFloors(data?.floors ?? []);
    setRoomTypes(data?.roomTypes ?? []);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            Assign Room
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              {date} · {startTime} – {endTime}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-mono text-slate-600">
              {summary.available ?? 0} available · {summary.occupied ?? 0} occupied · {summary.maintenance ?? 0} maintenance
            </span>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold inline-flex items-center gap-1 hover:bg-slate-100"
            >
              <Search className="w-3.5 h-3.5" />
              Filters {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
              <ChevronDown className={`w-3.5 h-3.5 transition ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Facility</label>
                <select
                  value={filters.facilityId}
                  onChange={e => setFilters({ ...filters, facilityId: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">All</option>
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Building</label>
                <select
                  value={filters.building}
                  onChange={e => setFilters({ ...filters, building: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">All</option>
                  {buildings.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Floor</label>
                <select
                  value={filters.floor}
                  onChange={e => setFilters({ ...filters, floor: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">All</option>
                  {floors.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Min Capacity</label>
                <input
                  type="number" min={0} value={filters.minCapacity}
                  onChange={e => setFilters({ ...filters, minCapacity: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  placeholder="e.g. 10"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Room Type</label>
                <select
                  value={filters.roomType}
                  onChange={e => setFilters({ ...filters, roomType: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">All</option>
                  {roomTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Availability</label>
                <select
                  value={filters.availability}
                  onChange={e => setFilters({ ...filters, availability: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of Service</option>
                  <option value="CLOSED">Closed Hours</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-3 lg:col-span-6 flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setFilters({ facilityId: '', building: '', floor: '', minCapacity: '', roomType: '', availability: 'AVAILABLE' }); loadRooms({ facilityId: '', building: '', floor: '', minCapacity: '', roomType: '', availability: 'AVAILABLE' }); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold text-xs hover:bg-slate-200"
                >
                  Reset
                </button>
                <button
                  onClick={() => loadRooms()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{error}</div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm font-mono">Loading rooms…</div>
          ) : rooms.length === 0 && !error ? (
            <div className="py-12 text-center">
              <p className="text-slate-400 text-sm font-semibold">No rooms match the selected criteria.</p>
              <p className="text-slate-400 text-xs mt-1">Try adjusting the filters or time range.</p>
            </div>
          ) : (
            rooms.map((room) => {
              const label = AVAILABILITY_LABEL[room.availability] ?? AVAILABILITY_LABEL.AVAILABLE;
              const selectable = room.selectable;
              return (
                <div
                  key={room.roomId}
                  className={`rounded-xl border p-4 transition ${selectable ? 'border-slate-200 hover:border-emerald-400 hover:shadow-md cursor-pointer bg-white' : 'border-slate-200 bg-slate-50/60 opacity-80'}`}
                  onClick={() => selectable && onSelect(room)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{room.roomName}</span>
                        <span className="font-mono text-[10px] text-slate-400">{room.roomNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${label.cls}`}>{label.text}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 flex-wrap">
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{room.facilityName}{room.building ? ` · ${room.building}` : ''}</span>
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3 text-slate-400" />{room.capacity ?? '—'} seats</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" />{room.openTime ? `${room.openTime.slice(0, 5)}–${room.closeTime?.slice(0, 5)}` : 'Open 24h'}</span>
                        {room.floorNumber != null && <span>Floor {room.floorNumber}</span>}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-600 flex flex-wrap gap-2">
                        {room.hasProjector && <span className="inline-flex items-center gap-1"><Monitor className="w-3 h-3 text-emerald-600" />Projector</span>}
                        {room.hasVideoConference && <span className="inline-flex items-center gap-1"><Video className="w-3 h-3 text-emerald-600" />Video Conf</span>}
                        {room.hasWhiteboard && <span className="inline-flex items-center gap-1"><Presentation className="w-3 h-3 text-emerald-600" />Whiteboard</span>}
                        {room.amenities?.map(a => (
                          <span key={a} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{a}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {room.availability === 'OCCUPIED' && room.occupiedBy && (
                        <span className="text-[10px] font-semibold text-rose-600 inline-flex items-center gap-1 max-w-[160px] truncate">
                          <Ban className="w-3 h-3" />{room.occupiedBy}
                        </span>
                      )}
                      {room.availability === 'MAINTENANCE' && (
                        <span className="text-[10px] font-semibold text-amber-600 inline-flex items-center gap-1">
                          <Wrench className="w-3 h-3" />Maintenance
                        </span>
                      )}
                      <button
                        disabled={!selectable}
                        onClick={() => selectable && onSelect(room)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition mt-1 ${
                          selectable ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {selectable ? 'Select Room' : 'Unavailable'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
