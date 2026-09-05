import React, { useRef, useState } from 'react';
import {
  Upload, Download, Sparkles, FileText, AlertCircle, CheckCircle2, X,
} from 'lucide-react';
import { documentService, validateUploadFile } from '../../api/documentService';
import { extractErrorMessage } from '../../api/client';
import type { ClassificationLevel, DocumentSummary } from '../../types/documents';
import { UPLOAD_ACCEPT_ATTRIBUTE, ALLOWED_UPLOAD_EXTENSIONS } from '../../types/documents';

const CLASSIFICATIONS: ClassificationLevel[] = [
  'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED',
];

const inputCls =
  'mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const labelCls = 'text-[11px] font-semibold text-slate-500 uppercase';

const formatBytes = (bytes?: number | null): string => {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const confidenceTone = (score?: number | null): string => {
  const value = Number(score ?? 0);
  if (value >= 0.8) return 'bg-emerald-500';
  if (value >= 0.6) return 'bg-amber-500';
  return 'bg-slate-400';
};

interface DocumentUploadPanelProps {
  /** Called after a successful upload, e.g. to refresh a list. */
  onUploaded?: (document: DocumentSummary) => void;
  title?: string;
  subtitle?: string;
  documentCategoryOptions?: string[];
  documentCategory?: string;
  onDocumentCategoryChange?: (category: string) => void;
}

/**
 * Real file upload against POST /v1/documents/upload, with the AI pipeline
 * result (extracted content, predicted category, confidence, summary, auto-tags) rendered
 * inline as soon as the response comes back.
 *
 * Purely additive: drop it into a page, it owns all of its own state.
 */
export const DocumentUploadPanel: React.FC<DocumentUploadPanelProps> = ({
  onUploaded,
  title = 'Upload a Document',
  subtitle = 'PDF embedded text, DOCX content, or UTF-8 text is extracted and classified from the document contents before human review.',
  documentCategoryOptions,
  documentCategory = '',
  onDocumentCategoryChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [classification, setClassification] = useState<ClassificationLevel>('INTERNAL');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentSummary | null>(null);

  const reset = () => {
    setFile(null);
    setDocTitle('');
    setProgress(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setError(selected ? validateUploadFile(selected) : null);
    setFile(selected);
    setResult(null);
  };

  const submit = async () => {
    const validationError = validateUploadFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const uploaded = await documentService.uploadDocument(
        file as File,
        { title: docTitle.trim() || undefined, classificationLevel: classification },
        setProgress,
      );
      setResult(uploaded);
      reset();
      onUploaded?.(uploaded);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const download = async () => {
    if (!result) return;
    try {
      await documentService.downloadDocument(result.id, result.fileName);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="card-stat p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600" />
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-[10px] font-mono text-slate-400 shrink-0">
          max 20MB
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <label className={labelCls}>File</label>
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            onChange={onFileChange}
            disabled={uploading}
            className="mt-1 w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 disabled:opacity-50"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Allowed: {ALLOWED_UPLOAD_EXTENSIONS.join(', ')}
            {file ? ` · selected: ${file.name} (${formatBytes(file.size)})` : ''}
          </p>
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>Title (optional)</label>
          <input
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            disabled={uploading}
            placeholder="Defaults to the file name"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Classification</label>
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value as ClassificationLevel)}
            disabled={uploading}
            className={inputCls}
          >
            {CLASSIFICATIONS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>

        {documentCategoryOptions?.length ? (
          <div className="md:col-span-3">
            <label className={labelCls}>Document Category</label>
            <select
              value={documentCategory}
              onChange={(e) => onDocumentCategoryChange?.(e.target.value)}
              disabled={uploading}
              className={inputCls}
            >
              {documentCategoryOptions.map((category) => (
                <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {uploading && (
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={uploading || !file}
          className="inline-flex items-center space-x-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg border bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{uploading ? `Uploading… ${progress}%` : 'Upload & Analyze'}</span>
        </button>
      </div>

      {result && (
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <p className="text-sm font-bold text-slate-900">AI Suggestion Ready for Review</p>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
              {(result.status || '').replace(/_/g, ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-900">{result.title}</span>
            <span className="font-mono text-slate-400">
              {result.fileName} · {formatBytes(result.fileSize)} · {result.classificationLevel}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className={labelCls}>Predicted Category</p>
              <p className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                {(result.aiPredictedCategory || 'UNCLASSIFIED').replace(/_/g, ' ')}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className={labelCls}>Confidence</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${confidenceTone(result.confidenceScore)}`}
                    style={{ width: `${Math.round(Number(result.confidenceScore ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-600">
                  {Math.round(Number(result.confidenceScore ?? 0) * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div>
            <p className={labelCls}>AI Summary</p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {result.aiSummary || 'No summary generated.'}
            </p>
          </div>

          <div className={`rounded-xl border px-3 py-2 text-xs ${
            result.aiReviewRequired
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <p className="font-semibold">
              {result.aiReviewRequired
                ? 'Manual verification required — confidence is below the automatic suggestion threshold.'
                : 'High-confidence suggestion — human approval is still required before classification becomes final.'}
            </p>
            <p className="mt-1 opacity-80">
              Final classification: {result.finalClassification?.replace(/_/g, ' ') || 'Not approved'}
            </p>
          </div>

          <div className="grid gap-2 text-[10px] text-slate-500 sm:grid-cols-2">
            <p><span className="font-semibold">Detected type:</span> {result.aiDetectedDocumentType || 'Not supplied'}</p>
            <p><span className="font-semibold">Extraction:</span> {(result.aiExtractionMethod || 'Unknown').replace(/_/g, ' ')}</p>
            <p><span className="font-semibold">Provider:</span> {result.aiProviderName || 'Unavailable'}</p>
            <p><span className="font-semibold">Model:</span> {result.aiModel || 'Unavailable'}</p>
          </div>

          {result.aiClassificationReason && (
            <div>
              <p className={labelCls}>Classification Reason</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{result.aiClassificationReason}</p>
            </div>
          )}

          {!!result.tags?.length && (
            <div>
              <p className={labelCls}>Auto-Tags</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {result.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={download}
              className="inline-flex items-center space-x-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download original</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentUploadPanel;
