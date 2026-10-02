import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnterpriseDocumentArchive } from './EnterpriseDocumentArchive';
import { documentArchiveService } from '../../api/documentArchiveService';

vi.mock('../../api/documentArchiveService', () => ({
  documentArchiveService: {
    getDepartments: vi.fn(), getDocuments: vi.fn(), getDocument: vi.fn(), getViewerUrl: vi.fn(),
    downloadDocument: vi.fn(), archiveDocument: vi.fn(), restoreDocument: vi.fn(),
    requestAccess: vi.fn(), getAccessRequests: vi.fn(), decideAccessRequest: vi.fn(),
  },
}));

const department = {
  id: 'department-id', name: 'Existing Department', status: 'ACTIVE', authorizedDocumentCount: 1,
  activeDocumentCount: 0, archivedDocumentCount: 1, restrictedDocumentCount: 1,
  lastUpdatedAt: '2026-10-01T01:00:00Z',
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
    vi.mocked(documentArchiveService.getDepartments).mockResolvedValue([department]);
    vi.mocked(documentArchiveService.getDocuments).mockResolvedValue({ documents: [archivedDocument as never], total: 1 });
    vi.mocked(documentArchiveService.getDocument).mockResolvedValue(archivedDocument as never);
    vi.mocked(documentArchiveService.getViewerUrl).mockResolvedValue({ signedUrl: 'https://storage.test/signed', expiresAt: '2026-10-01T01:05:00Z', contentType: 'application/pdf', fileName: 'retention.pdf' });
    vi.mocked(documentArchiveService.getAccessRequests).mockResolvedValue([]);
  });

  it('loads database departments and opens the selected logical repository', async () => {
    render(<EnterpriseDocumentArchive />);
    expect(await screen.findByRole('button', { name: /Existing Department/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Existing Department/ }));
    await waitFor(() => expect(documentArchiveService.getDocuments).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 'department-id' })));
    expect(await screen.findAllByText('Retention Schedule')).not.toHaveLength(0);
  });

  it('opens an archived PDF only through an authorized signed URL', async () => {
    render(<EnterpriseDocumentArchive />);
    fireEvent.click(await screen.findByRole('button', { name: /Existing Department/ }));
    const viewButtons = await screen.findAllByRole('button', { name: 'View' });
    fireEvent.click(viewButtons[0]);
    await waitFor(() => expect(documentArchiveService.getViewerUrl).toHaveBeenCalledWith('document-id'));
    expect(await screen.findByTitle('Preview of Retention Schedule')).toHaveAttribute('src', 'https://storage.test/signed');
    expect(screen.getByText(/Archived records remain retained and retrievable/)).toBeInTheDocument();
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
    fireEvent.click((await screen.findAllByRole('button', { name: 'Metadata' }))[0]);
    expect(await screen.findByText('Content access is restricted')).toBeInTheDocument();
    expect(documentArchiveService.getViewerUrl).not.toHaveBeenCalled();
    const viewer = screen.getByRole('dialog', { name: 'Document Viewer' });
    fireEvent.click(within(viewer).getByRole('button', { name: 'Request access' }));
    const requestDialog = await screen.findByRole('dialog', { name: 'Request document access' });
    fireEvent.change(within(requestDialog).getByRole('textbox'), { target: { value: 'Required for an authorized case review.' } });
    fireEvent.click(within(requestDialog).getByRole('button', { name: 'Submit request' }));
    await waitFor(() => expect(documentArchiveService.requestAccess).toHaveBeenCalledWith(
      'document-id', 'Required for an authorized case review.', ['VIEW'],
    ));
  });
});
