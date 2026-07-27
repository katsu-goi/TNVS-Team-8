import React from 'react';
import { ScanLine, FileText, Search, Clock, CheckCircle2 } from 'lucide-react';

export const OcrProcessing: React.FC = () => {
 const items = [
 { name: 'Contract_ACME_Corp.pdf', pages: 12, progress: 100, status: 'COMPLETED', textExtracted: '12,847 chars' },
 { name: 'NDA_Template_v3.png', pages: 2, progress: 100, status: 'COMPLETED', textExtracted: '3,421 chars' },
 { name: 'Handwritten_Notes.jpg', pages: 1, progress: 65, status: 'PROCESSING', textExtracted: '892 chars' },
 { name: 'Annual_Report_2025.pdf', pages: 48, progress: 0, status: 'QUEUED', textExtracted: '-' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200/30 text-emerald-600"><ScanLine className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">OCR Processing</h2>
 <p className="text-slate-400 text-xs mt-0.5">Optical Character Recognition & Text Extraction Pipeline</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Documents</span>
 <span className="text-xl font-bold text-white font-mono">{items.length}</span>
 <span className="text-[10px] text-slate-500 block">In Pipeline</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Completed</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{items.filter(i => i.status === 'COMPLETED').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Text Extracted</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Processing</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{items.filter(i => i.status === 'PROCESSING').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">In Progress</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Queued</span>
 <span className="text-xl font-bold text-slate-300 font-mono">{items.filter(i => i.status === 'QUEUED').length}</span>
 <span className="text-[10px] text-slate-500 block">Awaiting</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search OCR documents..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Document</th>
 <th className="p-3">Pages</th>
 <th className="p-3">Progress</th>
 <th className="p-3">Text Extracted</th>
 <th className="p-3">Status</th>
 </tr>
 </thead>
 <tbody >
 {items.map((item, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2"><FileText className="w-3.5 h-3.5 text-emerald-600" /><span>{item.name}</span></td>
 <td className="p-3 text-slate-400">{item.pages}</td>
 <td className="p-3">
 <div className="flex items-center space-x-2">
 <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
 <div className={`h-full rounded-full ${item.progress === 100 ? 'bg-emerald-600' : 'bg-emerald-600'}`} style={{ width: `${item.progress}%` }}></div>
 </div>
 <span className="font-mono text-slate-300">{item.progress}%</span>
 </div>
 </td>
 <td className="p-3 font-mono text-slate-400">{item.textExtracted}</td>
 <td className="p-3">
 <span className={`flex items-center space-x-1 text-[10px] font-bold ${item.status === 'COMPLETED' ? 'text-emerald-600' : item.status === 'PROCESSING' ? 'text-emerald-600' : 'text-slate-400'}`}>
 {item.status === 'COMPLETED' ? <CheckCircle2 className="w-3 h-3" /> : item.status === 'PROCESSING' ? <Clock className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
 <span>{item.status}</span>
 </span>
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
