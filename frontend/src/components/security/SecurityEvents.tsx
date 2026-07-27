import React from 'react';
import { Activity, Search, ShieldAlert, Shield, Eye } from 'lucide-react';

export const SecurityEvents: React.FC = () => {
 const events = [
 { type: 'INTRUSION_DETECTED', source: '203.0.113.88', detail: 'Port scan detected on firewall port 443', severity: 'CRITICAL', timestamp: '2026-07-27 09:23:15' },
 { type: 'UNAUTHORIZED_ACCESS', source: '198.51.100.42', detail: 'Repeated failed login attempts to admin panel', severity: 'HIGH', timestamp: '2026-07-27 08:45:00' },
 { type: 'MALWARE_DETECTED', source: 'Endpoint WS-009', detail: 'Suspicious binary signature detected', severity: 'HIGH', timestamp: '2026-07-27 07:30:22' },
 { type: 'POLICY_VIOLATION', source: 'User: jdoe', detail: 'Attempted USB mass storage device connection', severity: 'MEDIUM', timestamp: '2026-07-27 06:55:10' },
 { type: 'INFO_EVENT', source: 'System', detail: 'Routine security scan completed - no threats', severity: 'INFO', timestamp: '2026-07-27 06:00:00' },
 ];

 const getSeverityColor = (s: string) => {
 switch (s) {
 case 'CRITICAL': return 'bg-rose-500/20 text-rose-400 border border-slate-200';
 case 'HIGH': return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
 case 'MEDIUM': return 'bg-emerald-100 text-emerald-600 border border-slate-200';
 default: return 'bg-emerald-100 text-emerald-600 border border-slate-200';
 }
 };

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-400"><Activity className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Security Events</h2>
 <p className="text-slate-400 text-xs mt-0.5">Real-Time Security Event Monitoring • SIEM Integration</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Events (24h)</span>
 <span className="text-xl font-bold text-white font-mono">{events.length}</span>
 <span className="text-[10px] text-slate-500 block">Last 24 Hours</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Critical</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{events.filter(e => e.severity === 'CRITICAL').length}</span>
 <span className="text-[10px] text-rose-500/80 block">Immediate Action</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-orange-500/20">
 <span className="text-[11px] font-medium text-slate-400 block">High Severity</span>
 <span className="text-xl font-bold text-orange-400 font-mono">{events.filter(e => e.severity === 'HIGH').length}</span>
 <span className="text-[10px] text-orange-500/80 block">Investigate</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Resolved</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">3</span>
 <span className="text-[10px] text-emerald-600/80 block">Acknowledged</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="relative max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search events..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Event Type</th>
 <th className="p-3">Source</th>
 <th className="p-3">Details</th>
 <th className="p-3">Severity</th>
 <th className="p-3">Timestamp</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {events.map((e, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2">
 {e.severity === 'CRITICAL' || e.severity === 'HIGH' ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> : <Shield className="w-3.5 h-3.5 text-emerald-600" />}
 <span>{e.type}</span>
 </td>
 <td className="p-3 font-mono text-slate-400">{e.source}</td>
 <td className="p-3 max-w-xs truncate text-slate-300">{e.detail}</td>
 <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${getSeverityColor(e.severity)}`}>{e.severity}</span></td>
 <td className="p-3 font-mono text-slate-400">{e.timestamp}</td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors flex items-center space-x-1">
 <Eye className="w-3 h-3" /><span>Investigate</span>
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
};
