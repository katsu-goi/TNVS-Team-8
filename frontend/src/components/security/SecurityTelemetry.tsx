import React from 'react';
import { Globe, ShieldAlert, Ban, Users, Lock, Radar } from 'lucide-react';
import type { ThreatMapStats, ThreatWindow } from '../../types/threatMap';

const SecurityTelemetry: React.FC<{ stats: ThreatMapStats; window: ThreatWindow }> = ({ stats, window }) => {
  const items = [
    { label: 'Total Threat IPs', value: stats.totalThreatIps, icon: Radar, color: 'text-rose-600 bg-rose-50' },
    { label: `Detected (${window})`, value: stats.detectedLast24h, icon: ShieldAlert, color: 'text-amber-600 bg-amber-50' },
    { label: 'Countries Affected', value: stats.countriesAffected, icon: Globe, color: 'text-sky-600 bg-sky-50' },
    { label: 'Blocked IPs', value: stats.blockedIps, icon: Ban, color: 'text-rose-600 bg-rose-50' },
    { label: 'Active Sessions', value: stats.activeSessions, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Failed Login Attempts', value: stats.failedLoginAttempts, icon: Lock, color: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="card-stat p-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`p-2 rounded-lg ${color}`}><Icon className="w-4 h-4" /></span>
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono">{value}</p>
          <p className="text-[11px] text-slate-500 uppercase tracking-wide mt-1">{label}</p>
        </div>
      ))}
    </div>
  );
};

export default SecurityTelemetry;