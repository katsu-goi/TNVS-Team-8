import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, Download, Eye, FileArchive,
  FileText, Folder, FolderOpen, LockKeyhole, Printer, RefreshCw, Search, ShieldCheck,
} from 'lucide-react';
import { extractErrorMessage } from '../../api/client';
import {
  ArchiveDepartment, ArchiveDocument, ArchiveFilters, DocumentAccessRequest,
  DocumentViewerError, documentArchiveService,
} from '../../api/documentArchiveService';
import { hasPermission, useAuthStore } from '../../stores/authStore';
import {
  Button, Card, EmptyState, ErrorState, FormField, LoadingState, Modal, PageHeader,
  ResponsiveTableContainer, SelectField, StatusBadge, TextAreaField,
} from '../ui/SharedUI';

type ArchiveView = 'archive' | 'access-requests';

const MANILA_DATE = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
});

const MANILA_DATE_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
});

function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return (withTime ? MANILA_DATE_TIME : MANILA_DATE).format(parsed);
}

function label(value: string | null | undefined): string {
  if (!value) return 'Not available';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classificationTone(value: ArchiveDocument['classification']): 'info' | 'warning' | 'danger' | 'neutral' {
  if (value === 'PUBLIC') return 'info';
  if (value === 'INTERNAL') return 'neutral';
  if (value === 'CONFIDENTIAL') return 'warning';
  return 'danger';
}

function documentViewerErrorMessage(error: unknown, viewerKind?: ArchiveDocument['viewerKind']): string {
  if (error instanceof DocumentViewerError) return error.message;
  const status = Number((error as { response?: { status?: unknown } })?.response?.status);
  if (status === 403) return 'You do not have permission to view this document.';
  if (status === 404) return viewerKind === 'PDF' ? 'The PDF file could not be found.' : 'The document file could not be found.';
  return 'Unable to load the document. Try again.';
}

const EMPTY_FILTERS: ArchiveFilters = {
  search: '', classification: '', documentType: '', archiveStatus: '', retentionStatus: '',
  owner: '', aiStatus: '', ocrStatus: '', dateFrom: '', dateTo: '',
};

export const EnterpriseDocumentArchive: React.FC<{ initialView?: ArchiveView }> = ({ initialView = 'archive' }) => {
  const user = useAuthStore((state) => state.user);
  const canApprove = hasPermission(user, 'DOCUMENT_APPROVE_ACCESS');
  const [view, setView] = useState<ArchiveView>(initialView);
  const [departments, setDepartments] = useState<ArchiveDepartment[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<ArchiveDepartment | null>(null);
  const [filters, setFilters] = useState<ArchiveFilters>(EMPTY_FILTERS);
  const [documents, setDocuments] = useState<ArchiveDocument[]>([]);
  const [folderSearch, setFolderSearch] = useState('');
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [departmentError, setDepartmentError] = useState('');
  const [error, setError] = useState('');
  const [viewerDocument, setViewerDocument] = useState<ArchiveDocument | null>(null);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerLoading, setViewerLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [viewerError, setViewerError] = useState('');
  const viewerAbortRef = useRef<AbortController | null>(null);
  const viewerObjectUrlRef = useRef<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<ArchiveDocument | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [lifecycleTarget, setLifecycleTarget] = useState<ArchiveDocument | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  const loadDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    setDepartmentError('');
    try { setDepartments(await documentArchiveService.getDepartments()); }
    catch (reason) { setDepartments([]); setDepartmentError(extractErrorMessage(reason)); }
    finally { setLoadingDepartments(false); }
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!selectedDepartment && !String(filters.search || '').trim()) {
      setDocuments([]);
      return;
    }
    setLoadingDocuments(true);
    setError('');
    try {
      const result = await documentArchiveService.getDocuments({
        ...filters,
        departmentId: selectedDepartment?.id,
      });
      setDocuments(result.documents);
    } catch (reason) { setError(extractErrorMessage(reason)); }
    finally { setLoadingDocuments(false); }
  }, [filters, selectedDepartment]);

  useEffect(() => { void loadDepartments(); }, [loadDepartments]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDocuments(); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  const visibleDepartments = useMemo(() => {
    const query = folderSearch.trim().toLowerCase();
    return query ? departments.filter((department) => department.name.toLowerCase().includes(query)) : departments;
  }, [departments, folderSearch]);

  const updateFilter = (key: keyof ArchiveFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const releaseViewerObjectUrl = useCallback(() => {
    if (viewerObjectUrlRef.current) {
      window.URL.revokeObjectURL(viewerObjectUrlRef.current);
      viewerObjectUrlRef.current = null;
    }
  }, []);

  const closeViewer = useCallback(() => {
    viewerAbortRef.current?.abort();
    viewerAbortRef.current = null;
    releaseViewerObjectUrl();
    setViewerDocument(null);
    setViewerUrl('');
    setViewerError('');
    setViewerLoading(false);
    setPreviewLoading(false);
  }, [releaseViewerObjectUrl]);

  useEffect(() => () => {
    viewerAbortRef.current?.abort();
    releaseViewerObjectUrl();
  }, [releaseViewerObjectUrl]);

  const openDocument = async (document: ArchiveDocument) => {
    viewerAbortRef.current?.abort();
    const controller = new AbortController();
    viewerAbortRef.current = controller;
    releaseViewerObjectUrl();
    setViewerDocument(document);
    setViewerLoading(true);
    setPreviewLoading(false);
    setViewerUrl('');
    setViewerError('');
    try {
      const detail = await documentArchiveService.getDocument(document.id, controller.signal);
      if (controller.signal.aborted) return;
      setViewerDocument(detail);
      setViewerLoading(false);
      if (detail.access.view && (detail.viewerKind === 'PDF' || detail.viewerKind === 'IMAGE')) {
        setPreviewLoading(true);
        const preview = await documentArchiveService.getViewerFile(detail.id, detail.viewerKind, controller.signal);
        if (controller.signal.aborted) return;
        const objectUrl = window.URL.createObjectURL(preview.blob);
        if (controller.signal.aborted) {
          window.URL.revokeObjectURL(objectUrl);
          return;
        }
        viewerObjectUrlRef.current = objectUrl;
        setViewerUrl(objectUrl);
      }
    } catch (reason) {
      if (!controller.signal.aborted) setViewerError(documentViewerErrorMessage(reason, document.viewerKind));
    } finally {
      if (viewerAbortRef.current === controller) {
        setViewerLoading(false);
        setPreviewLoading(false);
      }
    }
  };

  const refresh = async () => {
    await Promise.all([loadDepartments(), loadDocuments()]);
  };

  const runLifecycleAction = async () => {
    if (!lifecycleTarget) return;
    setLifecycleBusy(true);
    try {
      if (lifecycleTarget.access.restore) await documentArchiveService.restoreDocument(lifecycleTarget.id);
      else await documentArchiveService.archiveDocument(lifecycleTarget.id);
      setLifecycleTarget(null);
      setViewerDocument(null);
      await refresh();
    } catch (reason) { setError(extractErrorMessage(reason)); }
    finally { setLifecycleBusy(false); }
  };

  const submitAccessRequest = async () => {
    if (!requestTarget || requestReason.trim().length < 10) return;
    setRequestBusy(true);
    try {
      await documentArchiveService.requestAccess(requestTarget.id, requestReason.trim(), ['VIEW']);
      setRequestTarget(null);
      setRequestReason('');
    } catch (reason) { setError(extractErrorMessage(reason)); }
    finally { setRequestBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document Management"
        title={view === 'archive' ? 'Enterprise Document Archive' : 'Document Access Requests'}
        description={view === 'archive'
          ? 'Authorization-scoped department repositories, retained records, classification, and secure document viewing.'
          : 'Human-reviewed access decisions. Approval never occurs automatically.'}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant={view === 'archive' ? 'primary' : 'secondary'} onClick={() => setView('archive')}><FileArchive className="h-4 w-4" />Archive</Button>
          <Button variant={view === 'access-requests' ? 'primary' : 'secondary'} onClick={() => setView('access-requests')}><LockKeyhole className="h-4 w-4" />Access Requests</Button>
          <Button aria-label="Refresh archive" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button>
        </div>}
      />

      {view === 'access-requests' ? <AccessRequestWorkspace canApprove={canApprove} /> : departmentError || error ? (
        <ErrorState
          message={departmentError || error}
          onRetry={() => void (departmentError ? loadDepartments() : refresh())}
        />
      ) : <>
        {!selectedDepartment && !String(filters.search || '').trim() ? (
          <DepartmentFolders
            departments={visibleDepartments}
            search={folderSearch}
            loading={loadingDepartments}
            onSearch={setFolderSearch}
            onOpen={(department) => { setSelectedDepartment(department); setFilters(EMPTY_FILTERS); }}
          />
        ) : (
          <DepartmentRepository
            department={selectedDepartment}
            departments={departments}
            documents={documents}
            filters={filters}
            loading={loadingDocuments}
            onBack={() => { setSelectedDepartment(null); setFilters(EMPTY_FILTERS); }}
            onDepartment={(id) => setSelectedDepartment(departments.find((item) => item.id === id) ?? null)}
            onFilter={updateFilter}
            onClear={() => setFilters(EMPTY_FILTERS)}
            onOpen={(document) => void openDocument(document)}
            onDownload={(document) => void documentArchiveService.downloadDocument(document.id, document.fileName || undefined).catch((reason) => setError(extractErrorMessage(reason)))}
            onRequest={setRequestTarget}
            onLifecycle={setLifecycleTarget}
          />
        )}

        {!selectedDepartment && (
          <Card className="p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                aria-label="Search the authorized enterprise archive"
                value={String(filters.search || '')}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Search authorized documents across departments..."
                className="min-h-11 w-full rounded-control border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
          </Card>
        )}
      </>}

      <DocumentViewer
        document={viewerDocument}
        previewUrl={viewerUrl}
        loading={viewerLoading}
        previewLoading={previewLoading}
        error={viewerError}
        onClose={closeViewer}
        onRetry={() => { if (viewerDocument) void openDocument(viewerDocument); }}
        onDownload={(document) => void documentArchiveService.downloadDocument(document.id, document.fileName || undefined).catch((reason) => setError(extractErrorMessage(reason)))}
        onRequest={(document) => { closeViewer(); setRequestTarget(document); }}
        onLifecycle={(document) => { closeViewer(); setLifecycleTarget(document); }}
      />

      <Modal
        open={Boolean(requestTarget)}
        title="Request document access"
        description={`Your reason will be routed to the authorized approver for ${requestTarget?.title || 'this document'}.`}
        onClose={() => { if (!requestBusy) { setRequestTarget(null); setRequestReason(''); } }}
        closeDisabled={requestBusy}
        footer={<><Button disabled={requestBusy} onClick={() => setRequestTarget(null)}>Cancel</Button><Button variant="primary" busy={requestBusy} disabled={requestReason.trim().length < 10} onClick={() => void submitAccessRequest()}>Submit request</Button></>}
      >
        <TextAreaField label="Business reason" required minLength={10} value={requestReason} onChange={(event) => setRequestReason(event.target.value)} hint="At least 10 characters. Access is never granted automatically." />
      </Modal>

      <Modal
        open={Boolean(lifecycleTarget)}
        title={lifecycleTarget?.access.restore ? 'Restore document' : 'Archive document'}
        description={lifecycleTarget?.access.restore
          ? 'Restore this retained document to active status? The stored file remains unchanged.'
          : 'Archive this document? It will remain retained, searchable, and viewable by authorized users.'}
        onClose={() => { if (!lifecycleBusy) setLifecycleTarget(null); }}
        closeDisabled={lifecycleBusy}
        footer={<><Button disabled={lifecycleBusy} onClick={() => setLifecycleTarget(null)}>Cancel</Button><Button variant="primary" busy={lifecycleBusy} onClick={() => void runLifecycleAction()}>{lifecycleTarget?.access.restore ? 'Restore' : 'Archive'}</Button></>}
      />
    </div>
  );
};

const DepartmentFolders: React.FC<{
  departments: ArchiveDepartment[]; search: string; loading: boolean;
  onSearch: (value: string) => void; onOpen: (department: ArchiveDepartment) => void;
}> = ({ departments, search, loading, onSearch, onOpen }) => (
  <section className="space-y-4">
    <div className="relative max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
      <input aria-label="Search departments" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Find an authorized department folder..." className="min-h-11 w-full rounded-control border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
    </div>
    {loading ? <LoadingState label="Loading authorized department folders..." /> : departments.length === 0 ? (
      <EmptyState title="No department repositories" description="No department with documents visible to your account is currently available." />
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {departments.map((department) => (
          <button key={department.id} type="button" onClick={() => onOpen(department)} className="group rounded-card border border-slate-200 bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-500/25">
            <div className="flex items-start justify-between gap-4">
              <span className="rounded-2xl bg-brand-50 p-3 text-brand-700"><Folder className="h-7 w-7 fill-current/15" /></span>
              {department.restrictedDocumentCount > 0 && <StatusBadge tone="danger"><LockKeyhole className="mr-1 h-3 w-3" />{department.restrictedDocumentCount} restricted</StatusBadge>}
            </div>
            <h2 className="mt-5 text-lg font-bold text-slate-950 group-hover:text-brand-700">{department.name}</h2>
            <p className="mt-1 text-xs text-slate-500">{department.authorizedDocumentCount} authorized document{department.authorizedDocumentCount === 1 ? '' : 's'}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div><span className="block text-slate-400">Active</span><strong className="text-slate-800">{department.activeDocumentCount}</strong></div>
              <div><span className="block text-slate-400">Archived</span><strong className="text-slate-800">{department.archivedDocumentCount}</strong></div>
            </div>
            <p className="mt-4 text-[11px] text-slate-400">Updated {formatDate(department.lastUpdatedAt, true)} · Asia/Manila</p>
          </button>
        ))}
      </div>
    )}
  </section>
);

const DepartmentRepository: React.FC<{
  department: ArchiveDepartment | null; departments: ArchiveDepartment[]; documents: ArchiveDocument[];
  filters: ArchiveFilters; loading: boolean; onBack: () => void; onDepartment: (id: string) => void;
  onFilter: (key: keyof ArchiveFilters, value: string) => void; onClear: () => void;
  onOpen: (document: ArchiveDocument) => void; onDownload: (document: ArchiveDocument) => void;
  onRequest: (document: ArchiveDocument) => void; onLifecycle: (document: ArchiveDocument) => void;
}> = ({ department, departments, documents, filters, loading, onBack, onDepartment, onFilter, onClear, onOpen, onDownload, onRequest, onLifecycle }) => (
  <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={onBack}><ArrowLeft className="h-4 w-4" />Folders</Button>
      <div className="flex min-w-0 items-center gap-3"><FolderOpen className="h-6 w-6 text-brand-600" /><div><h2 className="truncate text-xl font-bold text-slate-950">{department?.name || 'Authorized enterprise search'}</h2><p className="text-xs text-slate-500">Logical repository · authorization applied before results are returned</p></div></div>
    </div>
    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FormField label="Search" value={String(filters.search || '')} onChange={(event) => onFilter('search', event.target.value)} placeholder="Title, file, reference, tag..." />
        <SelectField label="Department" value={department?.id || ''} onChange={(event) => onDepartment(event.target.value)}><option value="">All authorized departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
        <SelectField label="Classification" value={String(filters.classification || '')} onChange={(event) => onFilter('classification', event.target.value)}><option value="">All</option>{['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'HIGHLY_RESTRICTED'].map((value) => <option key={value}>{value}</option>)}</SelectField>
        <SelectField label="Archive status" value={String(filters.archiveStatus || '')} onChange={(event) => onFilter('archiveStatus', event.target.value)}><option value="">All</option>{['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ARCHIVED'].map((value) => <option key={value}>{value}</option>)}</SelectField>
        <FormField label="Document type" value={String(filters.documentType || '')} onChange={(event) => onFilter('documentType', event.target.value)} placeholder="Contract, report..." />
        <FormField label="Owner" value={String(filters.owner || '')} onChange={(event) => onFilter('owner', event.target.value)} placeholder="Owner email" />
        <SelectField label="Retention" value={String(filters.retentionStatus || '')} onChange={(event) => onFilter('retentionStatus', event.target.value)}><option value="">All</option>{['UNASSIGNED', 'SCHEDULED', 'EXPIRING', 'ELIGIBLE_FOR_DISPOSAL', 'LEGAL_HOLD', 'DISPOSED', 'EXTENDED'].map((value) => <option key={value}>{value}</option>)}</SelectField>
        <SelectField label="AI classification" value={String(filters.aiStatus || '')} onChange={(event) => onFilter('aiStatus', event.target.value)}><option value="">All</option><option value="AI_SUGGESTED">AI Suggested</option><option value="HUMAN_CONFIRMED">Human Confirmed</option><option value="UNAVAILABLE">Unavailable</option></SelectField>
        <SelectField label="OCR" value={String(filters.ocrStatus || '')} onChange={(event) => onFilter('ocrStatus', event.target.value)}><option value="">All</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option></SelectField>
        <FormField label="From date" type="date" value={String(filters.dateFrom || '')} onChange={(event) => onFilter('dateFrom', event.target.value)} />
        <FormField label="To date" type="date" value={String(filters.dateTo || '')} onChange={(event) => onFilter('dateTo', event.target.value)} />
        <div className="flex items-end"><Button className="w-full" onClick={onClear}>Clear filters</Button></div>
      </div>
    </Card>
    {loading ? <LoadingState label="Loading authorized documents..." /> : documents.length === 0 ? (
      <EmptyState title="No documents found" description={department ? 'No authorized documents match this department and filter set.' : 'No authorized documents match this enterprise search.'} />
    ) : <DocumentResults documents={documents} onOpen={onOpen} onDownload={onDownload} onRequest={onRequest} onLifecycle={onLifecycle} />}
  </section>
);

const DocumentActions: React.FC<{
  document: ArchiveDocument; onOpen: (document: ArchiveDocument) => void;
  onDownload: (document: ArchiveDocument) => void; onRequest: (document: ArchiveDocument) => void;
  onLifecycle: (document: ArchiveDocument) => void;
}> = ({ document, onOpen, onDownload, onRequest, onLifecycle }) => <div className="flex flex-wrap gap-2">
  <Button className="min-h-9 px-3 py-1.5 text-xs" onClick={() => onOpen(document)}><Eye className="h-3.5 w-3.5" />{document.access.view ? 'View' : 'Metadata'}</Button>
  {document.access.download && <Button className="min-h-9 px-3 py-1.5 text-xs" onClick={() => onDownload(document)}><Download className="h-3.5 w-3.5" />Download</Button>}
  {document.access.requestAccess && <Button className="min-h-9 px-3 py-1.5 text-xs" variant="primary" onClick={() => onRequest(document)}><LockKeyhole className="h-3.5 w-3.5" />Request access</Button>}
  {(document.access.archive || document.access.restore) && <Button className="min-h-9 px-3 py-1.5 text-xs" onClick={() => onLifecycle(document)}><Archive className="h-3.5 w-3.5" />{document.access.restore ? 'Restore' : 'Archive'}</Button>}
</div>;

const DocumentResults: React.FC<{
  documents: ArchiveDocument[]; onOpen: (document: ArchiveDocument) => void;
  onDownload: (document: ArchiveDocument) => void; onRequest: (document: ArchiveDocument) => void;
  onLifecycle: (document: ArchiveDocument) => void;
}> = ({ documents, onOpen, onDownload, onRequest, onLifecycle }) => <>
  <ResponsiveTableContainer className="hidden md:block">
    <table className="w-full min-w-[1080px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Classification</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Effective</th><th className="px-4 py-3">Retention</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Actions</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{documents.map((document) => <tr key={document.id} className="align-top hover:bg-slate-50/70"><td className="px-4 py-4"><button className="text-left font-semibold text-slate-950 hover:text-brand-700" onClick={() => onOpen(document)}>{document.title}</button><p className="mt-1 max-w-56 truncate text-xs text-slate-500">{document.fileName || document.documentNumber || 'Metadata record'}</p></td><td className="px-4 py-4 text-xs text-slate-600">{label(document.documentType)}</td><td className="px-4 py-4"><StatusBadge tone={classificationTone(document.classification)}>{label(document.classification)}</StatusBadge></td><td className="px-4 py-4"><StatusBadge tone={document.archiveStatus === 'ARCHIVED' ? 'warning' : 'success'}>{label(document.archiveStatus)}</StatusBadge></td><td className="px-4 py-4 text-xs text-slate-600">{document.ownerEmail || 'Not available'}</td><td className="px-4 py-4 text-xs text-slate-600">{formatDate(document.effectiveDate)}</td><td className="px-4 py-4 text-xs text-slate-600">{label(document.retentionStatus)}</td><td className="px-4 py-4 text-xs text-slate-600">{formatDate(document.updatedAt, true)}</td><td className="px-4 py-4"><DocumentActions document={document} onOpen={onOpen} onDownload={onDownload} onRequest={onRequest} onLifecycle={onLifecycle} /></td></tr>)}</tbody>
    </table>
  </ResponsiveTableContainer>
  <div className="grid gap-4 md:hidden">{documents.map((document) => <Card key={document.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold text-slate-950">{document.title}</h3><p className="mt-1 truncate text-xs text-slate-500">{document.fileName || 'Metadata record'}</p></div><StatusBadge tone={classificationTone(document.classification)}>{label(document.classification)}</StatusBadge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-400">Status</dt><dd className="font-semibold text-slate-700">{label(document.archiveStatus)}</dd></div><div><dt className="text-slate-400">Type</dt><dd className="font-semibold text-slate-700">{label(document.documentType)}</dd></div><div><dt className="text-slate-400">Retention</dt><dd className="font-semibold text-slate-700">{label(document.retentionStatus)}</dd></div><div><dt className="text-slate-400">Updated</dt><dd className="font-semibold text-slate-700">{formatDate(document.updatedAt)}</dd></div></dl><div className="mt-4 border-t border-slate-100 pt-4"><DocumentActions document={document} onOpen={onOpen} onDownload={onDownload} onRequest={onRequest} onLifecycle={onLifecycle} /></div></Card>)}</div>
</>;

const DocumentViewer: React.FC<{
  document: ArchiveDocument | null; previewUrl: string; loading: boolean; previewLoading: boolean; error: string;
  onClose: () => void; onRetry: () => void;
  onDownload: (document: ArchiveDocument) => void; onRequest: (document: ArchiveDocument) => void;
  onLifecycle: (document: ArchiveDocument) => void;
}> = ({ document, previewUrl, loading, previewLoading, error, onClose, onRetry, onDownload, onRequest, onLifecycle }) => (
  <Modal open={Boolean(document) || loading} title="Document Viewer" description="Private content is fetched only after server authorization and uses a short-lived signed URL." onClose={onClose} size="xl" footer={document ? <>
    {document.access.download && <Button onClick={() => onDownload(document)}><Download className="h-4 w-4" />Download</Button>}
    {document.access.print && previewUrl && <Button onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}><Printer className="h-4 w-4" />Open to print</Button>}
    {document.access.requestAccess && <Button variant="primary" onClick={() => onRequest(document)}><LockKeyhole className="h-4 w-4" />Request access</Button>}
    {(document.access.archive || document.access.restore) && <Button onClick={() => onLifecycle(document)}><Archive className="h-4 w-4" />{document.access.restore ? 'Restore' : 'Archive'}</Button>}
  </> : undefined}>
    {loading || !document ? <LoadingState label="Authorizing document viewer..." /> : <div className="grid max-h-[70vh] gap-5 overflow-y-auto lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
      <div className="min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {!document.access.view ? <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center"><LockKeyhole className="h-10 w-10 text-slate-400" /><h3 className="mt-4 font-bold text-slate-900">Content access is restricted</h3><p className="mt-2 max-w-md text-sm text-slate-500">You may view authorized metadata. Submit a reasoned request for document content access.</p></div>
          : (document.viewerKind === 'PDF' || document.viewerKind === 'IMAGE') && previewLoading ? <LoadingState label="Loading document..." className="min-h-[520px] border-0 bg-transparent" />
            : (document.viewerKind === 'PDF' || document.viewerKind === 'IMAGE') && error ? <ErrorState title="Unable to preview this document" message={error} onRetry={onRetry} className="min-h-[520px] rounded-none border-0" />
              : document.viewerKind === 'PDF' && previewUrl ? <iframe title={`Preview of ${document.title}`} src={previewUrl} className="h-[62vh] min-h-[520px] w-full bg-white" />
                : document.viewerKind === 'IMAGE' && previewUrl ? <div className="flex min-h-[520px] items-center justify-center p-4"><img src={previewUrl} alt={`Preview of ${document.title}`} className="max-h-[58vh] max-w-full object-contain" /></div>
              : document.viewerKind === 'TEXT' ? <pre className="max-h-[62vh] min-h-[520px] overflow-auto whitespace-pre-wrap break-words bg-white p-5 text-sm text-slate-700">{document.ocrText || 'No extracted text is available for this document.'}</pre>
                : <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><FileText className="h-10 w-10 text-slate-400" /><h3 className="mt-4 font-bold text-slate-900">Preview unavailable</h3><p className="mt-2 max-w-md text-sm text-slate-500">This format cannot be previewed safely in the browser. Authorized users may download the original file.</p></div>}
      </div>
      <aside className="space-y-4">
        <div><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Document details</p><h2 className="mt-1 text-lg font-bold text-slate-950">{document.title}</h2><p className="mt-1 break-all text-xs text-slate-500">{document.fileName || 'Metadata-only record'}</p></div>
        <div className="flex flex-wrap gap-2"><StatusBadge tone={classificationTone(document.classification)}>{label(document.classification)}</StatusBadge><StatusBadge tone={document.archiveStatus === 'ARCHIVED' ? 'warning' : 'success'}>{label(document.archiveStatus)}</StatusBadge>{document.retentionStatus === 'LEGAL_HOLD' && <StatusBadge tone="danger">Legal hold</StatusBadge>}</div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          {[
            ['Department', document.department.name], ['Document type', label(document.documentType)],
            ['Owner', document.ownerEmail], ['Document number', document.documentNumber],
            ['Effective date', formatDate(document.effectiveDate)], ['Expiration date', formatDate(document.expirationDate)],
            ['Version', document.version ? String(document.version) : null], ['Uploaded', formatDate(document.uploadedAt, true)],
            ['Last modified', formatDate(document.updatedAt, true)], ['Retention', label(document.retentionStatus)],
            ['Review date', formatDate(document.retentionReviewDate)], ['Retention period', document.retentionPolicy?.periodDays ? `${document.retentionPolicy.periodDays} days` : null],
            ['AI classification', label(document.aiClassificationStatus)], ['OCR', label(document.ocrStatus)],
            ['Content access', document.access.view ? 'Authorized' : 'Metadata only'],
          ].map(([term, value]) => <div key={term} className="min-w-0"><dt className="text-slate-400">{term}</dt><dd className="mt-0.5 break-words font-semibold text-slate-700">{value || 'Not available'}</dd></div>)}
        </dl>
        {document.aiClassificationStatus === 'AI_SUGGESTED' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><strong>AI Suggested.</strong> Classification remains advisory until an authorized human confirms it.</div>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-600" />Archived records remain retained and retrievable. Archive status does not delete content.</div>
        <p className="text-[11px] text-slate-400">Version history is not available in the current canonical document schema.</p>
      </aside>
    </div>}
  </Modal>
);

const AccessRequestWorkspace: React.FC<{ canApprove: boolean }> = ({ canApprove }) => {
  const [scope, setScope] = useState<'mine' | 'approvals'>(canApprove ? 'approvals' : 'mine');
  const [requests, setRequests] = useState<DocumentAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<{ request: DocumentAccessRequest; value: 'APPROVE' | 'DENY' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(''); try { setRequests(await documentArchiveService.getAccessRequests(scope)); } catch (cause) { setError(extractErrorMessage(cause)); } finally { setLoading(false); } }, [scope]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => { if (!decision || reason.trim().length < 5) return; setBusy(true); try { await documentArchiveService.decideAccessRequest(decision.request.id, decision.value, reason.trim()); setDecision(null); setReason(''); await load(); } catch (cause) { setError(extractErrorMessage(cause)); } finally { setBusy(false); } };
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2"><Button variant={scope === 'mine' ? 'primary' : 'secondary'} onClick={() => setScope('mine')}>My requests</Button>{canApprove && <Button variant={scope === 'approvals' ? 'primary' : 'secondary'} onClick={() => setScope('approvals')}>Pending approvals</Button>}</div>
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    {loading ? <LoadingState label="Loading authorized access requests..." /> : requests.length === 0 ? <EmptyState title="No access requests" description={scope === 'mine' ? 'You have not submitted any document access requests.' : 'No pending requests are routed to your approval scope.'} /> : <div className="grid gap-4">{requests.map((request) => <Card key={request.id} className="p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{request.documentTitle || 'Document'}</h3><StatusBadge tone={request.status === 'APPROVED' ? 'success' : request.status === 'DENIED' ? 'danger' : 'warning'}>{label(request.status)}</StatusBadge><StatusBadge tone="danger">{label(request.classification)}</StatusBadge></div><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-slate-400">Requester</dt><dd className="font-semibold text-slate-700">{request.requesterEmail}</dd></div><div><dt className="text-slate-400">Routed approver</dt><dd className="font-semibold text-slate-700">{label(request.routedApproverRole)}</dd></div><div><dt className="text-slate-400">Requested actions</dt><dd className="font-semibold text-slate-700">{request.requestedActions.map(label).join(', ')}</dd></div><div><dt className="text-slate-400">Submitted</dt><dd className="font-semibold text-slate-700">{formatDate(request.createdAt, true)}</dd></div></dl><p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Reason:</strong> {request.reason}</p>{request.decisionReason && <p className="mt-2 text-xs text-slate-600"><strong>Decision reason:</strong> {request.decisionReason}</p>}</div>{scope === 'approvals' && request.status === 'PENDING' && <div className="flex shrink-0 gap-2"><Button variant="success" onClick={() => setDecision({ request, value: 'APPROVE' })}>Approve</Button><Button variant="danger" onClick={() => setDecision({ request, value: 'DENY' })}>Deny</Button></div>}</div></Card>)}</div>}
    <Modal open={Boolean(decision)} title={`${decision?.value === 'APPROVE' ? 'Approve' : 'Deny'} document access`} description="Record a human decision reason. The decision and any resulting explicit grant are audited." onClose={() => { if (!busy) { setDecision(null); setReason(''); } }} closeDisabled={busy} footer={<><Button disabled={busy} onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision?.value === 'APPROVE' ? 'success' : 'danger'} busy={busy} disabled={reason.trim().length < 5} onClick={() => void submit()}>{decision?.value === 'APPROVE' ? 'Approve access' : 'Deny access'}</Button></>}><TextAreaField label="Decision reason" required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} /></Modal>
  </section>;
};

export default EnterpriseDocumentArchive;
