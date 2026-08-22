import React from 'react';
import { Radio } from 'lucide-react';
import type { GatewayLogEntry } from '../../types/threatMap';

const severityBadge: Record<string, string> = {
  CRITICAL: 'bg-rose-100 text-rose-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-slate-100 text-slate-600',
};

const GatewayLogs: React.FC<{ logs: GatewayLogEntry[]; connected: boolean }> = ({ logs, connected }) => {
  return (
    <div className="card-stat p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <Radio className={`w-4 h-4 ${connected ? 'text-emerald-500' : 'text-slate-400'}`} />
          <span>Real-time Gateway Logs</span>
        </h3>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
      {logs.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">No activity logged.</div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {logs.map((log, i) => (
            <div key={`${log.timestamp}-${i}`} className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-mono">{formatTime(log.timestamp)}</span>
                <span className={`px-1.5 py-0.5 rounded font-mono ${severityBadge[log.severity] ?? severityBadge.LOW}`}>{log.severity}</span>
              </div>
              <p className="text-[11px] text-slate-600 font-mono break-all">
                <span className="font-bold text-slate-800">{log.action}</span> from {log.ip}
                {log.privateIp && <span className="ml-1 px-1 py-0.5 rounded bg-slate-200 text-slate-500 text-[9px] font-bold">LOCAL</span>}
              </p>
              {(log.username || log.city || log.country) && (
                <p className="text-[10px] text-slate-400 font-mono break-all">
                  {[log.username, locationText(log.city, log.country)].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="text-[10px] text-slate-400 font-mono break-all">{log.reason || log.module}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function locationText(city: string | null, country: string | null): string {
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return '';
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default GatewayLogs;