import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, GitCompare, Loader2, ShieldCheck } from 'lucide-react';
import { documentService } from '../../api/documentService';
import type { DocumentDuplicateMatch, DocumentSummary } from '../../types/documents';

type Props = {
  document: DocumentSummary;
  onError: (message: string) => void;
};

const label = (value: string): string => value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

const formatDate = (value?: string | null): string => {
  if (!value) return 'Not supplied';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
};

function CompareView({ document, match }: { document: DocumentSummary; match: DocumentDuplicateMatch }) {
  const sourceMetadata = document.aiMetadataSuggestions ?? {};
  const sourceNumber = String(sourceMetadata.documentNumber ?? sourceMetadata.document_number ?? 'Not supplied');
  const sourceEffectiveDate = String(sourceMetadata.effectiveDate ?? sourceMetadata.effective_date ?? 'Not supplied');
  const rows = [
    ['Title', document.title, match.title],
    ['Document number', sourceNumber, match.documentNumber ?? 'Not supplied'],
    ['Document type', document.aiDetectedDocumentType ?? 'Not supplied', match.documentType ?? 'Not supplied'],
    ['Classification', document.classificationLevel, match.classificationLevel ?? 'Not supplied'],
    ['Effective date', sourceEffectiveDate, match.effectiveDate ?? 'Not supplied'],
    ['Version', document.versionNumber ?? 'Not supplied', match.versionNumber ?? 'Not supplied'],
  ];
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={`Compare ${document.title} with ${match.title}`}>
      <div className="grid grid-cols-[minmax(7rem,0.7fr)_1fr_1fr] bg-slate-50 text-[10px] font-semibold uppercase text-slate-500">
        <div className="p-2">Field</div><div className="p-2">New upload</div><div className="p-2">Existing document</div>
      </div>
      {rows.map(([name, current, existing]) => (
        <div key={String(name)} className="grid grid-cols-[minmax(7rem,0.7fr)_1fr_1fr] border-t border-slate-100 text-[11px] text-slate-700">
          <div className="p-2 font-semibold text-slate-500">{name}</div>
          <div className="p-2 break-words">{String(current)}</div>
          <div className="p-2 break-words">{String(existing)}</div>
        </div>
      ))}
      <div className="grid border-t border-slate-100 sm:grid-cols-2">
        <div className="border-b border-slate-100 p-3 sm:border-b-0 sm:border-r">
          <p className="text-[10px] font-semibold uppercase text-slate-500">New upload OCR excerpt</p>
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">
            {document.ocrExtractedText?.replace(/\s+/g, ' ').trim().slice(0, 600) || 'No OCR excerpt is available.'}
          </p>
        </div>
        <div className="p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Existing document OCR excerpt</p>
          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">
            {match.ocrExcerpt || 'No authorized OCR excerpt is available.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DocumentDuplicateDetection({ document, onError }: Props) {
  const detection = document.duplicateDetection;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  if (!detection) return null;

  const hasMatches = detection.matches.length > 0;
  const isStrong = detection.confidence === 'EXACT' || detection.confidence === 'HIGH_CONFIDENCE';
  const tone = hasMatches
    ? isStrong ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'
    : 'border-emerald-200 bg-emerald-50/60';

  const continueAsNew = async () => {
    if (!hasMatches || reviewed) return;
    setReviewing(true);
    try {
      await documentService.reviewDuplicate(document.id, 'CONTINUE_AS_NEW');
      setReviewed(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The duplicate review decision could not be recorded.');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <section className={`rounded-xl border p-4 ${tone}`} aria-labelledby="duplicate-detection-title">
      <div className="flex items-start gap-2">
        {hasMatches ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 id="duplicate-detection-title" className="text-sm font-bold text-slate-900">Duplicate Detection</h4>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{label(detection.confidence)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-700">{detection.message}</p>
          {detection.contentCheck !== 'COMPLETE' && (
            <p className="mt-1 text-[11px] font-medium text-amber-800">
              OCR could not extract enough meaningful text for content-based comparison. File-hash checking was still attempted.
            </p>
          )}
        </div>
      </div>

      {hasMatches && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ranked authorized matches</p>
          {detection.matches.map((match, index) => (
            <article key={match.documentId} className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400">#{index + 1}</span>
                    <p className="text-xs font-bold text-slate-900">{match.title}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-700">{label(match.matchType)}</span>
                  </div>
                  <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[10px] text-slate-500 sm:grid-cols-2">
                    <p><span className="font-semibold">Document No.:</span> {match.documentNumber || 'Not supplied'}</p>
                    <p><span className="font-semibold">Uploaded:</span> {formatDate(match.uploadedAt)}</p>
                    <p><span className="font-semibold">Status:</span> {match.status ? label(match.status) : 'Not supplied'}</p>
                    <p><span className="font-semibold">Location:</span> {match.documentLocation || 'Authorized repository'}</p>
                    {match.textSimilarityPercent != null && <p><span className="font-semibold">OCR similarity:</span> {match.textSimilarityPercent}%</p>}
                    {match.department && <p><span className="font-semibold">Department:</span> {match.department}</p>}
                    {match.ownerEmail && <p><span className="font-semibold">Owner:</span> {match.ownerEmail}</p>}
                  </div>
                  <ul className="mt-2 space-y-0.5 text-[10px] text-slate-600">
                    {match.reasons.map((reason) => <li key={reason}>✓ {reason}</li>)}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => void documentService.downloadDocument(match.documentId, match.fileName ?? undefined).catch((error) => onError(error instanceof Error ? error.message : 'Document could not be opened.'))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
                    <Download className="h-3 w-3" /> View Existing
                  </button>
                  <button type="button" aria-expanded={expandedId === match.documentId} onClick={() => setExpandedId(expandedId === match.documentId ? null : match.documentId)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
                    <GitCompare className="h-3 w-3" /> Compare {expandedId === match.documentId ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              {expandedId === match.documentId && <CompareView document={document} match={match} />}
            </article>
          ))}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] text-slate-500">Detection is advisory. Existing documents and this upload remain unchanged.</p>
            <button type="button" onClick={() => void continueAsNew()} disabled={reviewing || reviewed} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {reviewed ? 'Decision Recorded' : 'Continue as New Document'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
