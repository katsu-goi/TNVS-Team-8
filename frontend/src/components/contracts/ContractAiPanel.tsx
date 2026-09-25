import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, RefreshCw, ShieldAlert, Upload } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../api/client';
import { documentService, validateUploadFile } from '../../api/documentService';
import { UPLOAD_ACCEPT_ATTRIBUTE } from '../../types/documents';

type ContractAiPanelProps = {
  contractId: string;
  associatedDocumentId?: string | null;
  canReview?: boolean;
  onChanged?: () => void;
};

const badge = (risk?: string) => risk === 'HIGH'
  ? 'bg-rose-100 text-rose-700'
  : risk === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';

const section = 'rounded-xl border border-slate-200 bg-white p-3 space-y-2';

function authoritativeData(analysis: any) {
  return {
    summary: analysis.summary,
    parties: analysis.parties ?? [],
    dates: analysis.dates ?? [],
    financialTerms: analysis.financialTerms ?? {},
    obligations: analysis.obligations ?? [],
    renewal: analysis.renewal ?? {},
    termination: analysis.termination ?? {},
    clauses: analysis.clauses ?? [],
    risks: analysis.risks ?? [],
    missingTerms: analysis.missingTerms ?? [],
    overallRisk: analysis.overallRisk,
    confidence: analysis.confidence,
    disclaimer: analysis.disclaimer,
  };
}

export const ContractAiPanel: React.FC<ContractAiPanelProps> = ({
  contractId, associatedDocumentId, canReview = false, onChanged,
}) => {
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/contracts/${contractId}/analysis`);
      setAnalysis(data?.data ?? null);
    } catch (error: any) {
      if (error?.response?.status !== 404) setMessage(extractErrorMessage(error));
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [contractId]);

  const editable = useMemo(() => analysis ? JSON.stringify(authoritativeData(analysis), null, 2) : '', [analysis]);

  const analyze = async () => {
    const validation = file ? validateUploadFile(file) : associatedDocumentId ? null : 'Choose a contract file first.';
    if (validation) { setMessage(validation); return; }
    setBusy(true);
    setMessage(null);
    try {
      let documentId = associatedDocumentId ?? null;
      if (file) {
        const uploaded = await documentService.uploadDocument(file, {
          title: `Contract source — ${file.name}`,
          classificationLevel: 'CONFIDENTIAL',
        });
        documentId = uploaded.id;
      }
      const { data } = await apiClient.post(`/contracts/${contractId}/analyze`, { documentId });
      setAnalysis(data?.data ?? null);
      setFile(null);
      setMessage('Real contract-content analysis completed. Human review is required.');
      onChanged?.();
    } catch (error) {
      setMessage(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const review = async (decision: 'APPROVE' | 'CORRECT' | 'REJECT') => {
    let correctedData: unknown = undefined;
    if (decision === 'CORRECT') {
      try {
        correctedData = JSON.parse(correction || editable);
      } catch {
        setMessage('Corrected analysis must be valid JSON.');
        return;
      }
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiClient.post(`/contracts/${contractId}/analysis-review`, { decision, correctedData, notes });
      setMessage(`Contract AI analysis ${decision.toLowerCase()}d.`);
      setShowCorrection(false);
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-slate-200 pt-4 space-y-3">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
          <div>
            <h4 className="text-sm font-bold text-indigo-950">Contract AI Analysis</h4>
            <p className="text-xs text-indigo-800">AI-assisted analysis — requires human review. This is not legal advice.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Upload className="h-4 w-4" />
          {file?.name ?? 'Choose TXT, DOCX, or PDF'}
          <input type="file" className="hidden" accept={UPLOAD_ACCEPT_ATTRIBUTE} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button disabled={busy} onClick={analyze} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
          {file ? 'Upload & Analyze' : 'Analyze Linked File'}
        </button>
      </div>

      {message && <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{message}</p>}
      {loading && <p className="text-xs text-slate-500">Loading Contract AI analysis…</p>}

      {analysis && (
        <div className="space-y-3 text-xs text-slate-700">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className={section}><span className="text-slate-500">Risk</span><span className={`block w-fit rounded-full px-2 py-1 font-bold ${badge(analysis.overallRisk)}`}>{analysis.overallRisk}</span></div>
            <div className={section}><span className="text-slate-500">Confidence</span><strong className="block text-slate-900">{Math.round(Number(analysis.confidence ?? 0) * 100)}%</strong></div>
            <div className={section}><span className="text-slate-500">Review</span><strong className="block text-slate-900">{analysis.reviewStatus}</strong></div>
            <div className={section}><span className="text-slate-500">Version</span><strong className="block text-slate-900">{analysis.version}</strong></div>
          </div>

          <div className={section}><h5 className="font-bold text-slate-900">Contract Summary</h5><p>{analysis.summary}</p></div>

          <div className={section}>
            <h5 className="font-bold text-slate-900">Parties</h5>
            {(analysis.parties ?? []).length ? analysis.parties.map((item: any, index: number) => <p key={index}><strong>{item.name}</strong> — {item.role}{item.signatory ? `; signatory: ${item.signatory}` : ''}</p>) : <p>NOT FOUND — requires review</p>}
          </div>

          <div className={section}>
            <h5 className="font-bold text-slate-900">Important Dates</h5>
            {(analysis.dates ?? []).map((item: any, index: number) => <p key={index}><strong>{String(item.type).replaceAll('_', ' ')}</strong>: {item.value ?? item.status}</p>)}
          </div>

          <div className={section}>
            <h5 className="font-bold text-slate-900">Financial Terms</h5>
            <p>Value: {analysis.financialTerms?.contractValue?.status === 'FOUND' ? `${analysis.financialTerms.contractValue.currency ?? ''} ${analysis.financialTerms.contractValue.amount}` : 'NOT FOUND'}</p>
            {(analysis.financialTerms?.paymentTerms ?? []).map((item: any, index: number) => <p key={index}>{item.description}</p>)}
          </div>

          <div className={section}>
            <h5 className="font-bold text-slate-900">Obligations</h5>
            {(analysis.obligations ?? []).length ? analysis.obligations.map((item: any, index: number) => <p key={index}><strong>{item.responsibleParty ?? 'Unspecified party'}:</strong> {item.description}{item.dueDate ? ` — due ${item.dueDate}` : ''}</p>) : <p>None grounded in the source.</p>}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className={section}><h5 className="font-bold text-slate-900">Renewal</h5><p>{analysis.renewal?.type ?? 'NOT FOUND'} {analysis.renewal?.noticeRequirement ?? ''}</p></div>
            <div className={section}><h5 className="font-bold text-slate-900">Termination</h5><p>{analysis.termination?.type ?? 'NOT FOUND'} {analysis.termination?.noticePeriod ?? ''}</p></div>
          </div>

          <div className={section}>
            <h5 className="font-bold text-slate-900">Clauses</h5>
            {(analysis.clauses ?? []).map((item: any, index: number) => <div key={index} className="border-l-2 border-indigo-200 pl-2"><strong>{String(item.type).replaceAll('_', ' ')}</strong> — {item.summary}<p className="italic text-slate-500">“{item.evidence}”</p></div>)}
          </div>

          <div className={section}>
            <h5 className="font-bold text-slate-900">Risks</h5>
            {(analysis.risks ?? []).length ? analysis.risks.map((item: any, index: number) => <div key={index} className="rounded-lg bg-slate-50 p-2"><strong className={badge(item.severity)}>{item.severity} — {item.riskType}</strong><p>{item.explanation}</p><p className="italic text-slate-500">“{item.evidence}”</p><p className="font-medium">Reviewer attention: {item.reviewerAttention}</p></div>) : <p>No grounded risk finding returned.</p>}
          </div>

          <div className={section}>
            <h5 className="flex items-center gap-1 font-bold text-slate-900"><AlertTriangle className="h-4 w-4 text-amber-600" /> Missing / Ambiguous Information</h5>
            {(analysis.missingTerms ?? []).length ? <ul className="list-disc pl-5">{analysis.missingTerms.map((item: string) => <li key={item}>{item.replaceAll('_', ' ')}</li>)}</ul> : <p>None reported.</p>}
          </div>

          <p className="text-[11px] text-slate-500">Provider: {analysis.providerName} · Model: {analysis.model} · SHA-256: {analysis.contentSha256}</p>

          {canReview && analysis.reviewStatus === 'PENDING' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <h5 className="font-bold text-slate-900">Authorized Review Actions</h5>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2" rows={2} placeholder="Review notes" />
              {showCorrection && <textarea value={correction || editable} onChange={(event) => setCorrection(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px]" rows={16} aria-label="Corrected structured contract analysis" />}
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => void review('APPROVE')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white"><CheckCircle2 className="h-4 w-4" />Approve Analysis</button>
                <button disabled={busy} onClick={() => showCorrection ? void review('CORRECT') : setShowCorrection(true)} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-white">{showCorrection ? 'Save Correction' : 'Correct'}</button>
                <button disabled={busy} onClick={() => void review('REJECT')} className="rounded-lg bg-rose-600 px-3 py-2 font-bold text-white">Reject</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
