import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { DocumentViewerError, documentArchiveService } from './documentArchiveService';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('./documentService', () => ({
  documentService: { downloadDocument: vi.fn() },
}));

const signedResponse = {
  data: {
    data: {
      signedUrl: 'https://storage.test/signed/document.pdf',
      expiresAt: '2026-10-02T03:00:00Z',
      contentType: 'application/pdf',
      fileName: 'document.pdf',
    },
  },
};

const pdfResponse = (body = '%PDF-1.7\n1 0 obj\n%%EOF') => new Response(body, {
  status: 200,
  headers: { 'Content-Type': 'application/pdf' },
});

describe('document archive PDF byte retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(signedResponse);
  });

  it('returns verified application/pdf bytes from the authorized signed URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pdfResponse()));
    const file = await documentArchiveService.getViewerFile('document-id', 'PDF');
    expect(file.contentType).toBe('application/pdf');
    expect(file.blob.type).toBe('application/pdf');
    expect(file.blob.size).toBeGreaterThan(5);
    expect(fetch).toHaveBeenCalledWith('https://storage.test/signed/document.pdf', expect.objectContaining({
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    }));
  });

  it('refreshes an expired signed URL once and then returns the PDF', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('expired', { status: 403 }))
      .mockResolvedValueOnce(pdfResponse('%PDF-1.7\nMULTI-PAGE-CONTENT\n%%EOF')));
    const file = await documentArchiveService.getViewerFile('document-id', 'PDF');
    expect(file.blob.type).toBe('application/pdf');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a missing stored object instead of producing a broken preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })));
    await expect(documentArchiveService.getViewerFile('document-id', 'PDF')).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND', status: 404,
    } satisfies Partial<DocumentViewerError>);
  });

  it('rejects JSON and non-PDF bytes even when the storage response is successful', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Unauthorized"}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(documentArchiveService.getViewerFile('document-id', 'PDF')).rejects.toMatchObject({
      code: 'INVALID_DOCUMENT_RESPONSE',
    } satisfies Partial<DocumentViewerError>);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not a pdf', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })));
    await expect(documentArchiveService.getViewerFile('document-id', 'PDF')).rejects.toMatchObject({
      code: 'INVALID_DOCUMENT_RESPONSE',
    } satisfies Partial<DocumentViewerError>);
  });

  it('preserves larger PDF payloads for the browser viewer', async () => {
    const largePdf = `%PDF-1.7\n${'x'.repeat(1024 * 1024)}\n%%EOF`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pdfResponse(largePdf)));
    const file = await documentArchiveService.getViewerFile('document-id', 'PDF');
    expect(file.blob.size).toBe(largePdf.length);
  });
});
