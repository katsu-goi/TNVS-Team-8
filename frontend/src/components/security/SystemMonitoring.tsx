import React from 'react';
import { Monitor, Server, Database, Wifi, Activity, Clock, Shield } from 'lucide-react';

export const SystemMonitoring: React.FC = () => {
 const services = [
 { name: 'Supabase Database', type: 'Database', status: 'OPERATIONAL', uptime: '99.97%', latency: '12ms' },
 { name: 'WebSocket STOMP', type: 'Messaging', status: 'OPERATIONAL', uptime: '99.95%', latency: '8ms' },
 { name: 'REST API Gateway', type: 'API', status: 'OPERATIONAL', uptime: '99.99%', latency: '45ms' },
 { name: 'Auth Service (JWT)', type: 'Authentication', status: 'OPERATIONAL', uptime: '99.98%', latency: '22ms' },
 { name: 'AI Classification Engine', type: 'AI/ML', status: 'DEGRADED', uptime: '98.50%', latency: '320ms' },
 { name: 'OCR Pipeline', type: 'Processing', status: 'OPERATIONAL', uptime: '99.50%', latency: '180ms' },
 ];

 const getStatusColor = (s: string) => {
 switch (s) {
 case 'OPERATIONAL': return 'text-emerald-600';
 case 'DEGRADED': return 'text-emerald-600';
 case 'OUTAGE': return 'text-rose-400';
 default: return 'text-slate-400';
 }
 };

 const getStatusBg = (s: string) => {
 switch (s) {
 case 'OPERATIONAL': return 'bg-emerald-50 border-slate-200';
 case 'DEGRADED': return 'bg-emerald-50 border-slate-200';
 case 'OUTAGE': return 'bg-rose-500/10 border-slate-200';
 default: return 'bg-slate-900 border-slate-200';
 }
 };

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><Monitor className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">System Monitoring</h2>
 <p className="text-slate-400 text-xs mt-0.5">Enterprise Infrastructure • Service Health & Performance</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Services</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{services.length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Monitored</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Operational</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{services.filter(s => s.status === 'OPERATIONAL').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Healthy</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Degraded</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{services.filter(s => s.status === 'DEGRADED').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Attention Needed</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Avg Latency</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">98ms</span>
 <span className="text-[10px] text-slate-500 block">System-wide</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="font-heading font-bold text-white text-sm flex items-center space-x-2">
 <Server className="w-4 h-4 text-emerald-600" />
 <span>Service Health Dashboard</span>
 </h3>
 <span className="flex items-center space-x-1.5 text-xs text-emerald-600">
 <Activity className="w-3.5 h-3.5 animate-pulse" />
 <span>Auto-refreshing</span>
 </span>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {services.map((svc, i) => (
 <div key={i} className={`p-4 rounded-xl border ${getStatusBg(svc.status)} space-y-2`}>
 <div className="flex items-center justify-between">
 <div className="flex items-center space-x-2">
 {svc.type === 'Database' ? <Database className="w-4 h-4 text-emerald-600" /> :
 svc.type === 'Messaging' ? <Wifi className="w-4 h-4 text-emerald-600" /> :
 svc.type === 'API' ? <Server className="w-4 h-4 text-emerald-600" /> :
 svc.type === 'Authentication' ? <Shield className="w-4 h-4 text-emerald-600" /> :
 <Activity className="w-4 h-4 text-slate-400" />}
 <span className="font-semibold text-white text-sm">{svc.name}</span>
 </div>
 <span className={`text-[10px] font-bold font-mono ${getStatusColor(svc.status)}`}>{svc.status}</span>
 </div>
 <div className="flex items-center space-x-4 text-[11px] text-slate-400">
 <span className="flex items-center space-x-1"><Clock className="w-3 h-3" /><span>Uptime: {svc.uptime}</span></span>
 <span className="flex items-center space-x-1"><Activity className="w-3 h-3" /><span>Latency: {svc.latency}</span></span>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
};
