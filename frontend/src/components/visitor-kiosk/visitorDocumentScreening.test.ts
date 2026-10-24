import { describe, expect, it } from 'vitest';
import { classifyIdentityDocument } from './visitorDocumentScreening';

const accepted = [
  'Philippine Passport', "Philippine Driver's License", 'PRC Professional Identification Card',
  'Company-Issued Employee ID', 'Postal ID',
];

describe('visitor document screening', () => {
  it.each([
    ['Philippine Passport', 'REPUBLIC OF THE PHILIPPINES\nPASSPORT\nSURNAME DELA CRUZ\nGIVEN NAMES JUAN'],
    ["Philippine Driver's License", "REPUBLIC OF THE PHILIPPINES LAND TRANSPORTATION OFFICE\nDRIVER'S LICENSE\nLICENSE NO N01-23-456789"],
    ['PRC Professional Identification Card', 'PROFESSIONAL REGULATION COMMISSION\nPROFESSIONAL IDENTIFICATION CARD\nREGISTRATION NO 1234567'],
    ['Company-Issued Employee ID', 'HIRNA MOBILITY SOLUTIONS INC\nEMPLOYEE ID 12345\nDEPARTMENT OPERATIONS'],
    ['Postal ID', 'PHILIPPINE POSTAL CORPORATION\nPOSTAL IDENTITY CARD\nADDRESS MANILA'],
  ])('classifies supported %s using multiple document signals', (type, text) => {
    const result = classifyIdentityDocument(text, type, accepted, 82);
    expect(result.classification).toBe('SUPPORTED_ID_TYPE');
    expect(result.detectedIdType).toBe(type);
  });

  it.each([
    ['Visa', 'VISA DEBIT\n4111 1111 1111 1111\nVALID THRU 12/30\nCARDHOLDER'],
    ['Mastercard', 'MASTERCARD CREDIT\n5555 5555 5555 4444\nVALID THRU 11/29\nCARDHOLDER'],
  ])('rejects a %s payment card and returns no extracted card data', (_label, text) => {
    const result = classifyIdentityDocument(text, 'Company-Issued Employee ID', accepted, 90);
    expect(result.classification).toBe('PAYMENT_CARD_DETECTED');
    expect(result.extracted.idNumberLast4).toBe('');
    expect(result.extracted.expirationDate).toBe('');
  });

  it('does not reject a document from a single ambiguous keyword', () => {
    const result = classifyIdentityDocument('VISA APPLICATION RECEIPT', 'Postal ID', accepted, 70);
    expect(result.classification).toBe('INCONCLUSIVE');
  });

  it('requires the selected type to match the detected type', () => {
    const result = classifyIdentityDocument(
      'REPUBLIC OF THE PHILIPPINES\nPASSPORT\nSURNAME SANTOS\nGIVEN NAMES ANA',
      "Philippine Driver's License", accepted, 85,
    );
    expect(result.classification).toBe('INCONCLUSIVE');
    expect(result.warnings.join(' ')).toMatch(/does not match/i);
  });

  it('treats unreadable OCR as inconclusive instead of fake', () => {
    const result = classifyIdentityDocument('A B C', 'Postal ID', accepted, 9);
    expect(result.classification).toBe('INCONCLUSIVE');
    expect(result.warnings.join(' ')).not.toMatch(/fake|fraud/i);
  });
});
