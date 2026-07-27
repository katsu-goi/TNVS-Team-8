import React from 'react';
import { Eye, FileText, Search, Download } from 'lucide-react';

export const Evidence: React.FC = () => {
 const items = [
 { name: 'Contract_Signed_ACME.pdf', caseNo: 'CASE-2026-0042', type: 'Document', status: 'VERIFIED', uploaded: '2026-07-01' },
 { name: 'Email_Thread_Dec2025.eml', caseNo: 'CASE-2026-0042', type: 'Electronic', status: 'VERIFIED', uploaded: '2026-07-02' },
 { name: 'CCTV_Footage_12-15.mp4', caseNo: 'CASE-2026-0038', type: 'Video', status: 'PENDING_REVIEW', uploaded: '2026-07-05' },
 { name: 'Financial_Statement_Q3.xlsx', caseNo: 'CASE-2026-0029', type: 'Financial', status: 'VERIFIED', uploaded: '2026-06-28' },
 { name: 'Witness_Statement_Smith.docx', caseNo: 'CASE-2026-0038', type: 'Testimony', status: 'PENDING_REVIEW', uploaded: '2026-07-08' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-indigo-500/30 text-emerald-600"><Eye className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Evidence Management</h2>
 <p className="text-slate-400 text-xs mt-0.5">Case Evidence Repository • Chain of Custody Tracking</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Evidence</span>
 <span className="text-xl font-bold text-white font-mono">{items.length}</span>
 <span className="text-[10px] text-slate-500 block">Items Filed</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Verified</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{items.filter(i => i.status === 'VERIFIED').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Chain of Custody Intact</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Pending Review</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{items.filter(i => i.status === 'PENDING_REVIEW').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Needs Validation</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Open Cases</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">3</span>
 <span className="text-[10px] text-slate-500 block">With Evidence</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search evidence..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs flex items-center space-x-1.5">
 <Download className="w-4 h-4" /><span>Export Evidence Log</span>
 </button>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Evidence Item</th>
 <th className="p-3">Case No.</th>
 <th className="p-3">Type</th>
 <th className="p-3">Uploaded</th>
 <th className="p-3">Status</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {items.map((item, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2"><FileText className="w-3.5 h-3.5 text-emerald-600" /><span>{item.name}</span></td>
 <td className="p-3 font-mono text-emerald-600">{item.caseNo}</td>
 <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">{item.type}</span></td>
 <td className="p-3 font-mono text-slate-400">{item.uploaded}</td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${item.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-emerald-100 text-emerald-600 border border-slate-200'}`}>{item.status}</span>
 </td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors">View</button>
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
