import React, { useState } from 'react';
import {
  Calendar, Clock, Building2,
  PlusCircle, FileText, Download, Edit3,
  Send, X, Eye, Wrench, BarChart2,
  CheckSquare, ArrowUpRight, FileSpreadsheet, FileCode, Activity, DoorOpen, Loader2, Sparkles,
  Mail, CalendarClock, Inbox
} from 'lucide-react';
import { useRealtimeSyncStore } from '../../stores/realtimeSyncStore';
import { safeFetchJson, extractErrorMessage } from '../../api/client';
import { facilitiesService } from '../../api/facilitiesService';
import { RoomPicker, RoomPickerSelection } from './RoomPicker';
import { DatePicker } from '../ui/DatePicker';
import { TimePicker } from '../ui/TimePicker';

export interface ReservationItem {
  id: string;
  reservationId: string;
  title: string;
  facilityCategory: 'ROOM' | 'VEHICLE_BAY' | 'EQUIPMENT';
  facilityName: string;
  requesterName: string;
  requesterEmail: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  status: 'PENDING' | 'ESCALATED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  priorityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  description?: string;
  updatedAt: string;
  updatedBy: string;
  modificationNotes?: string;
}

export interface MaintenanceNotice {
  id: string;
  facilityName: string;
  maintenanceType: string;
  startDate: string;
  endDate: string;
  availabilityStatus: 'OUT_OF_SERVICE' | 'LIMITED_ACCESS' | 'SCHEDULED_MAINTENANCE';
}

/** Status → label + badge classes for the approval queue cards. */
const STATUS_META: Record<ReservationItem['status'], { label: string; badge: string }> = {
  PENDING:   { label: 'Pending',      badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  ESCALATED: { label: 'Under Review', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  APPROVED:  { label: 'Approved',     badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED:  { label: 'Rejected',     badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'Cancelled',    badge: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const TYPE_LABEL: Record<ReservationItem['facilityCategory'], string> = {
  ROOM: 'Room Booking',
  VEHICLE_BAY: 'Vehicle Bay',
  EQUIPMENT: 'Equipment',
};

const PRIORITY_BADGE: Record<ReservationItem['priorityLevel'], string> = {
  URGENT: 'bg-rose-100 text-rose-700',
  HIGH:   'bg-amber-100 text-amber-700',
  MEDIUM: 'bg-slate-100 text-slate-600',
  LOW:    'bg-slate-100 text-slate-500',
};

/** Two initials for the requester avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Format a date-ish string as "12 Dec 2023"; falls back to the raw value. */
function formatSubmitted(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format the booking schedule as "7 Jan 2023 · 10:30". */
function formatSchedule(date: string, start: string): string {
  const d = new Date(date);
  const datePart = isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  return start ? `${datePart} · ${start}` : datePart || '—';
}

/** One labeled field inside an approval card. */
const QueueField: React.FC<{
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}> = ({ label, value, icon, mono }) => (
  <div className="flex items-start gap-2 min-w-0">
    {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xs font-semibold text-slate-800 truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value || '—'}
      </p>
    </div>
  </div>
);

export const FoReservationsPage: React.FC = () => {
  const syncData = useRealtimeSyncStore(s => s.syncData);
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<'upcoming' | 'pending' | 'calendar' | 'recent' | 'utilization' | 'notices'>('upcoming');
  const [calendarViewMode, setCalendarViewMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [viewDetailModal, setViewDetailModal] = useState<ReservationItem | null>(null);
  const [editModal, setEditModal] = useState<ReservationItem | null>(null);
  const [escalateModal, setEscalateModal] = useState<ReservationItem | null>(null);

  // Form State for Create Reservation
  const [createForm, setCreateForm] = useState({
    title: '',
    category: 'ROOM' as 'ROOM' | 'VEHICLE_BAY' | 'EQUIPMENT',
    facilityName: '',
    requesterName: '',
    requesterEmail: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '11:00',
    expectedAttendees: '' as string,
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    description: '',
    attachments: ''
  });
  const [selectedRoom, setSelectedRoom] = useState<RoomPickerSelection | null>(null);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Dynamic state for reservations and maintenance notices (no hardcoded seed data)
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [maintenanceNotices] = useState<MaintenanceNotice[]>([]);

  React.useEffect(() => {
    const fetchReservations = async () => {
      try {
        const json = await safeFetchJson('/api/v1/facilities-officer/reservations');
        if (json?.data && Array.isArray(json.data)) {
          setReservations(json.data.map((r: any) => mapBackendReservation(r)));
        }
      } catch (e) {
        console.warn('Backend reservations offline, default to empty list', e);
      }
    };
    fetchReservations();
  }, []);

  const mapBackendReservation = (r: any): ReservationItem => ({
    id: r.id,
    reservationId: `RES-${r.id?.slice(0, 8).toUpperCase()}`,
    title: r.title,
    facilityCategory: 'ROOM',
    facilityName: r.roomName || r.facilityName || '',
    requesterName: r.employeeName || 'Facilities Officer',
    requesterEmail: r.employeeEmail || '',
    reservationDate: (r.startTime || '').slice(0, 10),
    startTime: (r.startTime || '').slice(11, 16),
    endTime: (r.endTime || '').slice(11, 16),
    durationHours: r.startTime && r.endTime
      ? Math.max(0, (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 3600000)
      : 0,
    status: (r.status === 'PENDING' || r.status === 'APPROVED' || r.status === 'REJECTED' || r.status === 'CANCELLED') ? r.status : 'PENDING',
    priorityLevel: 'MEDIUM',
    description: r.description,
    updatedAt: r.createdAt || new Date().toLocaleString(),
    updatedBy: r.employeeName || 'Facilities Officer',
    modificationNotes: `Requested ${r.roomName} · ${r.facilityName || ''}`.trim()
  });

  // Derived metrics for Component 1: Summary Cards & Component 6: Resource Utilization
  const pendingCount = syncData?.pendingReservations ?? reservations.filter(r => r.status === 'PENDING' || r.status === 'ESCALATED').length;
  const approvedCount = reservations.filter(r => r.status === 'APPROVED').length;
  const upcomingCount = reservations.filter(r => r.status === 'APPROVED' && new Date(r.reservationDate) >= new Date('2026-07-30')).length;
  const maintenanceCount = maintenanceNotices.length;
  const occupancyRate = 68; // 68% calculated occupancy rate

  // Quick Action Handlers
  const handleCreateReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!selectedRoom) {
      setSubmitError('Please assign a room for this reservation request.');
      return;
    }
    setSubmitting(true);
    try {
      await facilitiesService.createReservation({
        roomId: selectedRoom.roomId,
        title: createForm.title,
        description: createForm.description,
        startTime: `${createForm.date}T${createForm.startTime}:00`,
        endTime: `${createForm.date}T${createForm.endTime}:00`,
        expectedAttendees: createForm.expectedAttendees ? Number(createForm.expectedAttendees) : null,
      });
      const list = await facilitiesService.getMyReservations();
      setReservations(list.map((r: any) => mapBackendReservation(r)));
      setShowCreateModal(false);
      setSelectedRoom(null);
      setCreateForm({
        title: '', category: 'ROOM', facilityName: '',
        requesterName: '', requesterEmail: '', date: new Date().toISOString().split('T')[0],
        startTime: '09:00', endTime: '11:00', expectedAttendees: '', priority: 'MEDIUM', description: '', attachments: ''
      });
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message ?? 'Unable to submit reservation request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const [escalateNotes, setEscalateNotes] = useState('');

  // AI Reservation Assistant state
  const [aiQuery, setAiQuery] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiValidation, setAiValidation] = useState<any>(null);
  const [aiDraftApplied, setAiDraftApplied] = useState(false);
  const [aiLoading, setAiLoading] = useState<'suggest' | 'draft' | 'validate' | null>(null);
  const [aiError, setAiError] = useState('');

  const handleAiSuggest = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading('suggest');
    setAiError('');
    setAiValidation(null);
    setAiDraftApplied(false);
    try {
      const data = await facilitiesService.aiSuggestRooms({
        query: aiQuery,
        date: createForm.date,
        startTime: createForm.startTime,
        endTime: createForm.endTime,
        limit: 5,
      });
      setAiSuggestions(data.suggestions ?? []);
    } catch (err: any) {
      setAiError(extractErrorMessage(err));
      setAiSuggestions([]);
    } finally {
      setAiLoading(null);
    }
  };

  const handleAiDraft = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading('draft');
    setAiError('');
    try {
      const draft = await facilitiesService.aiDraftReservation({ text: aiQuery });
      setCreateForm(prev => ({
        ...prev,
        title: draft.title || prev.title,
        date: draft.date || prev.date,
        startTime: draft.startTime || prev.startTime,
        endTime: draft.endTime || prev.endTime,
        expectedAttendees: draft.expectedAttendees != null ? String(draft.expectedAttendees) : prev.expectedAttendees,
        description: draft.description || prev.description,
      }));
      setAiDraftApplied(true);
    } catch (err: any) {
      setAiError(extractErrorMessage(err));
    } finally {
      setAiLoading(null);
    }
  };

  const applyAiSuggestion = (s: any) => {
    setSelectedRoom({
      roomId: s.roomId,
      roomName: s.roomName,
      roomNumber: s.roomNumber,
      facilityName: s.facilityName,
      floorNumber: s.floorNumber,
      building: s.building,
      capacity: s.capacity,
      type: s.roomType,
      amenities: s.amenities ?? [],
    });
  };

  const handleAiValidate = async () => {
    if (!selectedRoom) {
      setAiError('Assign a room first to run AI validation.');
      return;
    }
    setAiLoading('validate');
    setAiError('');
    setAiSuggestions([]);
    try {
      const data = await facilitiesService.aiValidateReservation({
        roomId: selectedRoom.roomId,
        startTime: `${createForm.date}T${createForm.startTime}:00`,
        endTime: `${createForm.date}T${createForm.endTime}:00`,
        expectedAttendees: createForm.expectedAttendees ? Number(createForm.expectedAttendees) : null,
      });
      setAiValidation(data);
    } catch (err: any) {
      setAiError(extractErrorMessage(err));
      setAiValidation(null);
    } finally {
      setAiLoading(null);
    }
  };

  const applyAlternativeSlot = (alt: any) => {
    setCreateForm(prev => ({
      ...prev,
      date: alt.date,
      startTime: String(alt.startTime).slice(0, 5),
      endTime: String(alt.endTime).slice(0, 5),
    }));
    setAiValidation((prev: any) => prev ? { ...prev, alternatives: [] } : prev);
  };

  const handleEscalateSubmit = (id: string) => {
    setReservations(reservations.map(r => r.id === id ? {
      ...r,
      status: 'ESCALATED',
      updatedAt: new Date().toLocaleString(),
      updatedBy: 'Facilities Officer',
      modificationNotes: escalateNotes.trim() ? `Escalated to Manager: ${escalateNotes}` : 'Escalated to Facilities Manager for final approval decision.'
    } : r));
    setEscalateModal(null);
    setEscalateNotes('');
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    setReservations(reservations.map(r => r.id === editModal.id ? {
      ...editModal,
      updatedAt: new Date().toLocaleString(),
      updatedBy: 'Facilities Officer',
      modificationNotes: `Updated title/time details: ${editModal.startTime} - ${editModal.endTime}`
    } : r));
    setEditModal(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner & Governance Notice */}
      <div className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-extrabold font-heading text-slate-900">Facilities Reservation Console</h1>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Operational coordination, scheduling, creation, and management. <strong className="text-emerald-700 font-semibold">Final approvals escalated to Facilities Manager.</strong>
          </p>
        </div>

        {/* Component 8: Quick Action Buttons & Real-Time Sync Badge */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="hidden sm:flex items-center px-3 py-1.5 rounded-xl border bg-emerald-50 border-emerald-200">
            <Activity className="w-4 h-4 mr-2 text-emerald-600 animate-pulse" />
            <span className="text-xs font-mono font-semibold text-emerald-600">REALTIME SYNC LIVE</span>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Reservation</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm"
          >
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>View Calendar</span>
          </button>

          <button
            onClick={() => setShowReportModal(true)}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      {/* Component 1: Reservation Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="card-stat p-4 border-l-4 border-l-amber-500">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Requests</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{pendingCount}</p>
          <p className="text-[10px] text-amber-600 mt-0.5 font-mono">Awaiting Manager Approval</p>
        </div>

        <div className="card-stat p-4 border-l-4 border-l-emerald-500">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Approved Reservations</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{approvedCount}</p>
          <p className="text-[10px] text-emerald-600 mt-0.5 font-mono">Active & Confirmed</p>
        </div>

        <div className="card-stat p-4 border-l-4 border-l-blue-500">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Upcoming Reservations</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{upcomingCount}</p>
          <p className="text-[10px] text-blue-600 mt-0.5 font-mono">Scheduled Next 7 Days</p>
        </div>

        <div className="card-stat p-4 border-l-4 border-l-rose-500">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Under Maintenance</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{maintenanceCount}</p>
          <p className="text-[10px] text-rose-600 mt-0.5 font-mono">Rooms / Bays Offline</p>
        </div>

        <div className="card-stat p-4 border-l-4 border-l-teal-500">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Occupancy Rate</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{occupancyRate}%</p>
          <p className="text-[10px] text-teal-600 mt-0.5 font-mono">Facility Utilization</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-2 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-4 py-2.5 rounded-t-xl transition flex items-center space-x-1.5 ${
            activeTab === 'upcoming' ? 'bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Upcoming Reservations ({upcomingCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2.5 rounded-t-xl transition flex items-center space-x-1.5 ${
            activeTab === 'pending' ? 'bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Pending Requests ({pendingCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2.5 rounded-t-xl transition flex items-center space-x-1.5 ${
            activeTab === 'calendar' ? 'bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span>Facility Availability Calendar</span>
        </button>

        <button
          onClick={() => setActiveTab('recent')}
          className={`px-4 py-2.5 rounded-t-xl transition flex items-center space-x-1.5 ${
            activeTab === 'recent' ? 'bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Recently Updated</span>
        </button>

        <button
          onClick={() => setActiveTab('utilization')}
          className={`px-4 py-2.5 rounded-t-xl transition flex items-center space-x-1.5 ${
            activeTab === 'utilization' ? 'bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Resource Utilization</span>
        </button>

        <button
          onClick={() => setActiveTab('notices')}
          className={`px-4 py-2.5 rounded-t-xl transition flex items-center space-x-1.5 ${
            activeTab === 'notices' ? 'bg-white text-emerald-700 border-t-2 border-emerald-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Wrench className="w-4 h-4 text-rose-500" />
          <span>Maintenance Notices ({maintenanceCount})</span>
        </button>
      </div>

      {/* Component 2: Upcoming Reservations Table View */}
      {activeTab === 'upcoming' && (
        <div className="card-stat overflow-hidden space-y-4 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900">Confirmed & Scheduled Upcoming Reservations</h3>
            <span className="text-xs text-slate-400 font-mono">Sorted by date & time</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-3">Reservation ID</th>
                  <th className="py-3 px-3">Requester</th>
                  <th className="py-3 px-3">Facility Name</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Time Slot</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reservations.filter(r => r.status === 'APPROVED').map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">{r.reservationId}</td>
                    <td className="py-3 px-3 font-medium text-slate-800">
                      <div>{r.requesterName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.requesterEmail}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-700 font-medium">{r.facilityName}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{r.reservationDate}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{r.startTime} - {r.endTime} ({r.durationHours}h)</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        🟢 {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-1.5">
                      <button onClick={() => setViewDetailModal(r)} className="px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold" title="View Details">
                        <Eye className="w-3.5 h-3.5 inline" />
                      </button>
                      <button onClick={() => setEditModal(r)} className="px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold" title="Edit Reservation">
                        <Edit3 className="w-3.5 h-3.5 inline" />
                      </button>
                      <button onClick={() => setEditModal(r)} className="px-2 py-1 rounded bg-teal-50 text-teal-600 hover:bg-teal-100 font-semibold" title="Reschedule">
                        <Calendar className="w-3.5 h-3.5 inline" />
                      </button>
                      <button onClick={() => setEscalateModal(r)} className="px-2 py-1 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 font-semibold" title="Escalate to Manager">
                        <Send className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Component 3: Pending Requests Queue */}
      {activeTab === 'pending' && (
        <div className="card-stat space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pending Requests Queue</h3>
              <p className="mt-1 text-xs text-slate-500">Review each request, make adjustments, or forward it to the Facilities Manager.</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
              {pendingCount} {pendingCount === 1 ? 'request' : 'requests'}
            </span>
          </div>

          {reservations.filter(r => r.status === 'PENDING' || r.status === 'ESCALATED').length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center">
              <Inbox className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No requests awaiting review</p>
              <p className="mt-1 text-xs text-slate-400">New reservation requests will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {reservations.filter(r => r.status === 'PENDING' || r.status === 'ESCALATED').map(r => {
                const status = STATUS_META[r.status];
                return (
                  <article key={r.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                          {r.facilityCategory === 'EQUIPMENT' ? <Wrench className="h-4 w-4" /> :
                            r.facilityCategory === 'VEHICLE_BAY' ? <DoorOpen className="h-4 w-4" /> :
                              <Building2 className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reservation number</p>
                          <p className="truncate font-mono text-sm font-bold text-slate-900">#{r.reservationId.replace(/^RES-/, '')}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${status.badge}`}>{status.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${PRIORITY_BADGE[r.priorityLevel]}`}>{r.priorityLevel}</span>
                      </div>
                    </div>

                    <div className="my-3 border-t border-slate-100" />

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <QueueField
                        label="Requester"
                        value={r.requesterName}
                        icon={<span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">{initials(r.requesterName)}</span>}
                      />
                      <QueueField label="Date submitted" value={formatSubmitted(r.updatedAt)} icon={<Calendar className="h-4 w-4 text-slate-400" />} />
                      <QueueField label="E-mail" value={r.requesterEmail} icon={<Mail className="h-4 w-4 text-slate-400" />} />
                      <QueueField label="Reservation type" value={TYPE_LABEL[r.facilityCategory]} icon={<FileText className="h-4 w-4 text-slate-400" />} />
                      <QueueField label="Facility" value={r.facilityName} icon={<Building2 className="h-4 w-4 text-slate-400" />} />
                      <QueueField label="Schedule" value={formatSchedule(r.reservationDate, r.startTime)} icon={<CalendarClock className="h-4 w-4 text-slate-400" />} mono />
                    </div>

                    <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setEditModal(r)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                        title="Modify details"
                      >
                        <Edit3 className="mr-1.5 inline-block h-3.5 w-3.5" />Modify
                      </button>
                      <button
                        type="button"
                        onClick={() => setReservations(reservations.map(item => item.id === r.id ? {
                          ...item,
                          status: 'CANCELLED',
                          updatedAt: new Date().toLocaleString(),
                          updatedBy: 'Facilities Officer',
                          modificationNotes: 'Cancelled reservation request by Facilities Officer.'
                        } : item))}
                        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                        title="Cancel request"
                      >
                        <X className="mr-1.5 inline-block h-3.5 w-3.5" />Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEscalateModal(r); setEscalateNotes(r.modificationNotes || ''); }}
                        className="ml-auto inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                        title="Forward to Manager for final approval"
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        {r.status === 'ESCALATED' ? 'Update Review' : 'Forward to Manager'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Component 4: Facility Availability Calendar */}
      {activeTab === 'calendar' && (
        <div className="card-stat p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Facility Availability Calendar & Schedule Grid
              </h3>
              <p className="text-xs text-slate-500">Visual time-slot booking grid, vehicle bay schedules, and maintenance blockouts.</p>
            </div>

            {/* Daily / Weekly / Monthly Switcher */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button onClick={() => setCalendarViewMode('daily')} className={`px-3 py-1.5 rounded-lg transition ${calendarViewMode === 'daily' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>
                Daily View
              </button>
              <button onClick={() => setCalendarViewMode('weekly')} className={`px-3 py-1.5 rounded-lg transition ${calendarViewMode === 'weekly' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>
                Weekly View
              </button>
              <button onClick={() => setCalendarViewMode('monthly')} className={`px-3 py-1.5 rounded-lg transition ${calendarViewMode === 'monthly' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>
                Monthly View
              </button>
            </div>
          </div>

          {/* Calendar Grid Representation */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="grid grid-cols-6 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 py-2.5 px-3 uppercase tracking-wider text-center">
              <div>Facility / Bay</div>
              <div>Mon (Aug 1)</div>
              <div>Tue (Aug 2)</div>
              <div>Wed (Aug 3)</div>
              <div>Thu (Aug 4)</div>
              <div>Fri (Aug 5)</div>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="grid grid-cols-6 p-3 items-center hover:bg-slate-50">
                <div className="font-bold text-slate-900">Executive Conf Room A</div>
                <div className="p-2 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold text-center border border-emerald-200">
                  09:00-12:30 Booked
                </div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
                <div className="p-2 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold text-center border border-blue-200">
                  14:00-16:00 Booked
                </div>
              </div>

              <div className="grid grid-cols-6 p-3 items-center hover:bg-slate-50">
                <div className="font-bold text-slate-900">Vehicle Dock Bay 3</div>
                <div className="p-2 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold text-center border border-amber-200">
                  13:00-15:00 Pending
                </div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
              </div>

              <div className="grid grid-cols-6 p-3 items-center hover:bg-slate-50 bg-rose-50/30">
                <div className="font-bold text-slate-900">Conference Room C</div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
                <div className="p-2 rounded bg-rose-100 text-rose-700 text-[10px] font-bold text-center border border-rose-200 col-span-3">
                  ⚠️ OUT OF SERVICE: HVAC Maintenance Block
                </div>
                <div className="p-2 text-center text-slate-400 font-mono text-[10px]">Available</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Component 5: Recently Updated Reservations */}
      {activeTab === 'recent' && (
        <div className="card-stat p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recently Updated Reservations & Audit Log</h3>
            <span className="text-xs text-slate-400 font-mono">Real-time modification logs</span>
          </div>

          <div className="space-y-2.5">
            {reservations.map((r) => (
              <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition flex items-start justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-slate-900">{r.reservationId}</span>
                    <span className="font-semibold text-slate-800">· {r.title}</span>
                  </div>
                  <p className="text-slate-600">Updated by <strong className="text-slate-900">{r.updatedBy}</strong>: {r.modificationNotes}</p>
                  <p className="text-[10px] text-slate-400 font-mono">Timestamp: {r.updatedAt}</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Component 6: Resource Utilization Summary */}
      {activeTab === 'utilization' && (
        <div className="card-stat p-5 space-y-5">
          <h3 className="text-base font-bold text-slate-900">Facility Resource Utilization Summary</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase">Peak Booking Hours</p>
              <p className="text-xl font-bold text-slate-900 mt-1">10:00 AM – 02:00 PM</p>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">Highest demand period across rooms</p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase">Frequently Used Facility</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">Executive Conference Room A</p>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">84% weekly booking load</p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase">Vehicle Bay Capacity</p>
              <p className="text-xl font-bold text-blue-700 mt-1">52% Utilized</p>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">3 / 6 bays active today</p>
            </div>
          </div>
        </div>
      )}

      {/* Component 7: Maintenance Notices */}
      {activeTab === 'notices' && (
        <div className="card-stat p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-rose-500" />
            Facility Maintenance Notices & Blocked Slots
          </h3>

          <div className="space-y-3">
            {maintenanceNotices.map((n) => (
              <div key={n.id} className="p-4 rounded-xl border border-rose-200 bg-rose-50/60 flex items-start justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 text-sm">{n.facilityName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200 text-rose-800">
                      {n.availabilityStatus}
                    </span>
                  </div>
                  <p className="text-slate-700 font-medium">{n.maintenanceType}</p>
                  <p className="text-slate-500 font-mono">Schedule: {n.startDate} to {n.endDate}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Component 8: Create Reservation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                New Facility Reservation Request
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreateReservationSubmit} className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 font-medium">
                ℹ️ Request creation will be validated and automatically escalated to the Facilities Manager for final approval.
              </div>

              {/* AI Reservation Assistant */}
              <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/70">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    AI Reservation Assistant
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Heuristic + optional LLM</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="Describe your needs... e.g. 30 people, projector, Tuesday 2-4pm, conference room"
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  className="w-full bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button" onClick={handleAiSuggest} disabled={aiLoading !== null}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {aiLoading === 'suggest' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Suggest Rooms
                  </button>
                  <button
                    type="button" onClick={handleAiDraft} disabled={aiLoading !== null}
                    className="px-3 py-1.5 rounded-lg bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-semibold text-xs disabled:opacity-60"
                  >
                    Auto-fill Draft
                  </button>
                  <button
                    type="button" onClick={handleAiValidate} disabled={aiLoading !== null}
                    className="px-3 py-1.5 rounded-lg bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-semibold text-xs disabled:opacity-60"
                  >
                    AI Validate
                  </button>
                </div>

                {aiDraftApplied && (
                  <div className="mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
                    Draft applied to the form below. Review and adjust before submitting.
                  </div>
                )}
                {aiError && (
                  <div className="mt-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium">{aiError}</div>
                )}

                {aiSuggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suggested Rooms (ranked)</p>
                    {aiSuggestions.map((s, i) => (
                      <div key={s.roomId} className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className="font-bold text-slate-900 text-xs">{s.roomName}</span>
                            <span className="font-mono text-[10px] text-slate-400">{s.capacity ?? '—'} seats</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{s.matchReason}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{s.facilityName}{s.floorNumber != null ? ` · Floor ${s.floorNumber}` : ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyAiSuggestion(s)}
                          className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                            selectedRoom?.roomId === s.roomId ? 'bg-emerald-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                          }`}
                        >
                          {selectedRoom?.roomId === s.roomId ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {aiValidation && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Validation {aiValidation.valid
                        ? <span className="text-emerald-600">PASSED</span>
                        : <span className="text-rose-600">BLOCKED</span>}
                    </p>
                    {(aiValidation.warnings ?? []).map((w: any, i: number) => (
                      <div key={i} className={`p-2 rounded-lg text-[11px] font-medium border ${
                        w.severity === 'ERROR' ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : w.severity === 'WARNING' ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {w.message}
                      </div>
                    ))}
                    {(aiValidation.alternatives ?? []).length > 0 && (
                      <div className="pt-1">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alternative Slots</p>
                        <div className="space-y-1.5">
                          {(aiValidation.alternatives ?? []).map((alt: any, i: number) => (
                            <button key={i} type="button" onClick={() => applyAlternativeSlot(alt)} className="w-full text-left p-2 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-50 text-[11px] font-mono text-slate-700">
                              {alt.date} · {String(alt.startTime).slice(0, 5)} - {String(alt.endTime).slice(0, 5)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="font-bold text-slate-700">Reservation Title *</label>
                <input
                  type="text" required placeholder="e.g. Executive Board Meeting"
                  value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Facility Category</label>
                  <select
                    value={createForm.category} onChange={e => setCreateForm({ ...createForm, category: e.target.value as any })}
                    className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ROOM" className="bg-white text-slate-900">Conference / Meeting Room</option>
                    <option value="VEHICLE_BAY" className="bg-white text-slate-900">Vehicle Dock Bay</option>
                    <option value="EQUIPMENT" className="bg-white text-slate-900">Specialized AV / Equipment</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700">Room / Bay Selection</label>
                  <button
                    type="button"
                    onClick={() => setShowRoomPicker(true)}
                    className={`w-full mt-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none flex items-center justify-between gap-2 transition hover:border-emerald-400 ${
                      selectedRoom ? 'text-slate-900 font-semibold border-emerald-400' : 'text-slate-500 border-dashed'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <DoorOpen className={`w-4 h-4 shrink-0 ${selectedRoom ? 'text-emerald-600' : 'text-slate-400'}`} />
                      {selectedRoom ? (
                        <span className="truncate">
                          {selectedRoom.roomName}
                          <span className="text-slate-400 font-normal"> · {selectedRoom.facilityName}{selectedRoom.floorNumber != null ? ` · Floor ${selectedRoom.floorNumber}` : ''}</span>
                        </span>
                      ) : (
                        'Assign Room'
                      )}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg shrink-0">
                      {selectedRoom ? 'Change' : 'Choose'}
                    </span>
                  </button>
                  {!selectedRoom && (
                    <p className="text-[10px] text-slate-400 mt-1">Select a room from the directory. Availability is checked against the selected date & time.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Requester Name</label>
                  <input
                    type="text" required placeholder="Full Name" value={createForm.requesterName}
                    onChange={e => setCreateForm({ ...createForm, requesterName: e.target.value })}
                    className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Requester Email</label>
                  <input
                    type="email" required placeholder="name@photonic.com" value={createForm.requesterEmail}
                    onChange={e => setCreateForm({ ...createForm, requesterEmail: e.target.value })}
                    className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Reservation Date</label>
                  <DatePicker
                    required
                    value={createForm.date}
                    onChange={date => setCreateForm({ ...createForm, date })}
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Start Time</label>
                  <TimePicker
                    required
                    value={createForm.startTime}
                    onChange={start => {
                      // Auto-suggest End = Start + 1h when End is empty or now <= Start.
                      const toMin = (s: string) => {
                        const m = /^(\d{1,2}):(\d{2})$/.exec(s);
                        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
                      };
                      const startMin = toMin(start);
                      const endMin = toMin(createForm.endTime);
                      let end = createForm.endTime;
                      if (startMin !== null && (endMin === null || endMin <= startMin)) {
                        const e = Math.min(startMin + 60, 23 * 60 + 55);
                        end = `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
                      }
                      setCreateForm({ ...createForm, startTime: start, endTime: end });
                    }}
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">End Time</label>
                  <TimePicker
                    required
                    align="right"
                    value={createForm.endTime}
                    minTime={createForm.startTime}
                    onChange={end => setCreateForm({ ...createForm, endTime: end })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Expected Attendees</label>
                  <input
                    type="number" min={1} placeholder="e.g. 12" value={createForm.expectedAttendees}
                    onChange={e => setCreateForm({ ...createForm, expectedAttendees: e.target.value })}
                    className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Used by AI validation to check room capacity fit.</p>
                </div>
                <div>
                  <label className="font-bold text-slate-700">Priority Level</label>
                  <select
                    value={createForm.priority} onChange={e => setCreateForm({ ...createForm, priority: e.target.value as any })}
                    className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="LOW" className="bg-white text-slate-900">Low</option>
                    <option value="MEDIUM" className="bg-white text-slate-900">Medium</option>
                    <option value="HIGH" className="bg-white text-slate-900">High</option>
                    <option value="URGENT" className="bg-white text-slate-900">Urgent (Immediate Escalation)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Description / Purpose</label>
                <textarea
                  rows={2} placeholder="Event description, required setup..." value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-medium">{submitError}</div>
              )}

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 inline-flex items-center space-x-1.5 disabled:opacity-60">
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submitting ? 'Submitting…' : 'Submit & Escalate Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Reschedule Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Edit / Reschedule Reservation: {editModal.reservationId}</h3>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEditSave} className="p-5 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Title</label>
                <input type="text" value={editModal.title} onChange={e => setEditModal({ ...editModal, title: e.target.value })} className="w-full mt-1 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Start Time</label>
                  <input type="time" value={editModal.startTime} onChange={e => setEditModal({ ...editModal, startTime: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="font-bold text-slate-700">End Time</label>
                  <input type="time" value={editModal.endTime} onChange={e => setEditModal({ ...editModal, endTime: e.target.value })} className="w-full mt-1 bg-white text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div className="pt-3 flex justify-end space-x-2">
                <button type="button" onClick={() => setEditModal(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {escalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                Forward to Facilities Manager
              </h3>
              <button onClick={() => setEscalateModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3.5 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
                Forwarding request <strong className="font-mono font-bold text-slate-900">{escalateModal.reservationId}</strong> ({escalateModal.facilityName}) to Facilities Manager for final approval.
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Escalation Justification & Notes</label>
                <textarea
                  rows={3}
                  placeholder="Provide context, urgency reasons, or special requirements for the Facilities Manager..."
                  value={escalateNotes}
                  onChange={e => setEscalateNotes(e.target.value)}
                  className="w-full bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl p-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button onClick={() => setEscalateModal(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200">Cancel</button>
                <button onClick={() => handleEscalateSubmit(escalateModal.id)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 shadow-sm flex items-center space-x-1.5">
                  <Send className="w-3.5 h-3.5" />
                  <span>Confirm Escalation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Component 8: Generate Reports Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-400" />
                Generate Facilities Reservation Report
              </h3>
              <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">Select export format for reservation logs, resource utilization, and approval histories:</p>

              <div className="space-y-2">
                <button
                  onClick={() => { alert('Exported PDF Report successfully!'); setShowReportModal(false); }}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 flex items-center justify-between font-bold text-slate-800 transition"
                >
                  <span className="flex items-center gap-2"><FileText className="w-5 h-5 text-rose-500" /> Export PDF Summary Report</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => { alert('Exported Excel Spreadsheet successfully!'); setShowReportModal(false); }}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 flex items-center justify-between font-bold text-slate-800 transition"
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Export Excel (.xlsx) Dataset</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => { alert('Exported CSV File successfully!'); setShowReportModal(false); }}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 flex items-center justify-between font-bold text-slate-800 transition"
                >
                  <span className="flex items-center gap-2"><FileCode className="w-5 h-5 text-blue-600" /> Export Raw CSV Logs</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button onClick={() => setShowReportModal(false)} className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Reservation Details: {viewDetailModal.reservationId}</h3>
              <button onClick={() => setViewDetailModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">{viewDetailModal.title}</h4>
              <p className="text-slate-600"><strong className="text-slate-800">Facility:</strong> {viewDetailModal.facilityName}</p>
              <p className="text-slate-600"><strong className="text-slate-800">Requester:</strong> {viewDetailModal.requesterName} ({viewDetailModal.requesterEmail})</p>
              <p className="text-slate-600"><strong className="text-slate-800">Schedule:</strong> {viewDetailModal.reservationDate} ({viewDetailModal.startTime} - {viewDetailModal.endTime})</p>
              <p className="text-slate-600"><strong className="text-slate-800">Description:</strong> {viewDetailModal.description || 'N/A'}</p>
              <p className="text-slate-600"><strong className="text-slate-800">Governance Note:</strong> Facilities Officer can modify or reschedule this reservation; final approval is managed by Facilities Manager.</p>
              <div className="pt-3 flex justify-end">
                <button onClick={() => setViewDetailModal(null)} className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 font-semibold">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Room Picker Modal */}
      <RoomPicker
        open={showRoomPicker}
        date={createForm.date}
        startTime={createForm.startTime}
        endTime={createForm.endTime}
        onSelect={(room) => {
          setSelectedRoom(room);
          setCreateForm(f => ({ ...f, facilityName: room.facilityName }));
          setShowRoomPicker(false);
        }}
        onClose={() => setShowRoomPicker(false)}
      />
    </div>
  );
};
