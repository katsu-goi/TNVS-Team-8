import React from 'react';
import { FileSearch, Search, FileText } from 'lucide-react';

export const RiskAnalysis: React.FC = () => {
 const contracts = [
 { title: 'Cloud Infrastructure - Supabase', counterParty: 'Supabase Inc', riskLevel: 'LOW', score: 92, flags: 0 },
 { title: 'Enterprise Software License - Adobe', counterParty: 'Adobe Systems', riskLevel: 'LOW', score: 88, flags: 1 },
 { title: 'IT Consulting Services - Accenture', counterParty: 'Accenture PLC', riskLevel: 'MEDIUM', score: 72, flags: 3 },
 { title: 'Office Lease - Tower B Expansion', counterParty: 'Commercial RE Group', riskLevel: 'HIGH', score: 45, flags: 5 },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><FileSearch className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">AI Risk Analysis</h2>
 <p className="text-slate-400 text-xs mt-0.5">Automated Contract Risk Scoring & Flag Detection</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Analyzed Contracts</span>
 <span className="text-xl font-bold text-white font-mono">{contracts.length}</span>
 <span className="text-[10px] text-slate-500 block">AI Processed</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Low Risk</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{contracts.filter(c => c.riskLevel === 'LOW').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Safe to Execute</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Medium Risk</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{contracts.filter(c => c.riskLevel === 'MEDIUM').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Review Recommended</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">High Risk</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{contracts.filter(c => c.riskLevel === 'HIGH').length}</span>
 <span className="text-[10px] text-rose-500/80 block">Legal Review Required</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="relative max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search contracts..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Contract</th>
 <th className="p-3">Counter Party</th>
 <th className="p-3">Risk Score</th>
 <th className="p-3">Risk Level</th>
 <th className="p-3 text-center">Flags</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {contracts.map((c, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2"><FileText className="w-3.5 h-3.5 text-emerald-600" /><span>{c.title}</span></td>
 <td className="p-3 text-slate-400">{c.counterParty}</td>
 <td className="p-3">
 <div className="flex items-center space-x-2">
 <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
 <div className={`h-full rounded-full ${c.score >= 80 ? 'bg-emerald-600' : c.score >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${c.score}%` }}></div>
 </div>
 <span className="font-mono text-slate-300">{c.score}/100</span>
 </div>
 </td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${c.riskLevel === 'LOW' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : c.riskLevel === 'MEDIUM' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-rose-500/20 text-rose-400 border border-slate-200'}`}>{c.riskLevel}</span>
 </td>
 <td className="p-3 text-center">
 <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${c.flags > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-100 text-emerald-600'}`}>{c.flags}</span>
 </td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white text-[10px] font-semibold transition-all border border-slate-200">Deep Scan</button>
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
