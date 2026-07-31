import React from 'react';
import { Activity, Server } from 'lucide-react';

export const SubsystemHealthGrid: React.FC = () => {
  return (
    <div className="space-y-6 text-slate-800 font-sans">
      {/* SECTION TITLE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-2 border-b border-slate-200 gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span>System Subsystem Health & Availability Monitoring</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time telemetry, API latency bounds, data pipeline sync, and vault capacity breakdown.
          </p>
        </div>
      </div>

      {/* EMPTY STATE */}
      <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-sm flex flex-col items-center justify-center text-center">
        <div className="p-4 rounded-2xl bg-slate-100 mb-4">
          <Server className="w-10 h-10 text-slate-300" />
        </div>
        <p className="text-lg font-bold text-slate-700">No Health Telemetry Available</p>
        <p className="text-sm text-slate-500 max-w-md mt-1">
          Subsystem health metrics will appear here once telemetry data is reported by the backend services.
        </p>
      </div>
    </div>
  );
};
