import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Upload, Search, Sparkles, Download, CheckCircle2, X, Loader2, AlertCircle } from 'lucide-react';
import { ApiDocument, documentService } from '../../api/documentService';
import { extractErrorMessage } from '../../api/client';

export const DocumentsView: React.FC = () => {
 const [documents, setDocuments] = useState<ApiDocument[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedDoc, setSelectedDoc] = useState<ApiDocument | null>(null);

 const [searchQuery, setSearchQuery] = useState('');
 const [searchResults, setSearchResults] = useState<ApiDocument[] | null>(null);
 const [searching, setSearching] = useState(false);

 const [uploadModalOpen, setUploadModalOpen] = useState(false);
 const [newTitle, setNewTitle] = useState('');
 const [newFileName, setNewFileName] = useState('');
 const [newClassification, setNewClassification] = useState('INTERNAL');
 const [uploading, setUploading] = useState(false);
 const [uploadSuccess, setUploadSuccess] = useState(false);
 const [uploadError, setUploadError] = useState<string | null>(null);

 const loadDocuments = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const data = await documentService.getAllDocuments();
 setDocuments(data);
 } catch (err) {
 setError(extractErrorMessage(err));
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { loadDocuments(); }, [loadDocuments]);

 // Debounced semantic search via backend
 useEffect(() => {
 if (!searchQuery.trim()) { setSearchResults(null); return; }
 const timer = setTimeout(async () => {
 setSearching(true);
 try {
 const results = await documentService.searchDocuments(searchQuery);
 setSearchResults(results);
 } catch {
 setSearchResults(null);
 } finally {
 setSearching(false);
 }
 }, 400);
 return () => clearTimeout(timer);
 }, [searchQuery]);

 const displayedDocs = searchResults !== null ? searchResults : documents;

 const handleUpload = async (e: React.FormEvent) => {
 e.preventDefault();
 if (uploading) return;
 setUploading(true);
 setUploadError(null);
 try {
 const newDoc = await documentService.createDocument({
 title: newTitle,
 fileName: newFileName || `${newTitle.replace(/\s+/g, '_')}.pdf`,
 classificationLevel: newClassification,
 });
 setDocuments(prev => [newDoc, ...prev]);
 setUploadSuccess(true);
 setSelectedDoc(newDoc);
 setNewTitle(''); setNewFileName('');
 setTimeout(() => { setUploadModalOpen(false); setUploadSuccess(false); }, 1500);
 } catch (err) {
 setUploadError(extractErrorMessage(err));
 } finally {
 setUploading(false);
 }
 };

 const handleDownload = (doc: ApiDocument) => {
 const content = [
 `Title: ${doc.title}`,
 `File: ${doc.fileName}`,
 `Classification: ${doc.classificationLevel}`,
 `AI Category: ${doc.aiPredictedCategory || 'Pending'}`,
 `Status: ${doc.status}`,
 '',
 '--- AI Summary ---',
 doc.aiSummary || 'Pending AI processing',
 '',
 '--- OCR Extracted Text ---',
 doc.ocrExtractedText || 'Pending OCR extraction',
 ].join('\n');
 const blob = new Blob([content], { type: 'text/plain' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = doc.fileName || 'document.txt';
 link.click();
 URL.revokeObjectURL(url);
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <h2 className="text-2xl font-heading font-bold text-white">AI Document Management & OCR Engine</h2>
 <p className="text-slate-400 text-sm mt-1">Automatic OCR extraction with Tesseract/Tika and AI auto-categorization with Llama 3.3.</p>
 </div>
 <button onClick={() => setUploadModalOpen(true)} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-sm transition-all flex items-center space-x-2 shadow-lg shadow-emerald-600/20">
 <Upload className="w-4 h-4" />
 <span>Upload & Classify Document</span>
 </button>
 </div>

 {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2"><AlertCircle className="w-4 h-4" /><span>{error}</span><button onClick={loadDocuments} className="ml-auto underline text-xs">Retry</button></div>}

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 space-y-4">
 <div className="flex items-center space-x-2 p-3 rounded-xl bg-slate-900/60 border border-slate-200">
 {searching ? <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" /> : <Search className="w-4 h-4 text-slate-400" />}
 <input type="text" placeholder="Semantic search via OCR text, title, or AI category…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none" />
 {searchQuery && <button onClick={() => { setSearchQuery(''); setSearchResults(null); }} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
 </div>

 {loading ? (
 <div className="flex items-center justify-center space-x-2 text-slate-400 text-sm py-10"><Loader2 className="w-5 h-5 animate-spin" /><span>Loading documents…</span></div>
 ) : displayedDocs.length === 0 ? (
 <div className="text-center py-10 text-slate-500 text-sm glass-panel">{searchQuery ? 'No documents matched your search.' : 'No documents uploaded yet.'}</div>
 ) : (
 <div className="space-y-3">
 {displayedDocs.map((doc) => (
 <div key={doc.id} onClick={() => setSelectedDoc(doc)} className={`glass-card p-5 cursor-pointer transition-all ${selectedDoc?.id === doc.id ? 'border-emerald-200/50 bg-slate-900/80 shadow-lg shadow-emerald-600/10' : ''}`}>
 <div className="flex items-start justify-between">
 <div className="flex items-start space-x-3">
 <div className="p-3 rounded-xl bg-emerald-50 border border-slate-200 text-emerald-600 mt-1"><FileText className="w-5 h-5" /></div>
 <div>
 <h4 className="font-heading font-bold text-white text-base">{doc.title}</h4>
 <p className="text-xs text-slate-400 font-mono mt-0.5">{doc.fileName}</p>
 </div>
 </div>
 <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-slate-200 text-[11px] font-semibold">{doc.classificationLevel}</span>
 </div>
 <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
 <div className="flex items-center space-x-2"><Sparkles className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-600 font-medium">{doc.aiPredictedCategory || 'Classifying…'}</span></div>
 <span className="text-slate-500">Apache Tika + Llama 3.3</span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 <div className="glass-panel p-6 space-y-6">
 {selectedDoc ? (
 <>
 <div className="border-b border-slate-200 pb-4">
 <div className="flex items-center space-x-2 text-emerald-600 text-xs font-semibold mb-1"><Sparkles className="w-4 h-4" /><span>AI Insight & OCR Analysis</span></div>
 <h3 className="font-heading font-bold text-lg text-white">{selectedDoc.title}</h3>
 </div>
 {selectedDoc.aiSummary && (
 <div className="p-4 rounded-xl bg-emerald-50 border border-slate-200 space-y-2">
 <h4 className="text-xs font-semibold text-emerald-600">AI Generated Summary</h4>
 <p className="text-xs text-slate-300 leading-relaxed">{selectedDoc.aiSummary}</p>
 </div>
 )}
 {selectedDoc.ocrExtractedText && (
 <div className="space-y-2">
 <h4 className="text-xs font-semibold text-slate-300">OCR Text (Tesseract)</h4>
 <div className="p-4 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-400 border border-slate-200 max-h-48 overflow-y-auto leading-relaxed">{selectedDoc.ocrExtractedText}</div>
 </div>
 )}
 <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
 <span className="text-xs text-slate-400">Status: <strong className="text-emerald-600">{selectedDoc.status}</strong></span>
 <button onClick={() => handleDownload(selectedDoc)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700/90 flex items-center space-x-1.5">
 <Download className="w-3.5 h-3.5" />
 <span>Download File</span>
 </button>
 </div>
 </>
 ) : (
 <div className="text-center py-12 text-slate-500 text-xs">Select a document to inspect AI insights</div>
 )}
 </div>
 </div>

 {uploadModalOpen && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2"><Upload className="w-5 h-5 text-emerald-600" /><span>Upload & Classify Document</span></h3>
 <button onClick={() => { setUploadModalOpen(false); setUploadSuccess(false); setUploadError(null); }} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
 </div>
 {uploadSuccess ? (
 <div className="p-6 rounded-xl bg-emerald-50 border border-slate-200 text-center space-y-3">
 <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
 <h4 className="font-bold text-white text-lg">Document Stored & AI Processing!</h4>
 <p className="text-xs text-slate-300">OCR and Llama 3.3 classification pipeline running.</p>
 </div>
 ) : (
 <form onSubmit={handleUpload} className="space-y-4">
 {uploadError && <div className="p-3 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-xs">{uploadError}</div>}
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Document Title *</label>
 <input required type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Vendor SLA Agreement 2024" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">File Name</label>
 <input type="text" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="e.g. SLA_Vendor_2024.pdf" className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" />
 </div>
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Classification Level</label>
 <select value={newClassification} onChange={(e) => setNewClassification(e.target.value)} className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-xs text-white focus:border-purple-500 focus:outline-none">
 <option value="INTERNAL">Internal</option>
 <option value="CONFIDENTIAL">Confidential</option>
 <option value="RESTRICTED">Restricted</option>
 <option value="PUBLIC">Public</option>
 </select>
 </div>
 <div className="pt-4 flex justify-end space-x-3">
 <button type="button" onClick={() => setUploadModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400 text-xs font-semibold hover:text-white">Cancel</button>
 <button type="submit" disabled={uploading} className="px-4 py-2 rounded-xl bg-purple-500 text-white font-semibold text-xs hover:bg-purple-400 disabled:opacity-50 flex items-center space-x-2">
 {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Processing…</span></> : <><Sparkles className="w-4 h-4" /><span>Upload & Classify</span></>}
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
