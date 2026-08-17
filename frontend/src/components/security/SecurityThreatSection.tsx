import React, { useEffect, useState } from 'react';
import { useSecurityThreatStore } from '../../stores/securityThreatStore';
import SecurityThreatMap from './SecurityThreatMap';
import SecurityTelemetry from './SecurityTelemetry';
import GatewayLogs from './GatewayLogs';
import type { ThreatFilterType } from '../../types/threatMap';

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
    connect,
    disconnect,
    loadInitial,
  } = useSecurityThreatStore();

  const [filter, setFilter] = useState<ThreatFilterType>('ALL');

  useEffect(() => {
    void loadInitial();
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <SecurityTelemetry stats={stats} />
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

export default SecurityThreatSection;