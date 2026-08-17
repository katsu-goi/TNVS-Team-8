import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import {
  Globe, Maximize2, Minus, Plus, RotateCcw, Scan, ShieldAlert,
} from 'lucide-react';
import ThreatMarkers from './ThreatMarkers';
import type { ThreatFilterType, ThreatWindow } from '../../types/threatMap';
import { THREAT_TYPE_LABEL, THREAT_WINDOWS, THREAT_WINDOW_LABEL } from '../../types/threatMap';

const MapResizeHandler: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

const FitAll: React.FC<{ count: number }> = ({ count }) => {
  const map = useMap();
  useEffect(() => {
    if (count === 0) {
      map.setView([20, 0], 2);
      return;
    }
    // Fit the whole world by default; individual markers cluster fine.
    map.setView([20, 0], 2);
  }, [count, map]);
  return null;
};

const Legend: React.FC = () => (
  <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 border border-slate-200 rounded-xl p-3 shadow-lg max-w-[240px]">
    <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-100">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Threat Classification</span>
      <span className="text-[9px] text-slate-400 font-mono">LEGEND</span>
    </div>
    <div className="space-y-1.5">
      <div className="flex items-center space-x-2">
        <span className="w-3 h-3 rounded-full bg-rose-500 flex-shrink-0" />
        <span className="text-xs text-slate-600">Attack Source <span className="text-[10px] text-slate-400">(SQLi, XSS, Blocked, Lockout)</span></span>
      </div>
      <div className="flex items-center space-x-2">
        <span className="w-3 h-3 rounded-full bg-sky-400 flex-shrink-0" />
        <span className="text-xs text-slate-600">Scanner / Failed Login</span>
      </div>
      <div className="flex items-center space-x-2">
        <span className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0" />
        <span className="text-xs text-slate-600">High Volume (Rate Limit)</span>
      </div>
      <div className="flex items-center space-x-2">
        <span className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
        <span className="text-xs text-slate-600">Trusted Session</span>
      </div>
    </div>
  </div>
);

const MapControls: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null> }> = ({ containerRef }) => {
  const map = useMap();
  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };
  const btn = 'p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-emerald-400 transition-all duration-200 shadow-md';
  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col space-y-1.5">
      <button onClick={() => map.zoomIn()} className={btn} title="Zoom In"><Plus className="w-4 h-4" /></button>
      <button onClick={() => map.zoomOut()} className={btn} title="Zoom Out"><Minus className="w-4 h-4" /></button>
      <button onClick={() => map.setView([20, 0], 2)} className={btn} title="Reset View"><RotateCcw className="w-4 h-4" /></button>
      <button onClick={handleFullscreen} className={btn} title="Toggle Fullscreen"><Maximize2 className="w-4 h-4" /></button>
    </div>
  );
};

export const SecurityThreatMap: React.FC<{
  threats: Parameters<typeof ThreatMarkers>[0]['threats'];
  trustedSessions: Parameters<typeof ThreatMarkers>[0]['trustedSessions'];
  filter: ThreatFilterType;
  onFilterChange: (f: ThreatFilterType) => void;
  window: ThreatWindow;
  onWindowChange: (w: ThreatWindow) => void;
  loading: boolean;
}> = ({ threats, trustedSessions, filter, onFilterChange, window, onWindowChange, loading }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterOptions: ThreatFilterType[] = [
    'ALL', 'SQL_INJECTION', 'XSS', 'BLOCKED_IP', 'ACCOUNT_LOCKED',
    'FAILED_LOGIN', 'PORT_SCAN', 'RATE_LIMIT', 'TRUSTED',
  ];

  const hasMarkers = threats.some((t) => t.latitude != null && t.longitude != null)
    || trustedSessions.some((s) => s.latitude != null && s.longitude != null);

  return (
    <div className="card-stat overflow-hidden relative" style={{ minHeight: '540px' }}>
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><Globe className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-slate-900">Geographic IP Threat Vector Map</h3>
            <p className="text-xs text-slate-500">Live security telemetry aggregated from the database</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Window selector */}
          <select
            value={window}
            onChange={(e) => onWindowChange(e.target.value as ThreatWindow)}
            className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:border-emerald-400"
            title="Time window"
          >
            {THREAT_WINDOWS.map((w) => (
              <option key={w} value={w}>{THREAT_WINDOW_LABEL[w]}</option>
            ))}
          </select>
          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 transition-colors"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>{THREAT_TYPE_LABEL[filter]}</span>
            </button>
            {filtersOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-[1001] w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1">
                {filterOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { onFilterChange(opt); setFiltersOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${filter === opt ? 'text-emerald-600 font-bold bg-emerald-50' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {THREAT_TYPE_LABEL[opt]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-mono text-xs font-bold">
            {threats.length} VECTORS
          </span>
        </div>
      </div>

      {/* Map */}
      <div ref={containerRef} className="relative" style={{ height: '540px' }}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center space-y-2">
              <Globe className="w-8 h-8 mx-auto text-emerald-600/50" />
              <p className="text-sm font-medium">Loading map tiles...</p>
            </div>
          </div>
        ) : (
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={2}
            maxZoom={14}
            zoomControl={false}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
            worldCopyJump
          >
            <MapResizeHandler />
            <FitAll count={threats.length + trustedSessions.length} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />
            <MapControls containerRef={containerRef} />
            <Legend />
            <ThreatMarkers threats={threats} trustedSessions={trustedSessions} filter={filter} />
          </MapContainer>
        )}

        {/* Empty state overlay */}
        {!loading && !hasMarkers && (
          <div className="absolute inset-0 z-[1002] flex items-center justify-center pointer-events-none">
            <div className="bg-white/95 border border-slate-200 rounded-2xl shadow-xl px-6 py-5 text-center pointer-events-auto max-w-sm">
              <ShieldAlert className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-bold text-slate-800">No security threats detected</p>
              <p className="text-xs text-slate-500 mt-1">No security threats detected in the selected period.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityThreatMap;