import React from 'react';
import { Clock, CheckCircle2, XCircle, Search } from 'lucide-react';

export const VisitorApprovalQueue: React.FC = () => {
 const queue: { name: string; company: string; host: string; purpose: string; time: string; status: string }[] = [];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><Clock className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Visitor Approval Queue</h2>
 <p className="text-slate-400 text-xs mt-0.5">Pre-Registered Visitors Awaiting Authorization</p>
 </div>
 </div>

 <div className="grid grid-cols-3 gap-3">
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Pending Review</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{queue.filter(v => v.status === 'PENDING').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Awaiting Officer</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Pre-Approved</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{queue.filter(v => v.status === 'PRE_APPROVED').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Ready for Arrival</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Today's Visitors</span>
 <span className="text-xl font-bold text-white font-mono">{queue.length}</span>
 <span className="text-[10px] text-slate-500 block">Scheduled</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search visitors..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Visitor</th>
 <th className="p-3">Company</th>
 <th className="p-3">Host</th>
 <th className="p-3">Purpose</th>
 <th className="p-3">Time</th>
 <th className="p-3">Status</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {queue.map((v, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white">{v.name}</td>
 <td className="p-3 text-slate-400">{v.company}</td>
 <td className="p-3">{v.host}</td>
 <td className="p-3">{v.purpose}</td>
 <td className="p-3 font-mono">{v.time}</td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${v.status === 'PRE_APPROVED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-emerald-100 text-emerald-600 border border-slate-200'}`}>{v.status}</span>
 </td>
 <td className="p-3 text-right">
 <div className="flex items-center justify-end space-x-1.5">
 <button className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white text-[10px] font-bold transition-all border border-slate-200 flex items-center space-x-1">
 <CheckCircle2 className="w-3 h-3" /><span>Approve</span>
 </button>
 <button className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white text-[10px] font-bold transition-all border border-slate-200 flex items-center space-x-1">
 <XCircle className="w-3 h-3" /><span>Deny</span>
 </button>
 </div>
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
