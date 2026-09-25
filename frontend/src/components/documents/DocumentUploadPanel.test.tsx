import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocumentUploadPanel from './DocumentUploadPanel';
import { documentService } from '../../api/documentService';

vi.mock('../../api/documentService', () => ({
  documentService: {
    suggestTitle: vi.fn(),
    uploadDocument: vi.fn(),
    downloadDocument: vi.fn(),
  },
  validateUploadFile: vi.fn(() => null),
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
});
