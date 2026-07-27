import React from 'react';
import { Calendar, Search } from 'lucide-react';

export const Hearings: React.FC = () => {
 const hearings = [
 { caseNo: 'CASE-2026-0042', title: 'Contract Dispute - ACME Corp', court: 'Regional Trial Court', date: '2026-08-15', time: '09:00 AM', status: 'SCHEDULED' },
 { caseNo: 'CASE-2026-0038', title: 'Intellectual Property - NEXUS Ltd', court: 'Supreme Court', date: '2026-08-22', time: '10:30 AM', status: 'SCHEDULED' },
 { caseNo: 'CASE-2026-0029', title: 'Employment Compliance - DOE', court: 'Labor Arbitration', date: '2026-07-30', time: '02:00 PM', status: 'CONFIRMED' },
 { caseNo: 'CASE-2026-0015', title: 'Partnership Agreement - DataSync', court: 'Arbitration Panel', date: '2026-07-10', time: '11:00 AM', status: 'COMPLETED' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><Calendar className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Hearing Schedule</h2>
 <p className="text-slate-400 text-xs mt-0.5">Court Dates, Arbitrations & Legal Proceedings Calendar</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Hearings</span>
 <span className="text-xl font-bold text-white font-mono">{hearings.length}</span>
 <span className="text-[10px] text-slate-500 block">All Proceedings</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Scheduled</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{hearings.filter(h => h.status === 'SCHEDULED').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Pending Date</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Confirmed</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{hearings.filter(h => h.status === 'CONFIRMED').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Finalized</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">This Month</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">3</span>
 <span className="text-[10px] text-slate-500 block">Upcoming</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="relative max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search hearings..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Case No.</th>
 <th className="p-3">Title</th>
 <th className="p-3">Court</th>
 <th className="p-3">Date</th>
 <th className="p-3">Time</th>
 <th className="p-3">Status</th>
 </tr>
 </thead>
 <tbody >
 {hearings.map((h, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-mono text-emerald-600 font-bold">{h.caseNo}</td>
 <td className="p-3 font-semibold text-white">{h.title}</td>
 <td className="p-3 text-slate-400">{h.court}</td>
 <td className="p-3 font-mono">{h.date}</td>
 <td className="p-3 font-mono text-slate-300">{h.time}</td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${h.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : h.status === 'SCHEDULED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-emerald-100 text-emerald-600 border border-slate-200'}`}>{h.status}</span>
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
