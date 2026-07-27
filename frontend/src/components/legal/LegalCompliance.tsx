import React from 'react';
import { ShieldCheck, Search, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';

export const LegalCompliance: React.FC = () => {
 const items = [
 { regulation: 'GDPR - Data Protection', status: 'COMPLIANT', lastAudit: '2026-06-15', risk: 'LOW', nextReview: '2026-12-15' },
 { regulation: 'SOX - Financial Reporting', status: 'COMPLIANT', lastAudit: '2026-05-20', risk: 'LOW', nextReview: '2026-11-20' },
 { regulation: 'HIPAA - Health Information', status: 'AT_RISK', lastAudit: '2026-04-10', risk: 'MEDIUM', nextReview: '2026-07-10' },
 { regulation: 'ISO 27001 - Information Security', status: 'COMPLIANT', lastAudit: '2026-06-01', risk: 'LOW', nextReview: '2026-12-01' },
 { regulation: 'Anti-Money Laundering (AML)', status: 'NON_COMPLIANT', lastAudit: '2026-03-01', risk: 'HIGH', nextReview: '2026-08-01' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><ShieldCheck className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Regulatory Compliance</h2>
 <p className="text-slate-400 text-xs mt-0.5">Enterprise Compliance Monitoring & Risk Assessment</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Regulations</span>
 <span className="text-xl font-bold text-white font-mono">{items.length}</span>
 <span className="text-[10px] text-slate-500 block">Monitored</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Compliant</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{items.filter(i => i.status === 'COMPLIANT').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Passed</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">At Risk</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{items.filter(i => i.status === 'AT_RISK').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Needs Attention</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Non-Compliant</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{items.filter(i => i.status === 'NON_COMPLIANT').length}</span>
 <span className="text-[10px] text-rose-500/80 block">Immediate Action</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="relative max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search regulations..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Regulation</th>
 <th className="p-3">Status</th>
 <th className="p-3">Risk Level</th>
 <th className="p-3">Last Audit</th>
 <th className="p-3">Next Review</th>
 </tr>
 </thead>
 <tbody >
 {items.map((item, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2"><FileText className="w-3.5 h-3.5 text-emerald-600" /><span>{item.regulation}</span></td>
 <td className="p-3">
 <span className={`flex items-center space-x-1 text-[10px] font-bold ${item.status === 'COMPLIANT' ? 'text-emerald-600' : item.status === 'AT_RISK' ? 'text-emerald-600' : 'text-rose-400'}`}>
 {item.status === 'COMPLIANT' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
 <span>{item.status}</span>
 </span>
 </td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${item.risk === 'LOW' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : item.risk === 'MEDIUM' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-rose-500/20 text-rose-400 border border-slate-200'}`}>{item.risk}</span>
 </td>
 <td className="p-3 font-mono text-slate-400">{item.lastAudit}</td>
 <td className="p-3 font-mono text-slate-400">{item.nextReview}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
};
