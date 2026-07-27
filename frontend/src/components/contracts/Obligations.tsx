import React from 'react';
import { BookOpen, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const Obligations: React.FC = () => {
 const obligations = [
 { contract: 'Cloud Infrastructure', obligation: 'Monthly Uptime ≥ 99.9%', owner: 'Engineering', dueDate: 'Monthly', status: 'MET' },
 { contract: 'Office Lease', obligation: 'Quarterly Rent Payment', owner: 'Finance', dueDate: '2026-10-01', status: 'UPCOMING' },
 { contract: 'Software License', obligation: 'Annual Compliance Report', owner: 'IT Security', dueDate: '2026-12-15', status: 'UPCOMING' },
 { contract: 'Consulting Retainer', obligation: 'Monthly Status Report', owner: 'Project Mgmt', dueDate: '2026-08-05', status: 'OVERDUE' },
 { contract: 'Employment Contracts', obligation: 'Non-Disclosure Agreement', owner: 'HR', dueDate: '2026-07-15', status: 'MET' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-indigo-500/30 text-emerald-600"><BookOpen className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Contract Obligations</h2>
 <p className="text-slate-400 text-xs mt-0.5">Obligation Tracking • SLA Monitoring • Compliance</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Obligations</span>
 <span className="text-xl font-bold text-white font-mono">{obligations.length}</span>
 <span className="text-[10px] text-slate-500 block">Tracked Items</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Fulfilled</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{obligations.filter(o => o.status === 'MET').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">On Track</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Upcoming</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{obligations.filter(o => o.status === 'UPCOMING').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Due Soon</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Overdue</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{obligations.filter(o => o.status === 'OVERDUE').length}</span>
 <span className="text-[10px] text-rose-500/80 block">Action Required</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="relative max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search obligations..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Contract</th>
 <th className="p-3">Obligation</th>
 <th className="p-3">Owner</th>
 <th className="p-3">Due Date</th>
 <th className="p-3">Status</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {obligations.map((o, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white">{o.contract}</td>
 <td className="p-3 text-slate-300">{o.obligation}</td>
 <td className="p-3 text-slate-400">{o.owner}</td>
 <td className="p-3 font-mono text-slate-400">{o.dueDate}</td>
 <td className="p-3">
 <span className={`flex items-center space-x-1 text-[10px] font-bold ${o.status === 'MET' ? 'text-emerald-600' : o.status === 'UPCOMING' ? 'text-emerald-600' : 'text-rose-400'}`}>
 {o.status === 'MET' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
 <span>{o.status}</span>
 </span>
 </td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors">Update</button>
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
