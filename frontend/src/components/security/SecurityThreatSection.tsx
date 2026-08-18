import React, { useEffect, useState } from 'react';
import { useSecurityThreatStore } from '../../stores/securityThreatStore';
import SecurityThreatMap from './SecurityThreatMap';
import SecurityTelemetry from './SecurityTelemetry';
import GatewayLogs from './GatewayLogs';
import { isSuperAdmin, useAuthStore } from '../../stores/authStore';
import type { ThreatFilterType } from '../../types/threatMap';
import { Wifi, WifiOff, Bug, FlaskConical } from 'lucide-react';

/**
 * Real-time Geographic IP Threat Vector Map section for the Security Center.
 * REST provides the initial snapshot; STOMP pushes EVENT (~5s) and SYNC
 * (~30s) updates from the backend. Connect on mount, disconnect on unmount
 * (no duplicate connections).
 */
export const SecurityThreatSection: React.FC = () => {
  const {
    window,
    setWindow,
    threats,
    trustedSessions,
    stats,
    gatewayLogs,
    connected,
    loading,
    error,
    lastEventAt,
    lastEventType,
    lastEventLog,
    diagnostics,
    testingEvent,
    testResult,
    connect,
    disconnect,
    loadInitial,
    loadDiagnostics,
    triggerTestEvent,
  } = useSecurityThreatStore();

  const [filter, setFilter] = useState<ThreatFilterType>('ALL');
  const [debugOpen, setDebugOpen] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    void loadInitial();
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTestEvent = () => {
    void triggerTestEvent();
    // Refresh the snapshot so the new log + threat appear immediately.
    setTimeout(() => void loadInitial(), 700);
  };

  const toggleDebug = () => {
    const next = !debugOpen;
    setDebugOpen(next);
    if (next) void loadDiagnostics();
  };

  return (
    <div>
      {/* Live pipeline status + console actions */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{connected ? 'LIVE' : 'DISCONNECTED'}</span>
          </span>
          <span className="text-[11px] text-slate-500">
            Last event received:{' '}
            <span className="font-mono font-semibold text-slate-700">
              {lastEventAt ? formatClock(lastEventAt) : '—'}
            </span>
            {lastEventType ? <span className="text-slate-400"> ({lastEventType})</span> : null}
          </span>
        </div>
        {isSuperAdmin(user) && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleTestEvent}
              disabled={testingEvent}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              title="Admin test: persist a real security event and broadcast it live"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>{testingEvent ? 'Creating…' : 'Test Security Event'}</span>
            </button>
            <button
              onClick={toggleDebug}
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${debugOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Debug</span>
            </button>
          </div>
        )}
      </div>

      {testResult && (
        <div className="mb-4 p-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-xs font-mono">
          {testResult}
        </div>
      )}

      {debugOpen && isSuperAdmin(user) && (
        <div className="mb-4 p-4 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-100">Pipeline Diagnostics</span>
            <span className="text-slate-400">SUPER_ADMIN only</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5">
            <DebugRow label="STOMP connected" value={connected ? 'YES' : 'NO'} ok={connected} />
            <DebugRow label="Last frame" value={lastEventType ?? '—'} ok={!!lastEventType} />
            <DebugRow label="Last log action" value={lastEventLog?.action ?? '—'} ok={!!lastEventLog} />
            <DebugRow label="Last log IP" value={lastEventLog?.ip ?? '—'} ok={!!lastEventLog} />
            <DebugRow label="Threats in view" value={`${threats.length}`} ok={threats.length > 0} />
            <DebugRow label="Geolocated threats" value={`${threats.filter((t) => t.latitude != null && t.longitude != null).length}`} ok={threats.some((t) => t.latitude != null)} />
            <DebugRow label="Trusted sessions" value={`${trustedSessions.length}`} ok={trustedSessions.length > 0} />
          </div>
          {diagnostics && (
            <div className="mt-3 pt-3 border-t border-slate-700 space-y-1">
              <p>clientIp: <span className="text-emerald-400">{diagnostics.clientIp}</span> (v{diagnostics.ipVersion}, {diagnostics.privateIp ? 'LOCAL/PRIVATE' : 'public'})</p>
              <p>geoProvider: {diagnostics.geoProvider} · resolved: {diagnostics.geoResolved ? 'YES' : 'NO'}</p>
              {diagnostics.geolocation && (
                <p>
                  geo: {diagnostics.geolocation.city ?? '?'}, {diagnostics.geolocation.country ?? '?'} ·{' '}
                  {diagnostics.geolocation.isp ?? 'no ISP'} · {diagnostics.geolocation.asn ?? 'no ASN'}
                  {diagnostics.geolocation.accuracyRadiusKm != null ? ` · ±${diagnostics.geolocation.accuracyRadiusKm}km` : ''}
                </p>
              )}
              <p className="text-slate-500">{diagnostics.trustedHeaderChain}</p>
            </div>
          )}
        </div>
      )}

      <SecurityTelemetry stats={stats} window={window} />
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SecurityThreatMap
            threats={threats}
            trustedSessions={trustedSessions}
            filter={filter}
            onFilterChange={setFilter}
            window={window}
            onWindowChange={setWindow}
            loading={loading}
          />
        </div>
        <GatewayLogs logs={gatewayLogs} connected={connected} />
      </div>
    </div>
  );
};

const DebugRow: React.FC<{ label: string; value: string; ok: boolean }> = ({ label, value, ok }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-400">{label}</span>
    <span className={`${ok ? 'text-emerald-400' : 'text-rose-400'}`}>{value}</span>
  </div>
);

function formatClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '—';
  }
}

export default SecurityThreatSection;