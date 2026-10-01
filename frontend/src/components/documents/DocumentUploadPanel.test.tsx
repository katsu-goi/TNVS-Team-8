import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DocumentUploadPanel from './DocumentUploadPanel';
import { documentService } from '../../api/documentService';

vi.mock('../../api/documentService', () => ({
  documentService: {
    suggestTitle: vi.fn(),
    uploadDocument: vi.fn(),
    downloadDocument: vi.fn(),
    reviewDuplicate: vi.fn(),
  },
  validateUploadFile: vi.fn(() => null),
  extractDuplicateDetection: vi.fn(() => null),
}));

describe('DocumentUploadPanel Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders upload panel and handles AI file selection analysis', async () => {
    const mockAiResponse = {
      document_type: 'MEMORANDUM',
      suggested_title: 'Facilities Maintenance Memorandum - 2026',
      suggestedTitle: 'Facilities Maintenance Memorandum - 2026',
      document_number: 'HIRNA-FAM-MEMO-2026-014',
      department: 'Facilities & Administrative Management',
      classification: 'INTERNAL',
      document_date: '2026-09-25',
      effective_date: '2026-10-01',
      retention_category: 'Administrative Records - 5 Years',
      summary: 'Scheduled preventive maintenance guidance.',
      tags: ['facilities', 'maintenance', 'preventive maintenance'],
      confidence: 0.95,
      extractionMethod: 'PDF_EMBEDDED_TEXT',
    };

    vi.mocked(documentService.suggestTitle).mockResolvedValueOnce(mockAiResponse as any);

    render(<DocumentUploadPanel />);

    const fileInput = screen.getByLabelText(/File/i, { selector: 'input' });
    const file = new File(['sample content'], 'hirna-sample-facilities-maintenance-memorandum.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(documentService.suggestTitle).toHaveBeenCalledWith(file);
    });

    expect(await screen.findByText('AI Document Analysis')).toBeInTheDocument();
    expect(screen.getByText('Facilities Maintenance Memorandum - 2026')).toBeInTheDocument();
    expect(screen.getByText(/HIRNA-FAM-MEMO-2026-014/)).toBeInTheDocument();
    expect(screen.getByText(/Facilities & Administrative Management/)).toBeInTheDocument();
    expect(screen.getByText(/Confidence: 95%/)).toBeInTheDocument();
  });

  it('populates fields when Apply Suggestions is pressed and preserves manual edits', async () => {
    const mockAiResponse = {
      document_type: 'MEMORANDUM',
      suggested_title: 'Facilities Maintenance Memorandum - 2026',
      suggestedTitle: 'Facilities Maintenance Memorandum - 2026',
      document_number: 'HIRNA-FAM-MEMO-2026-014',
      department: 'Facilities & Administrative Management',
      classification: 'INTERNAL',
      confidence: 0.95,
    };

    vi.mocked(documentService.suggestTitle).mockResolvedValueOnce(mockAiResponse as any);

    render(<DocumentUploadPanel />);

    const fileInput = screen.getByLabelText(/File/i, { selector: 'input' });
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const applyButton = await screen.findByRole('button', { name: /Apply Suggestions/i });
    fireEvent.click(applyButton);

    const titleInput = screen.getByLabelText(/Title/i) as HTMLInputElement;
    expect(titleInput.value).toBe('Facilities Maintenance Memorandum - 2026');

    fireEvent.change(titleInput, { target: { value: 'Facilities Maintenance Memorandum - Custom Edit 2026' } });
    expect(titleInput.value).toBe('Facilities Maintenance Memorandum - Custom Edit 2026');
  });

  it('displays manual fallback message when AI suggestion fails', async () => {
    vi.mocked(documentService.suggestTitle).mockRejectedValueOnce(new Error('AI Provider Offline'));

    render(<DocumentUploadPanel />);

    const fileInput = screen.getByLabelText(/File/i, { selector: 'input' });
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText('AI analysis is temporarily unavailable. You can continue entering the document information manually.'),
    ).toBeInTheDocument();
  });

  afterEach(() => cleanup());

  it('shows a no-duplicate result as part of the persisted OCR review', async () => {
    vi.mocked(documentService.suggestTitle).mockResolvedValueOnce({ suggestedTitle: 'Facilities Safety Inspection Record 2026' } as any);
    vi.mocked(documentService.uploadDocument).mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111', title: 'Facilities Safety Inspection Record 2026', fileName: 'inspection.pdf',
      status: 'PENDING_REVIEW', classificationLevel: 'INTERNAL',
      duplicateDetection: { confidence: 'NO_DUPLICATE', status: 'NO_DUPLICATE', checkedAt: '2026-10-01T00:00:00Z', detectorVersion: 'v1', contentCheck: 'COMPLETE', message: 'No existing authorized document matched this upload.', matches: [] },
    } as any);
    render(<DocumentUploadPanel />);
    fireEvent.change(screen.getByLabelText(/File/i, { selector: 'input' }), { target: { files: [new File(['content'], 'inspection.pdf', { type: 'application/pdf' })] } });
    await screen.findByDisplayValue('Facilities Safety Inspection Record 2026');
    fireEvent.click(screen.getByRole('button', { name: /Upload & Analyze/i }));
    expect(await screen.findByText('Duplicate Detection')).toBeInTheDocument();
    expect(screen.getByText('No existing authorized document matched this upload.')).toBeInTheDocument();
  });

  it('renders ranked matches, comparison, and records Continue as New without deleting anything', async () => {
    vi.mocked(documentService.suggestTitle).mockResolvedValueOnce({ suggestedTitle: 'Maintenance Memorandum 2026' } as any);
    vi.mocked(documentService.reviewDuplicate).mockResolvedValueOnce({ documentId: 'source', decision: 'CONTINUE_AS_NEW', reviewedAt: '2026-10-01', reviewedMatches: 2 });
    vi.mocked(documentService.uploadDocument).mockResolvedValueOnce({
      id: 'source', title: 'Maintenance Memorandum 2026', fileName: 'memo.pdf', status: 'PENDING_REVIEW', classificationLevel: 'INTERNAL',
      aiDetectedDocumentType: 'MEMORANDUM', versionNumber: 2, aiMetadataSuggestions: { documentNumber: 'HIRNA-014' },
      duplicateDetection: {
        confidence: 'HIGH_CONFIDENCE', status: 'HIGH_CONFIDENCE', checkedAt: '2026-10-01T00:00:00Z', detectorVersion: 'v1', contentCheck: 'COMPLETE',
        message: 'A high-confidence duplicate candidate requires review.',
        matches: [
          { documentId: 'match-1', title: 'Maintenance Memorandum Signed', fileName: 'signed.pdf', matchType: 'NEAR_DUPLICATE', confidence: 'HIGH_CONFIDENCE', textSimilarityPercent: 96, reasons: ['Substantially similar meaningful OCR content'], ocrExcerpt: 'Authorized OCR text.', versionNumber: 1 },
          { documentId: 'match-2', title: 'Maintenance Memorandum Draft', matchType: 'POSSIBLE_RELATED_DOCUMENT', confidence: 'POSSIBLE_DUPLICATE', textSimilarityPercent: 82, reasons: ['Similar meaningful OCR content'] },
        ],
      },
    } as any);
    render(<DocumentUploadPanel />);
    fireEvent.change(screen.getByLabelText(/File/i, { selector: 'input' }), { target: { files: [new File(['content'], 'memo.pdf', { type: 'application/pdf' })] } });
    await screen.findByDisplayValue('Maintenance Memorandum 2026');
    fireEvent.click(screen.getByRole('button', { name: /Upload & Analyze/i }));
    expect(await screen.findByText('Maintenance Memorandum Signed')).toBeInTheDocument();
    expect(screen.getByText('Maintenance Memorandum Draft')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Compare/i })[0]);
    expect(screen.getByText('Authorized OCR text.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue as New Document/i }));
    await waitFor(() => expect(documentService.reviewDuplicate).toHaveBeenCalledWith('source', 'CONTINUE_AS_NEW'));
    expect(await screen.findByText('Decision Recorded')).toBeInTheDocument();
  });
});
