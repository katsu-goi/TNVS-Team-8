import React from 'react';
import { Shield, ShieldCheck, ShieldAlert, Search } from 'lucide-react';

export const SecurityClearance: React.FC = () => {
 const clearanceData = [
 { name: 'Dr. Maria Santos', dept: 'Executive Office', level: 'TOP SECRET', status: 'ACTIVE', expiry: '2027-06-15' },
 { name: 'David Chen', dept: 'Engineering & DevOps', level: 'CONFIDENTIAL', status: 'ACTIVE', expiry: '2026-11-30' },
 { name: 'Robert Vance', dept: 'Legal Counsel', level: 'TOP SECRET', status: 'ACTIVE', expiry: '2027-03-22' },
 { name: 'Lisa Kim', dept: 'HR Administration', level: 'RESTRICTED', status: 'PENDING', expiry: '-' },
 { name: 'James Okafor', dept: 'Security Operations', level: 'TOP SECRET', status: 'ACTIVE', expiry: '2028-01-10' },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><Shield className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Security Clearance</h2>
 <p className="text-slate-400 text-xs mt-0.5">Personnel Clearance Levels & Access Authorization</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Personnel</span>
 <span className="text-xl font-bold text-white font-mono">{clearanceData.length}</span>
 <span className="text-[10px] text-slate-500 block">Cleared Individuals</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Active Clearances</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{clearanceData.filter(c => c.status === 'ACTIVE').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Authorized</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Top Secret</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{clearanceData.filter(c => c.level === 'TOP SECRET').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Highest Level</span>
 </div>
 <div className="glass-panel p-4 space-y-1">
 <span className="text-[11px] font-medium text-slate-400 block">Pending Approval</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{clearanceData.filter(c => c.status === 'PENDING').length}</span>
 <span className="text-[10px] text-emerald-600/80 block">Awaiting Review</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center justify-between gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search personnel..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs">+ Grant Clearance</button>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Name</th>
 <th className="p-3">Department</th>
 <th className="p-3">Clearance Level</th>
 <th className="p-3">Status</th>
 <th className="p-3">Expiry</th>
 </tr>
 </thead>
 <tbody >
 {clearanceData.map((c, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white">{c.name}</td>
 <td className="p-3 text-slate-400">{c.dept}</td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${c.level === 'TOP SECRET' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : c.level === 'CONFIDENTIAL' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-slate-800 text-slate-300 border border-slate-200'}`}>{c.level}</span>
 </td>
 <td className="p-3">
 <span className={`flex items-center space-x-1 ${c.status === 'ACTIVE' ? 'text-emerald-600' : 'text-emerald-600'}`}>
 {c.status === 'ACTIVE' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
 <span>{c.status}</span>
 </span>
 </td>
 <td className="p-3 font-mono text-slate-400">{c.expiry}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
};
