import React from 'react';
import { Brain, FileText, Search } from 'lucide-react';

export const AiClassification: React.FC = () => {
 const classifications = [
 { name: 'Q3 Strategy Report.pdf', category: 'Corporate Strategy', confidence: 98, status: 'CLASSIFIED' },
 { name: 'Employee NDA Template.docx', category: 'Legal Contract', confidence: 95, status: 'CLASSIFIED' },
 { name: 'Server Architecture Diagram.vsdx', category: 'Technical Document', confidence: 91, status: 'CLASSIFIED' },
 { name: 'Vendor Invoice Aug 2026.pdf', category: 'Financial Record', confidence: 87, status: 'PENDING_REVIEW' },
 { name: 'HR Policy Update.docx', category: 'Human Resources', confidence: 93, status: 'CLASSIFIED' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><Brain className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">AI Classification</h2>
 <p className="text-slate-400 text-xs mt-0.5">Automated Document Categorization & Tagging</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Processed</span>
 <span className="text-xl font-bold text-white font-mono">{classifications.length}</span>
 <span className="text-[10px] text-slate-500 block">Classified Documents</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Auto-Classified</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{classifications.filter(c => c.status === 'CLASSIFIED').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">No Review Needed</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Pending Review</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{classifications.filter(c => c.status === 'PENDING_REVIEW').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Requires Validation</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Avg Confidence</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{Math.round(classifications.reduce((a, c) => a + c.confidence, 0) / classifications.length)}%</span>
 <span className="text-[10px] text-slate-500 block">AI Accuracy Score</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search classified documents..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <button className="px-3 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-semibold text-xs flex items-center space-x-1.5">
 <Brain className="w-4 h-4" /><span>Run Classification</span>
 </button>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Document Name</th>
 <th className="p-3">AI Category</th>
 <th className="p-3">Confidence</th>
 <th className="p-3">Status</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {classifications.map((c, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2"><FileText className="w-3.5 h-3.5 text-emerald-600" /><span>{c.name}</span></td>
 <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-500 border border-slate-200 text-[10px]">{c.category}</span></td>
 <td className="p-3">
 <div className="flex items-center space-x-2">
 <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
 <div className={`h-full rounded-full ${c.confidence >= 95 ? 'bg-emerald-600' : c.confidence >= 85 ? 'bg-emerald-600' : 'bg-amber-400'}`} style={{ width: `${c.confidence}%` }}></div>
 </div>
 <span className="font-mono text-slate-300">{c.confidence}%</span>
 </div>
 </td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${c.status === 'CLASSIFIED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-emerald-100 text-emerald-600 border border-slate-200'}`}>{c.status}</span>
 </td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors">Review</button>
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
