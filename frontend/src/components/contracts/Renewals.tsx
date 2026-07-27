import React from 'react';
import { FileCheck, Search, Clock, CheckCircle2 } from 'lucide-react';

export const Renewals: React.FC = () => {
 const renewals = [
 { contract: 'Cloud Infrastructure - Supabase', counterParty: 'Supabase Inc', endDate: '2026-12-31', value: '$120,000', autoRenew: true, status: 'ACTIVE' },
 { contract: 'Enterprise Software License', counterParty: 'Adobe Systems', endDate: '2026-09-30', value: '$85,000', autoRenew: false, status: 'EXPIRING' },
 { contract: 'Office Lease - Tower B', counterParty: 'Commercial RE Group', endDate: '2026-08-15', value: '$240,000', autoRenew: false, status: 'EXPIRING' },
 { contract: 'IT Consulting Retainer', counterParty: 'Accenture PLC', endDate: '2027-03-31', value: '$350,000', autoRenew: true, status: 'ACTIVE' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><FileCheck className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Contract Renewals</h2>
 <p className="text-slate-400 text-xs mt-0.5">Upcoming Expirations & Auto-Renewal Management</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Contracts</span>
 <span className="text-xl font-bold text-white font-mono">{renewals.length}</span>
 <span className="text-[10px] text-slate-500 block">Monitored</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Active</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{renewals.filter(r => r.status === 'ACTIVE').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Current</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Expiring Soon</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{renewals.filter(r => r.status === 'EXPIRING').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Within 90 Days</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Auto-Renewals</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{renewals.filter(r => r.autoRenew).length}</span>
 <span className="text-[10px] text-slate-500 block">No Action Needed</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="relative max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search renewals..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Contract</th>
 <th className="p-3">Counter Party</th>
 <th className="p-3">End Date</th>
 <th className="p-3">Value</th>
 <th className="p-3">Auto-Renew</th>
 <th className="p-3">Status</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {renewals.map((r, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white">{r.contract}</td>
 <td className="p-3 text-slate-400">{r.counterParty}</td>
 <td className="p-3 font-mono">{r.endDate}</td>
 <td className="p-3 font-mono text-emerald-600">{r.value}</td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.autoRenew ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-800 text-slate-400'}`}>{r.autoRenew ? 'YES' : 'NO'}</span>
 </td>
 <td className="p-3">
 <span className={`flex items-center space-x-1 text-[10px] font-bold ${r.status === 'ACTIVE' ? 'text-emerald-600' : 'text-emerald-600'}`}>
 {r.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
 <span>{r.status}</span>
 </span>
 </td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white text-[10px] font-semibold transition-all border border-slate-200">Renew</button>
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
