import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, Calendar, FileText, Bell, User, Eye,
  Building2,
} from 'lucide-react';

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

export const FoReservationsPage: React.FC = () => {
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/facilities-officer/reservations');
      const json = await res.json();
      setReservations(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && reservations.length === 0) return <LoadingSkeleton />;
  if (error && reservations.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Facilities Reservation</h2>
          <p className="text-xs text-slate-500">Manage room and vehicle bay bookings</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Building2 className="w-4 h-4 text-emerald-600" />
        <span>Full transactional access: Create, Read, Update reservations (approvals escalated to Facilities Manager)</span>
      </div>

      {reservations.length === 0 ? (
        <EmptyState icon={Calendar} title="No Reservations" desc="No reservations have been created yet." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Title</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Requester</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Room/Bay</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Date/Time</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{r.title}</td>
                    <td className="p-3 text-slate-600">{r.requesterName || r.employeeName || '-'}</td>
                    <td className="p-3 text-slate-600">{r.roomName || r.bay || '-'}</td>
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

export const FoVisitorManagementPage: React.FC = () => {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/facilities-officer/visitors');
      const json = await res.json();
      setVisitors(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && visitors.length === 0) return <LoadingSkeleton />;
  if (error && visitors.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Visitor Management</h2>
          <p className="text-xs text-slate-500">View facility-linked visitors</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Eye className="w-4 h-4 text-amber-500" />
        <span>Read-only view of visitors associated with facility visits</span>
      </div>

      {visitors.length === 0 ? (
        <EmptyState icon={Eye} title="No Visitors" desc="No facility-linked visitors found." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Visitor</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Company</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Facility</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Check-In</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v: any) => (
                  <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{v.name}</td>
                    <td className="p-3 text-slate-600">{v.company || '-'}</td>
                    <td className="p-3 text-slate-600">{v.facilityName || v.facility || '-'}</td>
                    <td className="p-3 text-xs text-slate-400 font-mono">{v.checkIn ? new Date(v.checkIn).toLocaleString() : '-'}</td>
                    <td className="p-3">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        v.status === 'CHECKED_IN' ? 'bg-emerald-50 text-emerald-600' :
                        v.status === 'EXPECTED' ? 'bg-blue-50 text-blue-600' :
                        v.status === 'CHECKED_OUT' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-50 text-amber-600'
                      }`}>{v.status}</span>
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

export const FoDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/facilities-officer/documents');
      const json = await res.json();
      setDocuments(json?.data ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && documents.length === 0) return <LoadingSkeleton />;
  if (error && documents.length === 0) return <ErrorState message={error} onRetry={() => setRetry(r => r + 1)} />;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Facility Documents</h2>
          <p className="text-xs text-slate-500">Upload and view facility-related documents</p>
        </div>
        <button onClick={() => setRetry(r => r + 1)} className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"><RefreshCw className="w-4 h-4 text-slate-400" /></button>
      </div>

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No Documents" desc="No facility-related documents have been uploaded." />
      ) : (
        <div className="card-stat overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Name</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Type</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Uploaded By</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Date</th>
                  <th className="p-3 text-[10px] font-semibold text-slate-500 uppercase">Size</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d: any) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-900">{d.name}</td>
                    <td className="p-3 text-slate-600">{d.type || '-'}</td>
                    <td className="p-3 text-slate-600">{d.uploadedBy || '-'}</td>
                    <td className="p-3 text-xs text-slate-400 font-mono">{d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : '-'}</td>
                    <td className="p-3 text-xs text-slate-400">{d.size || '-'}</td>
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

export const FoNotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/facilities-officer/notifications');
      const json = await res.json();
      setNotifications(json?.data ?? []);
    } catch {} finally { setLoading(false); }
  }, [retry]);

  useEffect(() => { load(); }, [load]);

  if (loading && notifications.length === 0) return <LoadingSkeleton />;

  const typeColors: Record<string, string> = {
    NEW: 'border-l-amber-400',
    APPROVED: 'border-l-emerald-400',
    MAINTENANCE: 'border-l-blue-400',
    VISITOR: 'border-l-purple-400',
    REJECTED: 'border-l-rose-400',
  };

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
            <div key={n.id} className={`card-stat p-3 flex items-start space-x-3 border-l-4 ${typeColors[n.type] || 'border-l-slate-300'}`}>
              <div className="flex-1">
                <p className="text-sm text-slate-900">{n.message}</p>
                <p className="text-xs text-slate-500 mt-0.5">{n.details || ''}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">{n.timestamp ? new Date(n.timestamp).toLocaleString() : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const FoProfilePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Profile</h2>
          <p className="text-xs text-slate-500">Facilities Officer account</p>
        </div>
      </div>
      <EmptyState icon={User} title="Profile Settings" desc="Profile management will be available via TEAM 1 - Human Resource Management integration." />
    </div>
  );
};