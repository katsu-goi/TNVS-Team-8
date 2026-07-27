import React from 'react';
import { KeyRound, Search, Shield, ShieldAlert, Users } from 'lucide-react';

export const RbacPage: React.FC = () => {
 const roles: { role: string; users: number; permissions: number; level: string; color: string }[] = [];

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-3 border-b border-slate-200 pb-5">
 <div className="p-2.5 rounded-2xl bg-emerald-50 border border-slate-200 text-emerald-600"><KeyRound className="w-6 h-6" /></div>
 <div>
 <h2 className="text-2xl font-heading font-bold text-white tracking-tight">Role-Based Access Control</h2>
 <p className="text-slate-400 text-xs mt-0.5">Permission Management • Role Assignment • Security Policies</p>
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Roles</span>
 <span className="text-xl font-bold text-white font-mono">{roles.length}</span>
 <span className="text-[10px] text-slate-500 block">Defined</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Users</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{roles.reduce((a, r) => a + r.users, 0)}</span>
 <span className="text-[10px] text-emerald-600/80 block">With Permissions</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Total Permissions</span>
 <span className="text-xl font-bold text-emerald-600 font-mono">{roles.reduce((a, r) => a + r.permissions, 0)}</span>
 <span className="text-[10px] text-slate-500 block">Across All Roles</span>
 </div>
 <div className="glass-panel p-4 space-y-1 border-slate-200">
 <span className="text-[11px] font-medium text-slate-400 block">Critical Roles</span>
 <span className="text-xl font-bold text-rose-400 font-mono">{roles.filter(r => r.level === 'CRITICAL').length}</span>
 <span className="text-[10px] text-rose-500/80 block">Highest Privilege</span>
 </div>
 </div>

 <div className="glass-panel p-6 space-y-4">
 <div className="flex items-center justify-between gap-4">
 <div className="relative flex-1 max-w-md">
 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
 <input type="text" placeholder="Search roles..." className="w-full bg-white border border-slate-200 rounded-card pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs">+ Add Role</button>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-950/60 uppercase text-[10px] tracking-wider">
 <th className="p-3">Role</th>
 <th className="p-3">Users</th>
 <th className="p-3">Permissions</th>
 <th className="p-3">Access Level</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {roles.map((r, i) => (
 <tr key={i} className="hover:bg-slate-900/60 transition-colors text-slate-200">
 <td className="p-3 font-semibold text-white flex items-center space-x-2">
 {r.level === 'CRITICAL' ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> : <Shield className="w-3.5 h-3.5 text-emerald-600" />}
 <span>{r.role}</span>
 </td>
 <td className="p-3"><span className="flex items-center space-x-1"><Users className="w-3 h-3 text-slate-400" /><span>{r.users}</span></span></td>
 <td className="p-3 font-mono text-slate-300">{r.permissions}</td>
 <td className="p-3">
 <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${r.level === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-slate-200' : r.level === 'ELEVATED' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : r.level === 'STANDARD' ? 'bg-emerald-100 text-emerald-600 border border-slate-200' : 'bg-slate-800 text-slate-300 border border-slate-200'}`}>{r.level}</span>
 </td>
 <td className="p-3 text-right">
 <button className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors">Manage</button>
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
