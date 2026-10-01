import { describe, expect, it } from 'vitest';
import {
  detectDocumentDuplicates,
  fileSha256,
  isMeaningfulOcrText,
  normalizeIdentifier,
  normalizeOcrText,
  normalizedOcrSha256,
  ocrTextSimilarity,
  type DuplicateCandidate,
  type DuplicateDocumentSignal,
} from '../../../supabase/functions/_shared/document-duplicates.ts';

const baseText = `Document No. HIRNA-MEMO-2026-014 Preventive maintenance schedule for North Campus conference rooms.
The electrical inspection occurs monthly and the air conditioning service occurs quarterly.
Responsible team Facilities Operations. Effective date September 25 2026. Approved by Maria Santos.`;

const source = (overrides: Partial<DuplicateDocumentSignal> = {}): DuplicateDocumentSignal => ({
  fileSha256: 'a'.repeat(64), ocrNormalizedSha256: 'b'.repeat(64), ocrText: baseText,
  title: 'North Campus Preventive Maintenance Memorandum', documentNumber: 'HIRNA-MEMO-2026-014',
  documentType: 'MEMORANDUM', classificationLevel: 'INTERNAL', effectiveDate: '2026-09-25', versionNumber: 1,
  ...overrides,
});

const candidate = (overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  id: '11111111-1111-4111-8111-111111111111', fileName: 'memo.pdf', status: 'PENDING_REVIEW',
  createdAt: '2026-09-25T01:00:00Z', documentLocation: 'Authorized document repository',
  ...source(), ...overrides,
});

describe('deterministic document duplicate detector', () => {
  it('hashes the exact same file identically', async () => {
    expect(await fileSha256(new TextEncoder().encode('same bytes'))).toBe(await fileSha256(new TextEncoder().encode('same bytes')));
  });

  it('detects the same file even when the filename differs', () => {
    const result = detectDocumentDuplicates(source(), [candidate({ fileName: 'renamed-copy.pdf' })]);
    expect(result.matches[0].matchType).toBe('EXACT_FILE_DUPLICATE');
  });

  it('detects exact normalized OCR content when file bytes differ', () => {
    const result = detectDocumentDuplicates(source({ fileSha256: 'c'.repeat(64) }), [candidate({ fileSha256: 'd'.repeat(64) })]);
    expect(result.matches[0].matchType).toBe('EXACT_OCR_DUPLICATE');
  });

  it('normalizes Unicode, punctuation spacing, line breaks, and case deterministically', () => {
    expect(normalizeOcrText('  “MEMO”  No. :  14\nNorth—Campus  ')).toBe('"memo" no.:14 north-campus');
  });

  it('produces equal OCR hashes for normalization-only differences', async () => {
    expect(await normalizedOcrSha256(baseText.toUpperCase().replace(/ /g, '  '))).toBe(await normalizedOcrSha256(baseText));
  });

  it('detects near-identical meaningful OCR content', () => {
    const revised = baseText.replace('quarterly', 'every quarter').replace('Maria Santos', 'Maria L. Santos');
    const result = detectDocumentDuplicates(source({ fileSha256: 'c'.repeat(64), ocrNormalizedSha256: 'd'.repeat(64) }),
      [candidate({ fileSha256: 'e'.repeat(64), ocrNormalizedSha256: 'f'.repeat(64), ocrText: revised })]);
    expect(['NEAR_DUPLICATE', 'POSSIBLE_RELATED_DOCUMENT']).toContain(result.matches[0].matchType);
  });

  it('does not flag a materially different document', () => {
    const unrelated = 'Contract No. VEND-9916 Catering supplier price schedule for meals beverages delivery service invoices and payment terms at South Branch during fiscal year 2027.';
    const result = detectDocumentDuplicates(source({ fileSha256: 'c'.repeat(64), ocrNormalizedSha256: 'd'.repeat(64) }),
      [candidate({ fileSha256: 'e'.repeat(64), ocrNormalizedSha256: 'f'.repeat(64), ocrText: unrelated, title: 'Catering Price Contract', documentNumber: 'VEND-9916', documentType: 'CONTRACT' })]);
    expect(result.status).toBe('NO_DUPLICATE');
  });

  it('flags the same authoritative document number without rejecting the upload', () => {
    const result = detectDocumentDuplicates(source({ fileSha256: 'c'.repeat(64), ocrNormalizedSha256: 'd'.repeat(64), ocrText: null }),
      [candidate({ fileSha256: 'e'.repeat(64), ocrNormalizedSha256: 'f'.repeat(64), ocrText: null })]);
    expect(result.matches[0].matchType).toBe('POSSIBLE_DUPLICATE_DOCUMENT_NUMBER');
    expect(result.matches[0].confidence).toBe('POSSIBLE_DUPLICATE');
  });

  it('does not equate different document numbers', () => {
    expect(normalizeIdentifier('HIRNA-014')).not.toBe(normalizeIdentifier('HIRNA-015'));
  });

  it('classifies explicit version changes as a possible new version', () => {
    const result = detectDocumentDuplicates(source({ fileSha256: 'c'.repeat(64), ocrNormalizedSha256: 'd'.repeat(64), versionNumber: 2 }),
      [candidate({ fileSha256: 'e'.repeat(64), ocrNormalizedSha256: 'f'.repeat(64), versionNumber: 1 })]);
    expect(result.matches[0].matchType).toBe('POSSIBLE_NEW_VERSION');
  });

  it('ranks exact matches ahead of possible matches and keeps multiple candidates', () => {
    const possible = candidate({ id: '22222222-2222-4222-8222-222222222222', fileSha256: 'c'.repeat(64), ocrNormalizedSha256: 'd'.repeat(64), ocrText: null });
    const exact = candidate({ id: '33333333-3333-4333-8333-333333333333' });
    const result = detectDocumentDuplicates(source(), [possible, exact]);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].confidence).toBe('EXACT');
  });

  it('reports that content comparison did not run when OCR fails', () => {
    const result = detectDocumentDuplicates(source({ ocrText: null, ocrNormalizedSha256: null }), [], { ocrUnavailable: true });
    expect(result.contentCheck).toBe('NOT_RUN_OCR_UNAVAILABLE');
  });

  it('rejects very short OCR text as non-meaningful', () => {
    expect(isMeaningfulOcrText('Hirna Approved Date Signature')).toBe(false);
  });

  it('rejects poor OCR dominated by replacement characters', () => {
    expect(isMeaningfulOcrText(`${'�'.repeat(50)} contract maintenance reference north campus inspection schedule responsible team effective date`)).toBe(false);
  });

  it('does not flag generic boilerplate alone', () => {
    const generic = 'Hirna Facilities Department Approved Date Signature Document Page Form Office Management Administrative';
    const result = detectDocumentDuplicates(source({ fileSha256: 'c'.repeat(64), ocrNormalizedSha256: null, ocrText: generic, documentNumber: null }),
      [candidate({ fileSha256: 'd'.repeat(64), ocrNormalizedSha256: null, ocrText: generic, documentNumber: null, title: 'Other Record' })]);
    expect(result.status).toBe('NO_DUPLICATE');
  });

  it('returns a defined OCR similarity based on word-trigram Jaccard overlap', () => {
    const score = ocrTextSimilarity(baseText, baseText.replace('monthly', 'weekly'));
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0.7);
    expect(score!).toBeLessThan(1);
  });
});
