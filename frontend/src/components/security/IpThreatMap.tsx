import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 MapContainer, TileLayer, CircleMarker, Popup, useMap
} from 'react-leaflet';
import {
 Shield, AlertTriangle, Globe, Ban, Users, Lock, RefreshCw,
 Maximize2, ChevronDown, Filter, Plus, Minus, RotateCcw
} from 'lucide-react';
import {
 IpThreatEntry, ThreatFilterType, ThreatMapStats,
 MARKER_COLORS, THREAT_TYPE_LABEL, getMarkerColor, getMarkerRadius
} from '../../types/threatMap';
import { threatMapService } from '../../api/threatMapService';

// ─── Map Resize Handler: Fixes empty background grid issue in Leaflet ─────────
const MapResizeHandler: React.FC = () => {
 const map = useMap();
 useEffect(() => {
 const timer = setTimeout(() => {
 map.invalidateSize();
 }, 150);
 return () => clearTimeout(timer);
 }, [map]);
 return null;
};

// ─── Custom Zoom & Controller Component ──────────────────────────────────────
const CustomMapControls: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null> }> = ({ containerRef }) => {
 const map = useMap();

 const handleZoomIn = () => map.zoomIn();
 const handleZoomOut = () => map.zoomOut();
 const handleReset = () => map.setView([20, 0], 2);

 const handleFullscreen = () => {
 const el = containerRef.current;
 if (!el) return;
 if (!document.fullscreenElement) {
 el.requestFullscreen?.();
 } else {
 document.exitFullscreen?.();
 }
 };

 return (
 <div className="absolute top-4 right-4 z-[999] flex flex-col space-y-1.5">
 <button
 onClick={handleZoomIn}
 className="p-2 rounded-lg bg-slate-900/90 border border-slate-200 text-slate-200 hover:text-white hover:bg-slate-800 transition-all duration-200 shadow-xl backdrop-blur-md"
 title="Zoom In"
 >
 <Plus className="w-4 h-4" />
 </button>
 <button
 onClick={handleZoomOut}
 className="p-2 rounded-lg bg-slate-900/90 border border-slate-200 text-slate-200 hover:text-white hover:bg-slate-800 transition-all duration-200 shadow-xl backdrop-blur-md"
 title="Zoom Out"
 >
 <Minus className="w-4 h-4" />
 </button>
 <button
 onClick={handleReset}
 className="p-2 rounded-lg bg-slate-900/90 border border-slate-200 text-slate-200 hover:text-white hover:bg-slate-800 transition-all duration-200 shadow-xl backdrop-blur-md"
 title="Reset View"
 >
 <RotateCcw className="w-4 h-4" />
 </button>
 <button
 onClick={handleFullscreen}
 className="p-2 rounded-lg bg-slate-900/90 border border-slate-200 text-slate-200 hover:text-white hover:bg-slate-800 transition-all duration-200 shadow-xl backdrop-blur-md"
 title="Toggle Fullscreen"
 >
 <Maximize2 className="w-4 h-4" />
 </button>
 </div>
 );
};

// ─── Requirement 4: Professional Marker Popup ────────────────────────────────
const ThreatPopupContent: React.FC<{ t: IpThreatEntry }> = ({ t }) => {
 const colorMeta = MARKER_COLORS[getMarkerColor(t.threatType)];

 const statusBadge =
 t.status === 'BLOCKED' ? 'text-rose-400 bg-rose-500/10 border-slate-200' :
 t.status === 'ACTIVE' ? 'text-emerald-600 bg-emerald-50 border-slate-200' :
 'text-emerald-600 bg-emerald-50 border-slate-200';

 const severityBadge =
 t.severity === 'CRITICAL' ? 'text-rose-400 bg-rose-950/60 border-slate-200' :
 t.severity === 'HIGH' ? 'text-orange-400 bg-orange-950/60 border-orange-600/40' :
 t.severity === 'MEDIUM' ? 'text-emerald-600 bg-amber-950/60 border-slate-200' :
 'text-slate-400 bg-slate-800/60 border-slate-200/40';

 const formattedFirstSeen = t.firstSeen ? new Date(t.firstSeen).toLocaleString() : 'N/A';
 const formattedLastSeen = t.lastSeen ? new Date(t.lastSeen).toLocaleString() : 'N/A';

 return (
 <div className="w-72 bg-slate-900 rounded-xl overflow-hidden shadow-2xl text-slate-200">
 {/* Header Banner */}
 <div
 className="px-4 py-3 border-b border-slate-200 flex items-center justify-between"
 style={{ borderLeft: `4px solid ${colorMeta.fill}` }}
 >
 <div className="flex items-center space-x-2.5">
 <Shield className="w-4 h-4 flex-shrink-0" style={{ color: colorMeta.fill }} />
 <div>
 <div className="font-mono font-bold text-sm text-white leading-none">{t.ip}</div>
 <div className="text-[11px] text-slate-400 mt-1">{t.city || 'Unknown City'}, {t.country || 'Global Origin'}</div>
 </div>
 </div>
 <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${statusBadge}`}>
 {t.status}
 </span>
 </div>

 {/* Details Grid */}
 <div className="p-4 space-y-2 text-xs">
 <div className="flex justify-between items-center py-1 border-b border-slate-200">
 <span className="text-slate-400 font-medium">Threat Type</span>
 <span className="font-semibold text-slate-100">{THREAT_TYPE_LABEL[t.threatType] || t.threatType}</span>
 </div>

 <div className="flex justify-between items-center py-1 border-b border-slate-200">
 <span className="text-slate-400 font-medium">Severity</span>
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${severityBadge}`}>
 {t.severity}
 </span>
 </div>

 <div className="flex justify-between items-center py-1 border-b border-slate-200">
 <span className="text-slate-400 font-medium">Total Requests</span>
 <span className="font-mono font-bold text-slate-100">{t.requests ? t.requests.toLocaleString() : 1}</span>
 </div>

 <div className="flex justify-between items-start py-1 border-b border-slate-200">
 <span className="text-slate-400 font-medium">First Seen</span>
 <span className="text-slate-300 text-right text-[11px] max-w-[150px] leading-tight">{formattedFirstSeen}</span>
 </div>

 <div className="flex justify-between items-start py-1 border-b border-slate-200">
 <span className="text-slate-400 font-medium">Last Seen</span>
 <span className="text-slate-300 text-right text-[11px] max-w-[150px] leading-tight">{formattedLastSeen}</span>
 </div>

 {(t.asn || t.isp) && (
 <div className="flex justify-between items-start pt-1">
 <span className="text-slate-400 font-medium">ASN / ISP</span>
 <span className="text-slate-300 text-right text-[11px] max-w-[150px] font-mono leading-tight">
 {t.asn ? `${t.asn} — ` : ''}{t.isp}
 </span>
 </div>
 )}
 </div>
 </div>
 );
};

// ─── Requirement 6: Threat Legend Component ──────────────────────────────────
const ThreatLegend: React.FC = () => (
 <div className="absolute bottom-4 left-4 z-[999] bg-slate-900/95 border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-2xl backdrop-blur-md max-w-[280px]">
 <div className="flex items-center justify-between pb-1 border-b border-slate-200">
 <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Threat Classification</span>
 <span className="text-[10px] text-slate-500 font-mono">LEGEND</span>
 </div>

 <div className="space-y-1.5">
 <div className="flex items-center space-x-2.5">
 <span className="w-3 h-3 rounded-full flex-shrink-0 bg-rose-500 shadow-sm" />
 <span className="text-xs text-slate-200">Attack Source <span className="text-[10px] text-slate-400">(DDoS, SQLi, Malware)</span></span>
 </div>
 <div className="flex items-center space-x-2.5">
 <span className="w-3 h-3 rounded-full flex-shrink-0 bg-sky-400 shadow-sm" />
 <span className="text-xs text-slate-200">Failed Login / Scanner <span className="text-[10px] text-slate-400">(XSS)</span></span>
 </div>
 <div className="flex items-center space-x-2.5">
 <span className="w-3 h-3 rounded-full flex-shrink-0 bg-amber-500 shadow-sm" />
 <span className="text-xs text-slate-200">High Volume <span className="text-[10px] text-slate-400">(Bot, Brute Force)</span></span>
 </div>
 <div className="flex items-center space-x-2.5">
 <span className="w-3 h-3 rounded-full flex-shrink-0 bg-emerald-600 shadow-sm" />
 <span className="text-xs text-slate-200">Trusted / Internal</span>
 </div>
 </div>

 <div className="border-t border-slate-200 pt-2 space-y-1">
 <span className="text-[10px] font-semibold text-slate-400 block uppercase">Severity Marker Scale</span>
 <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
 <span className="flex items-center space-x-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /><span>Low</span></span>
 <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /><span>Med</span></span>
 <span className="flex items-center space-x-1"><span className="w-3.5 h-3.5 rounded-full bg-slate-400" /><span>High</span></span>
 <span className="flex items-center space-x-1"><span className="w-4 h-4 rounded-full bg-slate-400" /><span>Critical</span></span>
 </div>
 </div>
 </div>
);

// ─── Requirement 5: Threat Statistics Panel ──────────────────────────────────
const ThreatStatsPanel: React.FC<{ stats: ThreatMapStats }> = ({ stats }) => {
 const statItems = [
 { label: 'Total Threat IPs', value: stats.totalThreatIps, icon: Globe, color: 'text-rose-400 bg-rose-500/10 border-slate-200' },
 { label: 'Detected (24h)', value: stats.detectedLast24h, icon: AlertTriangle, color: 'text-emerald-600 bg-emerald-50 border-slate-200' },
 { label: 'Countries Affected', value: stats.countriesAffected, icon: Shield, color: 'text-emerald-600 bg-sky-500/10 border-sky-500/20' },
 { label: 'Blocked IPs', value: stats.blockedIps, icon: Ban, color: 'text-rose-400 bg-rose-500/10 border-slate-200' },
 { label: 'Active Sessions', value: stats.activeSessions, icon: Users, color: 'text-emerald-600 bg-emerald-50 border-slate-200' },
 { label: 'Failed Login Attempts', value: stats.failedLoginAttempts, icon: Lock, color: 'text-emerald-600 bg-emerald-50 border-slate-200' },
 ];

 return (
 <div className="w-full lg:w-64 flex flex-col space-y-2.5 flex-shrink-0">
 <div className="bg-slate-900/80 border border-slate-200 rounded-xl p-3.5 backdrop-blur-md">
 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Live Telemetry Overview</h4>
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2.5">
 {statItems.map(({ label, value, icon: Icon, color }) => (
 <div key={label} className="bg-slate-950/70 border border-slate-200 rounded-xl p-3 flex items-center space-x-3 transition-all duration-200 hover:border-slate-200">
 <div className={`p-2 rounded-lg border flex-shrink-0 ${color}`}>
 <Icon className="w-4 h-4" />
 </div>
 <div>
 <div className="text-lg font-bold text-white font-mono leading-none">{value}</div>
 <div className="text-[10px] font-medium text-slate-400 mt-1 leading-tight">{label}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
};

// ─── Requirement 7: Filter Dropdown Control ──────────────────────────────────
const ThreatFilterDropdown: React.FC<{
 value: ThreatFilterType;
 onChange: (val: ThreatFilterType) => void;
}> = ({ value, onChange }) => {
 const [open, setOpen] = useState(false);
 const options: ThreatFilterType[] = [
 'ALL', 'DDOS', 'SQL_INJECTION', 'XSS', 'BRUTE_FORCE',
 'FAILED_LOGIN', 'PORT_SCAN', 'MALWARE', 'BOT_TRAFFIC'
 ];

 return (
 <div className="relative">
 <button
 onClick={() => setOpen(o => !o)}
 className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-200 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-all duration-200 shadow-md"
 >
 <Filter className="w-3.5 h-3.5 text-emerald-600" />
 <span>{THREAT_TYPE_LABEL[value]}</span>
 <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
 </button>

 {open && (
 <div className="absolute right-0 top-full mt-1.5 z-[1000] w-48 bg-slate-900 border border-slate-200 rounded-xl shadow-2xl py-1 backdrop-blur-xl">
 {options.map(opt => (
 <button
 key={opt}
 onClick={() => { onChange(opt); setOpen(false); }}
 className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between ${
 value === opt
 ? 'text-emerald-600 font-bold bg-emerald-50'
 : 'text-slate-300 hover:text-white hover:bg-slate-800'
 }`}
 >
 <span>{THREAT_TYPE_LABEL[opt]}</span>
 {value === opt && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
 </button>
 ))}
 </div>
 )}
 </div>
 );
};

// ─── Main Component: Enterprise Geographic IP Threat Vector Map ─────────────
export const IpThreatMap: React.FC = () => {
 const mapContainerRef = useRef<HTMLDivElement>(null);
 const [threats, setThreats] = useState<IpThreatEntry[]>([]);
 const [stats, setStats] = useState<ThreatMapStats>({
 totalThreatIps: 0, detectedLast24h: 0, countriesAffected: 0,
 blockedIps: 0, activeSessions: 0, failedLoginAttempts: 0,
 });
 const [filter, setFilter] = useState<ThreatFilterType>('ALL');
 const [loading, setLoading] = useState(true);

 // Requirement 9: Load live threat vector telemetry from backend API (Zero Mock Data)
 const loadData = useCallback(async () => {
 setLoading(true);
 try {
 const res = await threatMapService.fetchThreats();
 setThreats(res.threats || []);
 setStats(res.stats);
 } catch {
 setThreats([]);
 setStats({
 totalThreatIps: 0,
 detectedLast24h: 0,
 countriesAffected: 0,
 blockedIps: 0,
 activeSessions: 0,
 failedLoginAttempts: 0,
 });
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 loadData();

 // Requirement 8: SSE Stream for real-time telemetry updates without page reloads
 let cleanup: (() => void) | undefined;
 try {
 cleanup = threatMapService.openThreatStream(newEntry => {
 setThreats(prev => {
 const idx = prev.findIndex(t => t.ip === newEntry.ip);
 if (idx >= 0) {
 const updated = [...prev];
 updated[idx] = newEntry;
 return updated;
 }
 return [newEntry, ...prev];
 });

 setStats(prev => ({
 ...prev,
 totalThreatIps: prev.totalThreatIps + 1,
 detectedLast24h: prev.detectedLast24h + 1,
 }));
 });
 } catch {
 /* SSE Stream initialized */
 }

 return () => cleanup?.();
 }, [loadData]);

 // Requirement 7: Filter threat array based on selected dropdown type
 const filteredThreats = useMemo(() => {
 if (filter === 'ALL') return threats;
 return threats.filter(t => t.threatType === filter);
 }, [threats, filter]);

 return (
 <div className="flex flex-col space-y-4">
 {/* Header Controls Bar */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-200 rounded-2xl p-4 backdrop-blur-xl">
 <div className="flex items-center space-x-3">
 <div className="p-2.5 rounded-xl bg-emerald-50 border border-slate-200 text-emerald-600">
 <Globe className="w-5 h-5" />
 </div>
 <div>
 <h3 className="font-heading font-bold text-lg text-white">Geographic IP Threat Vector Map</h3>
 <p className="text-xs text-slate-400 mt-0.5">
 Live database threat telemetry monitored across {stats.countriesAffected} sovereign regions
 </p>
 </div>
 </div>

 <div className="flex items-center space-x-3">
 <ThreatFilterDropdown value={filter} onChange={setFilter} />

 <button
 onClick={loadData}
 disabled={loading}
 className="p-2 rounded-lg bg-slate-900 border border-slate-200 text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-200 disabled:opacity-40 shadow-sm"
 title="Refresh Threat Vectors"
 >
 <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
 </button>

 <span className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-200 text-emerald-600 font-mono text-xs font-bold shadow-inner">
 {filteredThreats.length} THREAT VECTORS
 </span>
 </div>
 </div>

 {/* Main Grid Layout: Stats Panel + Interactive World Map */}
 <div className="flex flex-col lg:flex-row gap-4">
 {/* Requirement 5: Threat Statistics Panel */}
 <ThreatStatsPanel stats={stats} />

 {/* Requirements 1, 2, 3, 6, 7: Interactive Map Container */}
 <div
 ref={mapContainerRef}
 className="relative flex-1 rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 shadow-2xl"
 style={{ minHeight: '540px' }}
 >
 {!loading ? (
 <MapContainer
 center={[20, 0]}
 zoom={2}
 minZoom={2}
 maxZoom={12}
 zoomControl={false}
 scrollWheelZoom={true}
 style={{ height: '100%', width: '100%', minHeight: '540px', background: '#020617' }}
 worldCopyJump={true}
 >
 {/* Fixes Leaflet tile rendering grid calculations */}
 <MapResizeHandler />

 {/* Requirement 1: Ultra-reliable Esri World Dark Gray Canvas Map Tiles */}
 <TileLayer
 url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
 attribution=""
 maxZoom={16}
 />

 {/* Requirement 7: Custom Map Controls */}
 <CustomMapControls containerRef={mapContainerRef} />

 {/* Requirement 6: Map Legend Overlay */}
 <ThreatLegend />

 {/* Requirements 2 & 3: Clean Static Threat Markers (Zero Blinking) */}
 {filteredThreats.map((t) => {
 const colorMeta = MARKER_COLORS[getMarkerColor(t.threatType)];
 const radius = getMarkerRadius(t.severity);

 return (
 <CircleMarker
 key={`${t.ip}-${t.threatType}`}
 center={[t.latitude || 0, t.longitude || 0]}
 radius={radius}
 pathOptions={{
 fillColor: colorMeta.fill,
 fillOpacity: 0.85,
 color: colorMeta.border,
 weight: 2,
 opacity: 0.95,
 }}
 >
 {/* Requirement 4: Professional Marker Detail Popup */}
 <Popup className="threat-popup" maxWidth={300} minWidth={260}>
 <ThreatPopupContent t={t} />
 </Popup>
 </CircleMarker>
 );
 })}
 </MapContainer>
 ) : (
 <div className="h-full flex items-center justify-center text-slate-500 min-h-[540px]">
 <div className="text-center space-y-2">
 <Globe className="w-8 h-8 mx-auto text-emerald-600/60" />
 <p className="text-sm font-medium text-slate-400">Loading interactive world map tiles…</p>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 );
};

export default IpThreatMap;
