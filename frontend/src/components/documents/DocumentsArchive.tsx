import React from 'react';
import { Archive, Search, Download } from 'lucide-react';

export const DocumentsArchive: React.FC = () => {
 const archived = [
 { name: 'Q2_Financial_Report_2024.pdf', category: 'Financial', archivedDate: '2025-01-15', retention: '7 Years', size: '2.4 MB' },
 { name: 'Employee_HandBook_v2.pdf', category: 'HR', archivedDate: '2024-11-30', retention: 'Permanent', size: '5.1 MB' },
 { name: 'Server_Inventory_2024.xlsx', category: 'Technical', archivedDate: '2025-03-10', retention: '3 Years', size: '1.8 MB' },
 { name: 'Audit_Report_FY2024.pdf', category: 'Compliance', archivedDate: '2024-12-01', retention: '10 Years', size: '8.3 MB' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-slate-500/10 text-slate-300"><Archive className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Document Archive</h2>
 <p className="text-slate-400 text-xs mt-0.5">Long-Term Record Retention & Storage Management</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Archived Records</span>
 <span className="text-xl font-bold text-white font-mono">{archived.length}</span>
 <span className="text-[10px] text-slate-500 block">Total Items</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Size</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">17.6 MB</span>
 <span className="text-[10px] text-slate-500 block">Storage Used</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Permanent Records</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{archived.filter(a => a.retention === 'Permanent').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Never Expires</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Expiring This Year</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">1</span>
 <span className="text-[10px] text-emerald-600/80 block">Retention Period End</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search archived documents..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs flex items-center space-x-1.5">
 <Download className="w-4 h-4" /><span>Export Archive Index</span>
 </button>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Document Name</th>
 <th className="p-3">Category</th>
 <th className="p-3">Archived Date</th>
 <th className="p-3">Retention</th>
 <th className="p-3">Size</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {archived.map((a, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2"><Archive className="w-3.5 h-3.5 text-slate-400" /><span>{a.name}</span></td>
 <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">{a.category}</span></td>
 <td className="p-3 font-mono text-slate-400">{a.archivedDate}</td>
 <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-mono ${a.retention === 'Permanent' ? 'bg-emerald-50 text-emerald-600 border border-slate-200' : 'bg-slate-800 text-slate-300'}`}>{a.retention}</span></td>
 <td className="p-3 font-mono text-slate-400">{a.size}</td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors">Restore</button>
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
