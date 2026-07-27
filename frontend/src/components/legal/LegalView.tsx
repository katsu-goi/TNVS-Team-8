import React, { useState, useEffect, useCallback } from 'react';
import { Plus, AlertCircle, Gavel, User, X, CheckCircle2, Calendar, FileText, Loader2 } from 'lucide-react';
import { ApiLegalCase, legalService } from '../../api/legalService';
import { extractErrorMessage } from '../../api/client';

export const LegalView: React.FC = () => {
 const [cases, setCases] = useState<ApiLegalCase[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedCase, setSelectedCase] = useState<ApiLegalCase | null>(null);

 const [fileModalOpen, setFileModalOpen] = useState(false);
 const [detailsModalOpen, setDetailsModalOpen] = useState(false);

 const [newTitle, setNewTitle] = useState('');
 const [newCourt, setNewCourt] = useState('');
 const [newPriority, setNewPriority] = useState('HIGH');
 const [fileLoading, setFileLoading] = useState(false);
 const [fileSuccess, setFileSuccess] = useState(false);
 const [fileError, setFileError] = useState<string | null>(null);

 const loadCases = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const data = await legalService.getAllCases();
 setCases(data);
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { loadCases(); }, [loadCases]);

 const handleFileCase = async (e: React.FormEvent) => {
 e.preventDefault();
 if (fileLoading) return;
 setFileLoading(true);
 setFileError(null);
 try {
 const newCase = await legalService.createCase({
 title: newTitle,
 courtName: newCourt || undefined,
 priority: newPriority,
 });
 setCases(prev => [newCase, ...prev]);
 setFileSuccess(true);
 setNewTitle(''); setNewCourt('');
 setTimeout(() => { setFileModalOpen(false); setFileSuccess(false); }, 1500);
 } catch (err) {
 setFileError(extractErrorMessage(err));
 } finally {
 setFileLoading(false);
 }
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <h2 className="text-2xl font-heading font-bold text-white">Legal Cases & Dispute Management</h2>
 <p className="text-slate-400 text-sm mt-1">Track pending court hearings, lawyer assignments, and evidence documentation.</p>
 </div>
 <button onClick={() => setFileModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-sm transition-all flex items-center space-x-2 shadow-lg shadow-emerald-600/20">
 <Plus className="w-4 h-4" />
 <span>File New Legal Case</span>
 </button>
 </div>

 {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2"><AlertCircle className="w-4 h-4" /><span>{error}</span><button onClick={loadCases} className="ml-auto underline text-xs">Retry</button></div>}

 {loading ? (
 <div className="flex items-center justify-center space-x-2 text-slate-400 text-sm py-12"><Loader2 className="w-5 h-5 animate-spin" /><span>Loading cases…</span></div>
 ) : cases.length === 0 ? (
 <div className="text-center py-12 text-slate-500 text-sm glass-panel">No legal cases filed yet.</div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 {cases.map((c) => (
 <div key={c.id} className="glass-card p-6 flex flex-col justify-between space-y-6">
 <div>
 <div className="flex items-center justify-between">
 <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">{c.caseNumber || 'CASE-AUTO'}</span>
 {c.priority === 'CRITICAL' && <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-slate-200 text-[11px] font-semibold flex items-center space-x-1"><AlertCircle className="w-3 h-3" /><span>Critical</span></span>}
 {c.priority === 'HIGH' && <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-slate-200 text-[11px] font-semibold">High Priority</span>}
 {(!c.priority || c.priority === 'LOW') && <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-[11px]">Normal</span>}
 </div>
 <h3 className="font-heading font-bold text-white text-lg mt-3">{c.title}</h3>
 <div className="mt-4 space-y-2 text-xs text-slate-400">
 {c.courtName && <div className="flex items-center space-x-2"><Gavel className="w-4 h-4 text-emerald-600" /><span>{c.courtName}</span></div>}
 {c.leadCounselor && <div className="flex items-center space-x-2"><User className="w-4 h-4 text-emerald-600" /><span>Lead: {c.leadCounselor}</span></div>}
 </div>
 </div>
 <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
 <span className="text-xs text-slate-300 font-medium">Status: <strong className="text-emerald-600">{c.status || 'OPEN'}</strong></span>
 <button onClick={() => { setSelectedCase(c); setDetailsModalOpen(true); }} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors">
 View Hearings & Evidence
 </button>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* File New Case Modal */}
 {fileModalOpen && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2"><Gavel className="w-5 h-5 text-emerald-600" /><span>File New Legal Case</span></h3>
 <button onClick={() => { setFileModalOpen(false); setFileSuccess(false); setFileError(null); }} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
 </div>
 {fileSuccess ? (
 <div className="p-6 rounded-xl bg-emerald-50 border border-slate-200 text-center space-y-3">
 <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
 <h4 className="font-bold text-white text-lg">Case Filed!</h4>
 <p className="text-xs text-slate-300">Case number auto-generated and saved to PostgreSQL.</p>
 </div>
 ) : (
 <form onSubmit={handleFileCase} className="space-y-4">
 {fileError && <div className="p-3 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-xs">{fileError}</div>}
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Case Title *</label>
 <input required type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Metro Properties Lease Dispute" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Court / Tribunal</label>
 <input type="text" value={newCourt} onChange={(e) => setNewCourt(e.target.value)} placeholder="e.g. Makati RTC Branch 42" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Priority Level</label>
 <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none">
 <option value="LOW">Low Priority</option>
 <option value="HIGH">High Priority</option>
 <option value="CRITICAL">Critical</option>
 </select>
 </div>
 <div className="pt-4 flex justify-end space-x-3">
 <button type="button" onClick={() => setFileModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400 text-xs font-semibold hover:text-white">Cancel</button>
 <button type="submit" disabled={fileLoading} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90 disabled:opacity-50 flex items-center space-x-2">
 {fileLoading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Filing…</span></> : <span>File Case</span>}
 </button>
 </div>
 </form>
 )}
 </div>
 </div>
 )}

 {/* Case Details Modal */}
 {detailsModalOpen && selectedCase && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-lg p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-lg text-white">{selectedCase.title}</h3>
 <button onClick={() => setDetailsModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
 </div>
 <div className="p-4 rounded-xl bg-white border border-slate-200 rounded-card space-y-3 text-xs">
 {[
 ['Case Number', selectedCase.caseNumber || 'Auto-generated'],
 ['Court', selectedCase.courtName || '—'],
 ['Lead Counselor', selectedCase.leadCounselor || '—'],
 ['Status', selectedCase.status || 'OPEN'],
 ['Filed Date', selectedCase.filedDate || '—'],
 ['Next Hearing', selectedCase.nextHearingDate || 'To be scheduled'],
 ].map(([label, val]) => (
 <div key={label} className="flex justify-between">
 <span className="text-slate-400">{label}</span>
 <span className="text-white font-medium">{val}</span>
 </div>
 ))}
 </div>
 <div>
 <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center space-x-1.5"><Calendar className="w-3.5 h-3.5 text-emerald-600" /><span>Evidence Attachments</span></h4>
 <div className="space-y-2 text-xs">
 <div className="p-3 rounded-xl bg-slate-950 border border-slate-200 flex items-center justify-between"><div className="flex items-center space-x-2"><FileText className="w-4 h-4 text-emerald-600" /><span className="text-white">Case_Filing_Document.pdf</span></div><span className="text-slate-500">Stored in DB</span></div>
 </div>
 </div>
 <div className="pt-4 border-t border-slate-200 flex justify-end">
 <button onClick={() => setDetailsModalOpen(false)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90">Close</button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
};
