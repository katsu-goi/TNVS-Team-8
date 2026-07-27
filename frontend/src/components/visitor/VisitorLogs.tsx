import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { visitorService, ApiVisitor } from '../../api/visitorService';
import { extractErrorMessage } from '../../api/client';

export const VisitorLogs: React.FC = () => {
 const [logs, setLogs] = useState<ApiVisitor[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 const loadVisitors = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const data = await visitorService.getAllVisitors();
 setLogs(data);
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { loadVisitors(); }, [loadVisitors]);

 const formatTime = (iso?: string) => {
 if (!iso) return '-';
 return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
 };

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><FileText className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Visitor Logs</h2>
 <p className="text-slate-400 text-xs mt-0.5">Check-In / Check-Out History & Access Records</p>
 </div>
 </div>

 {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2"><AlertCircle className="w-4 h-4" /><span>{error}</span><button onClick={loadVisitors} className="ml-auto underline text-xs">Retry</button></div>}

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Today</span>
 <span className="text-xl font-bold text-white font-mono">{logs.length}</span>
 <span className="text-[10px] text-slate-500 block">All Visitors</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Checked In</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{logs.filter(l => l.status === 'CHECKED_IN').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">On Premises</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Checked Out</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{logs.filter(l => l.status === 'CHECKED_OUT').length}</span>
 <span className="text-[10px] text-slate-500 block">Departed</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">No Show</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{logs.filter(l => l.status === 'NO_SHOW').length}</span>
 <span className="text-[10px] text-rose-500/80 block">Missed</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search visitor logs..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <button onClick={loadVisitors} className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs">{loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Refresh'}</button>
 </div>
 {loading ? (
 <div className="flex items-center space-x-2 text-slate-400 text-sm py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /><span>Loading visitor logs…</span></div>
 ) : logs.length === 0 ? (
 <div className="text-center py-10 text-slate-500 text-sm">No visitor logs found.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Visitor</th>
 <th className="p-3">Company</th>
 <th className="p-3">Host</th>
 <th className="p-3">Check-In</th>
 <th className="p-3">Check-Out</th>
 <th className="p-3">Status</th>
 </tr>
 </thead>
 <tbody >
 {logs.map((l) => (
 <tr key={l.id} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white">{l.fullName}</td>
 <td className="p-3 text-slate-400">{l.company || '-'}</td>
 <td className="p-3">{l.hostEmployeeId || '-'}</td>
 <td className="p-3 font-mono">{formatTime(l.actualArrival)}</td>
 <td className="p-3 font-mono">{formatTime(l.actualDeparture)}</td>
 <td className="p-3">
 <span className={`flex items-center space-x-1 text-[10px] font-bold ${l.status === 'CHECKED_IN' ? 'text-emerald-600' : l.status === 'CHECKED_OUT' ? 'text-emerald-600' : 'text-rose-400'}`}>
 {l.status === 'CHECKED_IN' ? <Clock className="w-3 h-3" /> : l.status === 'CHECKED_OUT' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
 <span>{l.status || 'REGISTERED'}</span>
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>
 );
};
