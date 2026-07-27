import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Sparkles, Search, X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { ApiContract, contractService } from '../../api/contractService';
import { extractErrorMessage } from '../../api/client';

export const ContractsView: React.FC = () => {
 const [contracts, setContracts] = useState<ApiContract[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedContract, setSelectedContract] = useState<ApiContract | null>(null);

 const [searchQuery, setSearchQuery] = useState('');
 const [riskFilter, setRiskFilter] = useState('ALL');

 const [uploadModalOpen, setUploadModalOpen] = useState(false);
 const [newTitle, setNewTitle] = useState('');
 const [newNumber, setNewNumber] = useState('');
 const [newCounterParty, setNewCounterParty] = useState('');
 const [newValue, setNewValue] = useState(0);
 const [newType, setNewType] = useState('SERVICE');
 const [uploading, setUploading] = useState(false);
 const [uploadSuccess, setUploadSuccess] = useState(false);
 const [uploadError, setUploadError] = useState<string | null>(null);

 // On-demand AI analysis
 const [analyzing, setAnalyzing] = useState(false);

 const loadContracts = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const data = await contractService.getAllContracts();
 setContracts(data);
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { loadContracts(); }, [loadContracts]);

 const filteredContracts = contracts.filter(c => {
 const matchSearch = !searchQuery || c.title?.toLowerCase().includes(searchQuery.toLowerCase()) || c.counterParty?.toLowerCase().includes(searchQuery.toLowerCase()) || c.contractNumber?.toLowerCase().includes(searchQuery.toLowerCase());
 const matchRisk = riskFilter === 'ALL' || c.aiAssessedRiskLevel === riskFilter;
 return matchSearch && matchRisk;
 });

 const handleUpload = async (e: React.FormEvent) => {
 e.preventDefault();
 if (uploading) return;
 setUploading(true);
 setUploadError(null);
 try {
 const newContract = await contractService.createContract({
 title: newTitle,
 contractNumber: newNumber || undefined,
 counterParty: newCounterParty || undefined,
 contractValue: newValue,
 type: newType,
 });
 setContracts(prev => [newContract, ...prev]);
 setSelectedContract(newContract);
 setUploadSuccess(true);
 setNewTitle(''); setNewNumber(''); setNewCounterParty(''); setNewValue(0);
 setTimeout(() => { setUploadModalOpen(false); setUploadSuccess(false); }, 1500);
 } catch (err) {
 setUploadError(extractErrorMessage(err));
 } finally {
 setUploading(false);
 }
 };

 const handleAnalyze = async () => {
 if (!selectedContract?.id || analyzing) return;
 setAnalyzing(true);
 try {
 const analysis = await contractService.analyzeContract(selectedContract.id);
 setSelectedContract(prev => prev ? { ...prev, aiAssessedRiskLevel: analysis.overallRisk, aiRiskSummary: analysis.summary } : prev);
 setContracts(prev => prev.map(c => c.id === selectedContract.id ? { ...c, aiAssessedRiskLevel: analysis.overallRisk, aiRiskSummary: analysis.summary } : c));
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setAnalyzing(false);
 }
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <h2 className="text-2xl font-heading font-bold text-white">AI Contract Risk & Clause Analytics</h2>
 <p className="text-slate-400 text-sm mt-1">Automated contract clause extraction, risk assessment, and expiration monitoring.</p>
 </div>
 <button onClick={() => setUploadModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-sm transition-all flex items-center space-x-2 shadow-lg shadow-emerald-600/20">
 <Plus className="w-4 h-4" />
 <span>Upload & Analyze Contract</span>
 </button>
 </div>

 {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2"><AlertCircle className="w-4 h-4" /><span>{error}</span><button onClick={loadContracts} className="ml-auto underline text-xs">Retry</button></div>}

 <div className="flex items-center space-x-3">
 <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-200 flex-1 max-w-sm">
 <Search className="w-4 h-4 text-slate-400" />
 <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search contracts…" className="bg-transparent text-xs text-white placeholder-slate-500 w-full focus:outline-none" />
 {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
 </div>
 <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="bg-slate-900 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none cursor-pointer">
 <option value="ALL">All Risk Levels</option>
 <option value="LOW">Low Risk</option>
 <option value="MEDIUM">Medium Risk</option>
 <option value="HIGH">High Risk</option>
 </select>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 space-y-4">
 {loading ? (
 <div className="flex items-center justify-center space-x-2 text-slate-400 text-sm py-10"><Loader2 className="w-5 h-5 animate-spin" /><span>Loading contracts…</span></div>
 ) : filteredContracts.length === 0 ? (
 <div className="text-center py-10 text-slate-500 text-sm glass-panel">No contracts found.</div>
 ) : filteredContracts.map((c) => (
 <div key={c.id} onClick={() => setSelectedContract(c)} className={`glass-card p-6 cursor-pointer transition-all ${selectedContract?.id === c.id ? 'border-emerald-200/50 bg-slate-900/80 shadow-lg shadow-emerald-600/10' : ''}`}>
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center space-x-2">
 <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">{c.contractNumber}</span>
 <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-slate-200">{c.type}</span>
 </div>
 <h3 className="font-heading font-bold text-white text-lg mt-2">{c.title}</h3>
 <p className="text-xs text-slate-400 mt-1">Counterparty: <strong className="text-slate-200">{c.counterParty || '—'}</strong></p>
 </div>
 <div className="text-right">
 {c.contractValue !== undefined && <div className="text-lg font-bold text-white">₱{c.contractValue.toLocaleString()}</div>}
 {c.aiAssessedRiskLevel === 'LOW' && <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-slate-200 text-[11px] font-semibold">AI Risk: Low</span>}
 {c.aiAssessedRiskLevel === 'MEDIUM' && <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-slate-200 text-[11px] font-semibold">AI Risk: Medium</span>}
 {c.aiAssessedRiskLevel === 'HIGH' && <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-slate-200 text-[11px] font-semibold">AI Risk: High</span>}
 </div>
 </div>
 </div>
 ))}
 </div>

 <div className="glass-panel p-6 space-y-6">
 {selectedContract ? (
 <>
 <div className="border-b border-slate-200 pb-4">
 <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold mb-1"><Sparkles className="w-4 h-4" /><span>AI Clause Extraction & Risk</span></div>
 <h3 className="font-heading font-bold text-lg text-white">{selectedContract.title}</h3>
 </div>
 <div className="p-4 rounded-xl bg-white border border-slate-200 rounded-card space-y-2">
 <span className="text-xs font-semibold text-emerald-600">Risk Assessment</span>
 <p className="text-xs text-slate-300 leading-relaxed">{selectedContract.aiRiskSummary || 'Pending AI analysis. Click Re-Analyze below.'}</p>
 </div>
 <button onClick={handleAnalyze} disabled={analyzing} className="w-full px-4 py-2.5 rounded-xl bg-emerald-100 hover:bg-purple-500 text-emerald-600 hover:text-white border border-slate-200 font-semibold text-xs transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
 {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Analyzing…</span></> : <><Sparkles className="w-4 h-4" /><span>Re-Analyze with AI</span></>}
 </button>
 </>
 ) : (
 <div className="text-center py-12 text-slate-500 text-xs">Select a contract to run AI analysis</div>
 )}
 </div>
 </div>

 {uploadModalOpen && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-lg text-white">Upload & Analyze Contract</h3>
 <button onClick={() => { setUploadModalOpen(false); setUploadSuccess(false); setUploadError(null); }} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
 </div>
 {uploadSuccess ? (
 <div className="p-6 rounded-xl bg-emerald-50 border border-slate-200 text-center space-y-3">
 <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
 <h4 className="font-bold text-white text-lg">Contract Created & AI Analyzed!</h4>
 <p className="text-xs text-slate-300">Risk assessment completed by AI engine.</p>
 </div>
 ) : (
 <form onSubmit={handleUpload} className="space-y-4">
 {uploadError && <div className="p-3 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-xs">{uploadError}</div>}
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Contract Title *</label>
 <input required type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Annual IT Maintenance Contract" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Contract Number</label>
 <input type="text" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="CTR-2024-XXX" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Type</label>
 <select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-xs text-white focus:border-emerald-200 focus:outline-none">
 <option value="SERVICE">Service</option>
 <option value="VENDOR">Vendor</option>
 <option value="TECHNOLOGY">Technology</option>
 <option value="LEASE">Lease</option>
 </select>
 </div>
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Counterparty</label>
 <input type="text" value={newCounterParty} onChange={(e) => setNewCounterParty(e.target.value)} placeholder="e.g. CyberWatch Technologies Inc." className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Contract Value (₱) *</label>
 <input required type="number" min={0} value={newValue} onChange={(e) => setNewValue(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-emerald-200 focus:outline-none" />
 </div>
 <div className="pt-4 flex justify-end space-x-3">
 <button type="button" onClick={() => setUploadModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400 text-xs font-semibold hover:text-white">Cancel</button>
 <button type="submit" disabled={uploading} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90 disabled:opacity-50 flex items-center space-x-2">
 {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Analyzing…</span></> : <><Sparkles className="w-4 h-4" /><span>Upload & Analyze</span></>}
 </button>
 </div>
 </form>
 )}
 </div>
 </div>
 )}
 </div>
 );
};
