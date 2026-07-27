import React, { useState, useEffect, useCallback } from 'react';
import { QrCode, Plus, Download, Printer, X, Loader2, AlertCircle } from 'lucide-react';
import { ApiVisitor, visitorService } from '../../api/visitorService';
import { extractErrorMessage } from '../../api/client';

export const VisitorView: React.FC = () => {
 const [visitors, setVisitors] = useState<ApiVisitor[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedVisitor, setSelectedVisitor] = useState<ApiVisitor | null>(null);

 // Register modal
 const [registerModalOpen, setRegisterModalOpen] = useState(false);
 const [name, setName] = useState('');
 const [company, setCompany] = useState('');
 const [email, setEmail] = useState('');
 const [purpose, setPurpose] = useState('');
 const [registerLoading, setRegisterLoading] = useState(false);
 const [registerError, setRegisterError] = useState<string | null>(null);

 // Row action loading states
 const [checkInLoading, setCheckInLoading] = useState<string | null>(null);
 const [checkOutLoading, setCheckOutLoading] = useState<string | null>(null);

 const loadVisitors = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const data = await visitorService.getAllVisitors();
 setVisitors(data);
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { loadVisitors(); }, [loadVisitors]);

 const handleCheckIn = async (v: ApiVisitor) => {
 if (!v.id || checkInLoading) return;
 setCheckInLoading(v.id);
 try {
 const updated = await visitorService.checkIn(v.id);
 setVisitors((prev: ApiVisitor[]) => prev.map((x: ApiVisitor) => x.id === v.id ? updated : x));
 if (selectedVisitor?.id === v.id) setSelectedVisitor(updated);
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setCheckInLoading(null);
 }
 };

 const handleCheckOut = async (v: ApiVisitor) => {
 if (!v.id || checkOutLoading) return;
 setCheckOutLoading(v.id);
 try {
 const updated = await visitorService.checkOut(v.id);
 setVisitors((prev: ApiVisitor[]) => prev.map((x: ApiVisitor) => x.id === v.id ? updated : x));
 if (selectedVisitor?.id === v.id) setSelectedVisitor(updated);
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setCheckOutLoading(null);
 }
 };

 const handleRegisterVisitor = async (e: React.FormEvent) => {
 e.preventDefault();
 if (registerLoading) return;
 setRegisterLoading(true);
 setRegisterError(null);
 try {
 const newVis = await visitorService.registerVisitor({
 fullName: name,
 company: company || undefined,
 email: email || undefined,
 purposeOfVisit: purpose,
 expectedArrival: new Date().toISOString(),
 });
 setVisitors((prev: ApiVisitor[]) => [newVis, ...prev]);
 setSelectedVisitor(newVis);
 setName(''); setCompany(''); setEmail(''); setPurpose('');
 setRegisterModalOpen(false);
 } catch (err) {
 setRegisterError(extractErrorMessage(err));
 } finally {
 setRegisterLoading(false);
 }
 };

 const downloadBadge = () => {
 if (!selectedVisitor) return;
 const content = `SECURITY PASS - PHOTONIC OMEGA\nVisitor: ${selectedVisitor.fullName}\nCompany: ${selectedVisitor.company}\nQR Token: ${selectedVisitor.qrCodeToken}\nStatus: ${selectedVisitor.status}\nIssued: ${new Date().toISOString()}`;
 const blob = new Blob([content], { type: 'text/plain' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = `Security_Pass_${selectedVisitor.fullName?.replace(/\s+/g, '_')}.txt`;
 link.click();
 URL.revokeObjectURL(url);
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <h2 className="text-2xl font-heading font-bold text-white">Visitor Management & Security Passes</h2>
 <p className="text-slate-400 text-sm mt-1">Pre-register visitors, issue encrypted QR passes, and track check-ins in real-time.</p>
 </div>
 <button onClick={() => setRegisterModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-sm transition-all flex items-center space-x-2 shadow-lg shadow-emerald-600/20">
 <Plus className="w-4 h-4" />
 <span>Register New Visitor</span>
 </button>
 </div>

 {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2"><AlertCircle className="w-4 h-4" /><span>{error}</span><button onClick={loadVisitors} className="ml-auto underline text-xs">Retry</button></div>}

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 glass-panel p-6">
 <h3 className="font-heading font-semibold text-lg text-white mb-4">Visitors Log</h3>
 {loading ? (
 <div className="flex items-center space-x-2 text-slate-400 text-sm py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /><span>Loading visitors…</span></div>
 ) : visitors.length === 0 ? (
 <div className="text-center py-10 text-slate-500 text-sm">No visitors registered yet. Register the first one above.</div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-200">
 <tr>
 <th className="p-3">Visitor</th>
 <th className="p-3">Purpose</th>
 <th className="p-3">Status</th>
 <th className="p-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody >
 {visitors.map((v: ApiVisitor) => (
 <tr key={v.id} className="hover:bg-slate-900/40 transition-colors">
 <td className="p-3">
 <div className="font-semibold text-white">{v.fullName}</div>
 <div className="text-[11px] text-emerald-600">{v.company}</div>
 </td>
 <td className="p-3 text-slate-300">{v.purposeOfVisit}</td>
 <td className="p-3">
 {v.status === 'CHECKED_IN' && <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-slate-200 font-medium">Checked In</span>}
 {v.status === 'REGISTERED' && <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-slate-200 font-medium">Pre-registered</span>}
 {v.status === 'CHECKED_OUT' && <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-medium">Checked Out</span>}
 </td>
 <td className="p-3 text-right space-x-2">
 <button onClick={() => setSelectedVisitor(v)} className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">Pass QR</button>
 {v.status === 'REGISTERED' && (
 <button disabled={checkInLoading === v.id} onClick={() => handleCheckIn(v)} className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-600 border border-slate-200 hover:bg-emerald-600 hover:text-white font-semibold disabled:opacity-50 flex-inline items-center">
 {checkInLoading === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Check In'}
 </button>
 )}
 {v.status === 'CHECKED_IN' && (
 <button disabled={checkOutLoading === v.id} onClick={() => handleCheckOut(v)} className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 border border-slate-200 hover:bg-red-500 hover:text-white font-semibold disabled:opacity-50">
 {checkOutLoading === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Check Out'}
 </button>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>

 <div className="glass-panel p-6 flex flex-col items-center text-center">
 {selectedVisitor ? (
 <div className="space-y-4 w-full flex flex-col justify-between h-full">
 <div className="space-y-2">
 <div className="p-3 rounded-full bg-emerald-50 border border-slate-200 w-fit mx-auto"><QrCode className="w-8 h-8 text-emerald-600" /></div>
 <h4 className="font-heading font-bold text-white text-lg">{selectedVisitor.fullName}</h4>
 <p className="text-xs text-slate-400">{selectedVisitor.company}</p>
 </div>
 <div className="p-5 rounded-2xl bg-white text-white shadow-2xl w-44 h-44 mx-auto flex items-center justify-center font-mono font-bold text-center border-4 border-emerald-200 text-xs break-all">
 {selectedVisitor.qrCodeToken || 'QR TOKEN'}
 </div>
 <div className="space-y-3">
 <div className="p-3 rounded-xl bg-slate-900 border border-slate-200 text-[11px] text-slate-300">
 QR token issued by Spring Security filter chain. Status: <strong className="text-emerald-600">{selectedVisitor.status}</strong>
 </div>
 <div className="flex items-center justify-center space-x-2">
 <button onClick={downloadBadge} className="px-3.5 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-600 text-emerald-600 hover:text-white font-semibold text-xs border border-slate-200 transition-all flex items-center space-x-1.5">
 <Download className="w-3.5 h-3.5" />
 <span>Download Pass</span>
 </button>
 <button onClick={() => window.print()} className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-200 flex items-center space-x-1.5">
 <Printer className="w-3.5 h-3.5" />
 <span>Print Badge</span>
 </button>
 </div>
 </div>
 </div>
 ) : (
 <div className="space-y-3 py-12 text-slate-500 my-auto">
 <QrCode className="w-12 h-12 mx-auto text-slate-600" />
 <p className="text-xs">Click"Pass QR" on any visitor to view their security pass.</p>
 </div>
 )}
 </div>
 </div>

 {registerModalOpen && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-lg text-white">Pre-Register New Visitor</h3>
 <button onClick={() => setRegisterModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
 </div>
 {registerError && <div className="p-3 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-xs">{registerError}</div>}
 <form onSubmit={handleRegisterVisitor} className="space-y-4">
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name *</label>
 <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Maria Santos" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Company / Organization</label>
 <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Apex Security Solutions" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Email Address</label>
 <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. m.santos@apex.com" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Purpose of Visit *</label>
 <input required type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Technical System Audit" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="pt-4 flex justify-end space-x-3">
 <button type="button" onClick={() => setRegisterModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400 text-xs font-semibold hover:text-white">Cancel</button>
 <button type="submit" disabled={registerLoading} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90 disabled:opacity-50 flex items-center space-x-2">
 {registerLoading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Registering…</span></> : <span>Generate Pass & Register</span>}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 );
};
