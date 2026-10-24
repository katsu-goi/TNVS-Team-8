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
    ['Philippine Passport', 'P<PHL DELA<CRUZ<<JUAN REPUBLIC PHILIPPINES SURNAME DELA CRUZ DATE OF BIRTH'],
    ["Philippine Driver's License", 'REPUBL1C PHILIPPINES LTO DR1VER S L1CENCE LICENSE NUMBER N01 23 456789 BLOOD TYPE O'],
    ['PRC Professional Identification Card', 'PRC PROFESSIONAL ID REGISTERED PROFESSIONAL REG1STRATION NUMBER 7654321 PROFESSION ENGINEER'],
    ['Company-Issued Employee ID', 'HIRNA MOBILITY INC STAFF ID HMI 2048 DIVISION OPERATIONS AUTHORIZED PERSONNEL'],
    ['Postal ID', 'PHLPOST POSTAL ID ADDRESS QUEZON CITY DATE OF BIRTH 01 01 1990 POSTAL REFERENCE'],
  ])('supports OCR noise and legitimate design variations for %s', (type, text) => {
    const result = classifyIdentityDocument(text, type, accepted, 48);
    expect(result.classification).toBe('SUPPORTED_ID_TYPE');
    expect(result.reason).toBe('CLASSIFIED');
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
    expect(result.ocrStatus).toBe('SUCCEEDED');
    expect(result.reason).toBe('UNREADABLE_TEXT');
    expect(result.warnings.join(' ')).not.toMatch(/fake|fraud/i);
  });

  it('distinguishes readable unknown documents from OCR engine failure', () => {
    const result = classifyIdentityDocument(
      'MEMBERSHIP REWARDS CLUB CUSTOMER NUMBER 12345 VALID THROUGH DECEMBER',
      'Postal ID', accepted, 84,
    );
    expect(result.ocrStatus).toBe('SUCCEEDED');
    expect(result.classification).toBe('INCONCLUSIVE');
    expect(result.reason).toBe('UNRECOGNIZED_DOCUMENT');
    expect(result.warnings.join(' ')).toMatch(/did not contain enough document-specific indicators/i);
  });

  it.each([
    [
      'Philippine Passport',
      'REPUBLIC OF THE PHILIPPINES\nDEPARTMENT OF FOREIGN AFFAIRS\nPASSPORT\nSURNAME\nDELA CRUZ\nGIVEN NAMES\nJUAN MIGUEL\nPASSPORT NO P1234567\nDATE OF EXPIRY\n23 OCT 2030',
      { fullName: 'JUAN MIGUEL DELA CRUZ', idNumberLast4: '4567', expirationDate: '2030-10-23', issuingAuthority: 'Department of Foreign Affairs' },
    ],
    [
      "Philippine Driver's License",
      "LAND TRANSPORTATION OFFICE\nDRIVER'S LICENSE\nLAST NAME: SANTOS\nFIRST NAME: ANA MARIE\nLICENSE NO: N01-23-456789\nEXPIRATION DATE: 2030-10-24\nBLOOD TYPE O",
      { fullName: 'ANA MARIE SANTOS', idNumberLast4: '6789', expirationDate: '2030-10-24', issuingAuthority: 'Land Transportation Office' },
    ],
    [
      'PRC Professional Identification Card',
      'PROFESSIONAL REGULATION COMMISSION\nPROFESSIONAL IDENTIFICATION CARD\nSURNAME REYES GIVEN NAMES MARIA LUZ\nREGISTRATION NO 7654321\nVALID UNTIL 24 OCTOBER 2030\nPROFESSION ENGINEER',
      { fullName: 'MARIA LUZ REYES', idNumberLast4: '4321', expirationDate: '2030-10-24', issuingAuthority: 'Professional Regulation Commission' },
    ],
    [
      'Company-Issued Employee ID',
      'HIRNA MOBILITY SOLUTIONS INC\nEMPLOYEE ID HIR-009876\nFULL NAME: CARLO MENDOZA\nDEPARTMENT OPERATIONS\nVALID UNTIL OCTOBER 24, 2030',
      { fullName: 'CARLO MENDOZA', idNumberLast4: '9876', expirationDate: '2030-10-24', issuingAuthority: 'HIRNA MOBILITY SOLUTIONS INC' },
    ],
    [
      'Postal ID',
      'PHLPOST\nPOSTAL IDENTITY CARD\nADDRESS MANILA\nAPELYIDO\nDELA CRUZ\nPANGALAN\nJUAN MIGUEL\nPOSTAL REFERENCE NO PRN-12345678\nVALID UNTIL\n24 OCTOBER 2030',
      { fullName: 'JUAN MIGUEL DELA CRUZ', idNumberLast4: '5678', expirationDate: '2030-10-24', issuingAuthority: 'PHLPost' },
    ],
  ])('extracts reviewable fields from a realistic %s OCR layout', (type, text, expected) => {
    const result = classifyIdentityDocument(text, type, accepted, 84);
    expect(result.classification).toBe('SUPPORTED_ID_TYPE');
    expect(result.extracted).toMatchObject(expected);
    expect(result.extracted.detectedIdType).toBe(type);
    expect(result.extractedFields).toEqual(expect.arrayContaining(Object.keys(result.extracted).filter((field) => result.extracted[field as keyof typeof result.extracted])));
  });

  it('preserves an ambiguous numeric expiration for visitor confirmation instead of guessing', () => {
    const result = classifyIdentityDocument(
      "LAND TRANSPORTATION OFFICE\nDRIVER'S LICENSE\nLICENSE NO N01-23-456789\nEXPIRATION DATE 04/05/2030\nBLOOD TYPE O",
      "Philippine Driver's License", accepted, 80,
    );
    expect(result.extracted.expirationDate).toBe('04/05/2030');
  });

  it('does not invent an issuing authority from an unmatched alternative', () => {
    const result = classifyIdentityDocument(
      'POSTAL IDENTITY CARD\nPHLPOST\nADDRESS MANILA\nPOSTAL REFERENCE NO 12345678',
      'Postal ID', accepted, 80,
    );
    expect(result.extracted.issuingAuthority).toBe('PHLPost');
  });
});
