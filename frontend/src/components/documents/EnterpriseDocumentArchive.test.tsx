import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnterpriseDocumentArchive } from './EnterpriseDocumentArchive';
import { documentArchiveService } from '../../api/documentArchiveService';

vi.mock('../../api/documentArchiveService', () => ({
  DocumentViewerError: class DocumentViewerError extends Error {},
  documentArchiveService: {
    getDepartments: vi.fn(), getDocuments: vi.fn(), getDocument: vi.fn(), getViewerUrl: vi.fn(), getViewerFile: vi.fn(),
    downloadDocument: vi.fn(), archiveDocument: vi.fn(), restoreDocument: vi.fn(),
    requestAccess: vi.fn(), getAccessRequests: vi.fn(), decideAccessRequest: vi.fn(),
  },
}));

const department = {
  id: 'department-id', name: 'Existing Department', status: 'ACTIVE', authorizedDocumentCount: 1,
  activeDocumentCount: 0, archivedDocumentCount: 1, restrictedDocumentCount: 1,
  lastUpdatedAt: '2026-10-01T01:00:00Z',
};

const secondDepartment = {
  ...department,
  id: 'second-department-id',
  name: 'Finance Services',
  authorizedDocumentCount: 3,
};

const archivedDocument = {
  id: 'document-id', title: 'Retention Schedule', fileName: 'retention.pdf', fileType: 'application/pdf',
  fileSize: 100, documentType: 'POLICY', documentNumber: 'RS-1', department: { id: 'department-id', name: 'Existing Department', status: 'ACTIVE' },
  ownerEmail: 'owner@hirna.test', classification: 'RESTRICTED', archiveStatus: 'ARCHIVED', retentionStatus: 'SCHEDULED',
  retentionPolicy: null, retentionStartDate: null, retentionReviewDate: null, effectiveDate: null, expirationDate: null,
  version: 1, uploadedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-01T01:00:00Z',
  aiClassificationStatus: 'HUMAN_CONFIRMED', ocrStatus: 'AVAILABLE', viewerKind: 'PDF', tags: [],
  access: { metadata: true, view: true, download: true, print: true, share: false, requestAccess: false, editMetadata: true, classify: true, archive: false, restore: true, manageRetention: true },
  ocrText: 'retention text', aiSummary: null,
};

describe('EnterpriseDocumentArchive', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:authorized-document-preview') });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(documentArchiveService.getDepartments).mockResolvedValue([department]);
    vi.mocked(documentArchiveService.getDocuments).mockResolvedValue({ documents: [archivedDocument as never], total: 1 });
    vi.mocked(documentArchiveService.getDocument).mockResolvedValue(archivedDocument as never);
    vi.mocked(documentArchiveService.getViewerFile).mockResolvedValue({ blob: new Blob(['%PDF-1.7\n'], { type: 'application/pdf' }), expiresAt: '2026-10-01T01:05:00Z', contentType: 'application/pdf', fileName: 'retention.pdf' });
    vi.mocked(documentArchiveService.downloadDocument).mockResolvedValue(undefined);
    vi.mocked(documentArchiveService.getAccessRequests).mockResolvedValue([]);
  });

  it('loads database departments and opens the selected logical repository', async () => {
    render(<EnterpriseDocumentArchive />);
    expect(await screen.findByRole('button', { name: /Existing Department/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Existing Department/ }));
    await waitFor(() => expect(documentArchiveService.getDocuments).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 'department-id' })));
    expect(await screen.findAllByText('Retention Schedule')).not.toHaveLength(0);
  });

  it('shows only the API error and retries the department request', async () => {
    vi.mocked(documentArchiveService.getDepartments)
      .mockRejectedValueOnce(new Error('No route for GET /documents/archive/departments'))
      .mockResolvedValueOnce([department]);
    render(<EnterpriseDocumentArchive />);
    expect(await screen.findByText('No route for GET /documents/archive/departments')).toBeInTheDocument();
    expect(screen.queryByText('No department repositories')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Existing Department/ })).toBeInTheDocument();
    expect(documentArchiveService.getDepartments).toHaveBeenCalledTimes(2);
  });

  it('shows the department loading state while the request is pending', () => {
    vi.mocked(documentArchiveService.getDepartments).mockImplementation(() => new Promise(() => undefined));
    render(<EnterpriseDocumentArchive />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading authorized department folders...');
    expect(screen.queryByText('No department repositories')).not.toBeInTheDocument();
  });

  it.each([
    ['401 Unauthorized', { response: { data: { message: 'Authentication required.' } } }, 'Authentication required.'],
    ['403 Forbidden', { response: { data: { message: 'Document archive access is forbidden.' } } }, 'Document archive access is forbidden.'],
    ['network failure', new Error('Archive service is unavailable.'), 'Archive service is unavailable.'],
  ])('shows only the error state for %s', async (_case, failure, message) => {
    vi.mocked(documentArchiveService.getDepartments).mockRejectedValue(failure);
    render(<EnterpriseDocumentArchive />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('No department repositories')).not.toBeInTheDocument();
  });

  it('shows an empty state only after a successful empty response', async () => {
    vi.mocked(documentArchiveService.getDepartments).mockResolvedValue([]);
    render(<EnterpriseDocumentArchive />);
    expect(await screen.findByText('No department repositories')).toBeInTheDocument();
    expect(screen.queryByText('Unable to load this content')).not.toBeInTheDocument();
  });

  it('filters successfully loaded authorized departments by name', async () => {
    vi.mocked(documentArchiveService.getDepartments).mockResolvedValue([department, secondDepartment]);
    render(<EnterpriseDocumentArchive />);
    expect(await screen.findByRole('button', { name: /Existing Department/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finance Services/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search departments' }), { target: { value: 'finance' } });
    expect(screen.queryByRole('button', { name: /Existing Department/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finance Services/ })).toBeInTheDocument();
  });

  it('renders an authorized PDF from a verified local blob URL', async () => {
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    const previewButtons = await screen.findAllByRole('button', { name: 'Preview Document' });
    fireEvent.click(previewButtons[0]);
    await waitFor(() => expect(documentArchiveService.getViewerFile).toHaveBeenCalledWith('document-id', 'PDF', expect.any(AbortSignal)));
    expect(await screen.findByTitle('Preview of Retention Schedule')).toHaveAttribute('src', 'blob:authorized-document-preview');
    expect(screen.getByText('Preview information')).toBeInTheDocument();
  });

  it('opens full record details separately without fetching preview bytes', async () => {
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'View Details' }))[0]);
    const details = await screen.findByRole('dialog', { name: 'Document Details' });
    expect(within(details).getByText('Version and history')).toBeInTheDocument();
    expect(within(details).getByText('Record ID: document-id')).toBeInTheDocument();
    expect(documentArchiveService.getDocument).toHaveBeenCalledWith('document-id', expect.any(AbortSignal));
    expect(documentArchiveService.getViewerFile).not.toHaveBeenCalled();
  });

  it('wires each icon action to only its row document ID', async () => {
    const financeDocument = { ...archivedDocument, id: 'finance-document-id', title: 'Finance Ledger', fileName: 'ledger.pdf' };
    vi.mocked(documentArchiveService.getDocuments).mockResolvedValue({ documents: [archivedDocument, financeDocument] as never, total: 2 });
    vi.mocked(documentArchiveService.getDocument).mockImplementation(async (id) => (id === financeDocument.id ? financeDocument : archivedDocument) as never);
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    const detailActions = await screen.findAllByRole('button', { name: 'View Details' });
    expect(detailActions[1]).toHaveAttribute('title', 'View Details');
    fireEvent.click(detailActions[1]);
    expect(await screen.findByText('Record ID: finance-document-id')).toBeInTheDocument();
    expect(documentArchiveService.getDocument).toHaveBeenCalledWith('finance-document-id', expect.any(AbortSignal));
    expect(documentArchiveService.getDocument).not.toHaveBeenCalledWith('document-id', expect.anything());
  });

  it('shows the required message when the selected file type cannot be previewed', async () => {
    const unsupported = { ...archivedDocument, viewerKind: 'UNSUPPORTED', fileName: 'retention.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    vi.mocked(documentArchiveService.getDocuments).mockResolvedValue({ documents: [unsupported as never], total: 1 });
    vi.mocked(documentArchiveService.getDocument).mockResolvedValue(unsupported as never);
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Preview Document' }))[0]);
    expect(await screen.findByText('Preview is not available for this file type.')).toBeInTheDocument();
    expect(documentArchiveService.getViewerFile).not.toHaveBeenCalled();
  });

  it('shows a recoverable PDF error and retries the authorized file request', async () => {
    vi.mocked(documentArchiveService.getViewerFile)
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce({ blob: new Blob(['%PDF-1.7\n'], { type: 'application/pdf' }), expiresAt: '2026-10-01T01:05:00Z', contentType: 'application/pdf', fileName: 'retention.pdf' });
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Preview Document' }))[0]);
    expect(await screen.findByText('Unable to load the document. Try again.')).toBeInTheDocument();
    const viewer = screen.getByRole('dialog', { name: 'Preview Document' });
    fireEvent.click(within(viewer).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTitle('Preview of Retention Schedule')).toHaveAttribute('src', 'blob:authorized-document-preview');
    expect(documentArchiveService.getViewerFile).toHaveBeenCalledTimes(2);
  });

  it('shows a PDF loading state while authorized bytes are being fetched', async () => {
    vi.mocked(documentArchiveService.getViewerFile).mockImplementation(() => new Promise(() => undefined));
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Preview Document' }))[0]);
    expect(await screen.findByText('Loading document...')).toBeInTheDocument();
    expect(screen.queryByTitle('Preview of Retention Schedule')).not.toBeInTheDocument();
  });

  it.each([
    [403, 'You do not have permission to view this document.'],
    [404, 'The PDF file could not be found.'],
  ])('shows the correct viewer message for HTTP %s', async (status, message) => {
    vi.mocked(documentArchiveService.getViewerFile).mockRejectedValue({ response: { status } });
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Preview Document' }))[0]);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByTitle('Preview of Retention Schedule')).not.toBeInTheDocument();
  });

  it('uses the same document for download and print and revokes the preview on close', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Preview Document' }))[0]);
    const viewer = await screen.findByRole('dialog', { name: 'Preview Document' });
    await screen.findByTitle('Preview of Retention Schedule');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Download' }));
    expect(documentArchiveService.downloadDocument).toHaveBeenCalledWith('document-id', 'retention.pdf');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Open to print' }));
    expect(open).toHaveBeenCalledWith('blob:authorized-document-preview', '_blank', 'noopener,noreferrer');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Close dialog' }));
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:authorized-document-preview');
  });

  it('fetches fresh authorized bytes when the viewer is closed and reopened', async () => {
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Preview Document' }))[0]);
    let viewer = await screen.findByRole('dialog', { name: 'Preview Document' });
    await screen.findByTitle('Preview of Retention Schedule');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Close dialog' }));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Preview Document' }))[0]);
    viewer = await screen.findByRole('dialog', { name: 'Preview Document' });
    expect(await within(viewer).findByTitle('Preview of Retention Schedule')).toHaveAttribute('src', 'blob:authorized-document-preview');
    expect(documentArchiveService.getViewerFile).toHaveBeenCalledTimes(2);
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:authorized-document-preview');
  });

  it('shows metadata without fetching content and submits a reasoned access request', async () => {
    const restricted = {
      ...archivedDocument,
      access: { ...archivedDocument.access, view: false, download: false, print: false, requestAccess: true },
      ocrText: undefined,
    };
    vi.mocked(documentArchiveService.getDocuments).mockResolvedValue({ documents: [restricted as never], total: 1 });
    vi.mocked(documentArchiveService.getDocument).mockResolvedValue(restricted as never);
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'View Details' }))[0]);
    expect(await screen.findByText('Complete metadata and record information for the selected document.')).toBeInTheDocument();
    expect(documentArchiveService.getViewerFile).not.toHaveBeenCalled();
    const viewer = screen.getByRole('dialog', { name: 'Document Details' });
    fireEvent.click(within(viewer).getByRole('button', { name: 'Request access' }));
    const requestDialog = await screen.findByRole('dialog', { name: 'Request document access' });
    fireEvent.change(within(requestDialog).getByRole('textbox'), { target: { value: 'Required for an authorized case review.' } });
    fireEvent.click(within(requestDialog).getByRole('button', { name: 'Submit request' }));
    await waitFor(() => expect(documentArchiveService.requestAccess).toHaveBeenCalledWith(
      'document-id', 'Required for an authorized case review.', ['VIEW'],
    ));
  });
});
