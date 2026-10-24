export type DocumentClassification =
  | 'SUPPORTED_ID_TYPE'
  | 'UNSUPPORTED_DOCUMENT'
  | 'PAYMENT_CARD_DETECTED'
  | 'INCONCLUSIVE';

export type OcrStatus = 'NOT_STARTED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

export type DocumentScreeningReason =
  | 'CLASSIFIED'
  | 'PAYMENT_CARD'
  | 'UNSUPPORTED_DOCUMENT'
  | 'DOCUMENT_TYPE_MISMATCH'
  | 'UNRECOGNIZED_DOCUMENT'
  | 'UNREADABLE_TEXT'
  | 'IMAGE_TOO_SMALL'
  | 'IMAGE_BLURRY'
  | 'LOW_LIGHT'
  | 'OVEREXPOSED'
  | 'CORNERS_NOT_VISIBLE'
  | 'ENGINE_UNAVAILABLE';

export type ExtractedIdInformation = {
  fullName: string;
  detectedIdType: string;
  idNumberLast4: string;
  expirationDate: string;
  issuingAuthority: string;
};

export type DocumentScreeningResult = {
  ocrStatus: Exclude<OcrStatus, 'NOT_STARTED' | 'PROCESSING'>;
  classification: DocumentClassification;
  detectedIdType: string | null;
  extracted: ExtractedIdInformation;
  warnings: string[];
  /** A coarse OCR quality band, not an authenticity or identity score. */
  textQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Explains recovery without changing the security classification. */
  reason?: DocumentScreeningReason;
};

const normalize = (value: string) => value
  .normalize('NFKD')
  .replace(/[^A-Z0-9/ .,:-]/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const normalizeType = (value: string) => normalize(value).replace(/[^A-Z0-9]/g, '');

function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function hasPaymentCardNumber(text: string): boolean {
  const candidates = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some(luhnValid);
}

type IdRule = { canonical: string; indicators: RegExp[]; authorities: RegExp[] };

const ID_RULES: IdRule[] = [
  {
    canonical: 'Philippine Passport',
    indicators: [
      /\bPAS+P[O0]RT\b|\bP<PHL\b/,
      /\bPILIPINAS\b|\bPHILIPPINES\b|\bPHL\b/,
      /\bSURNAME\b|\bGIVEN NAMES?\b|\bNATIONALITY\b/,
      /\bDATE OF BIRTH\b|\bPLACE OF BIRTH\b|\bDATE OF ISSUE\b/,
    ],
    authorities: [/DEPARTMENT OF FOREIGN AFFAIRS|REPUBLIC OF (?:THE )?PHILIPPINES/],
  },
  {
    canonical: "Philippine Driver's License",
    indicators: [
      /DR[I1]VER.?S L[I1]CEN[SC]E|NON.?PROFESSIONAL|PROFESSIONAL DRIVER/,
      /\bL[I1]CEN[SC]E (?:NO|NUMBER)\b|\bDL C[O0]DES?\b/,
      /\bEXPIR(?:Y|ATION)(?: DATE)?\b|\bAGENCY C[O0]DE\b/,
      /\bBLOOD TYPE\b|\bRESTRICTIONS?\b|\bCONDITIONS?\b/,
    ],
    authorities: [/LAND TRANSPORTATION OFFICE|REPUBLIC OF (?:THE )?PHILIPPINES|\bLTO\b/],
  },
  {
    canonical: 'PRC Professional Identification Card',
    indicators: [
      /PROFESSIONAL (?:IDENTIFICATION CARD|REGULATION)|PROFESSIONAL ID/,
      /REG[I1]STRATION (?:NO|NUMBER|DATE)\b|REG[I1]STERED PROFESSIONAL/,
      /\bVALID UNTIL\b|\bDATE OF EXPIRY\b|\bEXPIRATION DATE\b/,
      /\bPROFESSION\b|\bBOARD OF\b/,
    ],
    authorities: [/PROFESSIONAL REGULATION COMMISSION|REPUBLIC OF (?:THE )?PHILIPPINES|\bPRC\b/],
  },
  {
    canonical: 'Company-Issued Employee ID',
    indicators: [
      /EMPLOYEE (?:ID|NO|NUMBER)|STAFF ID|PERSONNEL ID|ASSOCIATE ID|TEAM MEMBER ID/,
      /\bDEPARTMENT\b|\bPOSITION\b|\bJOB TITLE\b|\bDIVISION\b/,
      /\bCOMPANY\b|\bCORPORATION\b|\bINCORPORATED\b|\bINC\b|\bEMPLOYER\b/,
      /\bDATE HIRED\b|\bVALID UNTIL\b|\bEMPLOYMENT\b/,
    ],
    authorities: [/HUMAN RESOURCES|AUTHORIZED SIGNATURE|PROPERTY OF|AUTHORIZED PERSONNEL/],
  },
  {
    canonical: 'Postal ID',
    indicators: [
      /POSTAL (?:ID|IDENTITY CARD)|POSTAL I[D0]/,
      /\bADDRESS\b|\bDATE OF BIRTH\b|\bBIRTHDATE\b/,
      /POST OFFICE|POSTAL CORPORATION|\bPHLPOST\b/,
      /\bPOSTAL REFERENCE\b|\bPRN\b/,
    ],
    authorities: [/PHILIPPINE POSTAL CORPORATION|\bPHLPOST\b|REPUBLIC OF (?:THE )?PHILIPPINES/],
  },
];

function acceptedCanonicalType(canonical: string, accepted: readonly string[]): string | null {
  const canonicalNormalized = normalizeType(canonical);
  const aliases: Record<string, string[]> = {
    [normalizeType('Philippine Passport')]: ['PASSPORT'],
    [normalizeType("Philippine Driver's License")]: ['DRIVERSLICENSE', 'DRIVERLICENSE', 'LTO'],
    [normalizeType('PRC Professional Identification Card')]: ['PRC', 'PROFESSIONALIDENTIFICATIONCARD'],
    [normalizeType('Company-Issued Employee ID')]: ['COMPANYISSUEDEMPLOYEEID', 'COMPANYID', 'EMPLOYEEID'],
    [normalizeType('Postal ID')]: ['POSTALID'],
  };
  return accepted.find((value) => {
    const candidate = normalizeType(value);
    return candidate === canonicalNormalized || aliases[canonicalNormalized]?.some((alias) => candidate.includes(alias));
  }) ?? null;
}

function extractExpiration(text: string): string {
  const labelled = text.match(/(?:EXPIR(?:Y|ATION)|VALID UNTIL|VALID THRU)\s*(?:DATE)?\s*[:.-]?\s*((?:\d{1,2}[ /.-]){2}\d{2,4}|\d{4}[ /.-]\d{1,2}[ /.-]\d{1,2})/i);
  return labelled?.[1]?.trim() ?? '';
}

function extractLastFour(text: string): string {
  const labelled = text.match(/(?:PASSPORT|LICENSE|REGISTRATION|EMPLOYEE|POSTAL|ID)\s*(?:NO|NUMBER|#)?\s*[:.-]?\s*([A-Z0-9-]{5,24})/i);
  return labelled?.[1]?.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase() ?? '';
}

function extractName(rawText: string): string {
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const labelled = lines.find((line) => /^(?:FULL )?NAME\s*[:.-]/i.test(line));
  if (labelled) return labelled.replace(/^(?:FULL )?NAME\s*[:.-]\s*/i, '').slice(0, 150);
  const surname = lines.find((line) => /^SURNAME\s*[:.-]?\s+\S/i.test(line))?.replace(/^SURNAME\s*[:.-]?\s*/i, '');
  const given = lines.find((line) => /^GIVEN NAMES?\s*[:.-]?\s+\S/i.test(line))?.replace(/^GIVEN NAMES?\s*[:.-]?\s*/i, '');
  if (surname && given) return `${given} ${surname}`.slice(0, 150);
  return '';
}

function detectedAuthority(text: string, rule?: IdRule): string {
  const known = rule?.authorities.find((pattern) => pattern.test(text));
  return known?.source.replace(/\\b/g, '').split('|')[0].replace(/\\/g, '') ?? '';
}

export function classifyIdentityDocument(
  rawText: string,
  selectedIdType: string,
  acceptedIdTypes: readonly string[],
  confidence = 0,
): DocumentScreeningResult {
  const text = normalize(rawText);
  const warnings: string[] = [];
  const networkSignal = /\bV[I1]SA\b|\bMASTER\s?CARD\b|\bAMERICAN EXPRESS\b|\bUNIONPAY\b|\bMAESTRO\b|\bJCB\b/.test(text);
  const bankingSignal = /\bDEBIT\b|\bCREDIT\b|\bATM\b|\bCARDHOLDER\b|\bVALID THRU\b|\bCVV\b|\bCVC\b|\bBANK CARD\b/.test(text);
  const numberSignal = hasPaymentCardNumber(text);
  const paymentSignals = [networkSignal, bankingSignal, numberSignal].filter(Boolean).length;

  const emptyExtracted: ExtractedIdInformation = {
    fullName: '', detectedIdType: '', idNumberLast4: '', expirationDate: '', issuingAuthority: '',
  };
  if (paymentSignals >= 2) {
    return {
      ocrStatus: 'SUCCEEDED', classification: 'PAYMENT_CARD_DETECTED', detectedIdType: null,
      extracted: emptyExtracted,
      warnings: ['Payment-card signals were detected. The image and OCR text must be discarded.'],
      textQuality: confidence >= 60 ? 'HIGH' : confidence >= 35 ? 'MEDIUM' : 'LOW',
      reason: 'PAYMENT_CARD',
    };
  }

  const scored = ID_RULES.map((rule) => ({
    rule,
    indicatorHits: rule.indicators.filter((pattern) => pattern.test(text)).length,
    authorityHits: rule.authorities.filter((pattern) => pattern.test(text)).length,
  })).map((value) => ({ ...value, score: value.indicatorHits + Math.min(1, value.authorityHits) }));
  scored.sort((a, b) => b.score - a.score);
  const selectedRule = scored.find(({ rule }) => Boolean(acceptedCanonicalType(rule.canonical, [selectedIdType])));
  const best = selectedRule && selectedRule.score >= 2 && selectedRule.score >= (scored[0]?.score ?? 0) - 1
    ? selectedRule
    : scored[0];
  const acceptedType = best ? acceptedCanonicalType(best.rule.canonical, acceptedIdTypes) : null;
  const selectedMatches = best && normalizeType(selectedIdType) === normalizeType(acceptedType ?? best.rule.canonical)
    || Boolean(best && acceptedCanonicalType(best.rule.canonical, [selectedIdType]));
  const minimumConfidence = (best?.score ?? 0) >= 3 ? 12 : 22;
  const readableLength = text.replace(/[^A-Z0-9]/g, '').length;
  const sufficientEvidence = Boolean(best && best.score >= 2 && best.indicatorHits >= 1
    && confidence >= minimumConfidence && readableLength >= 18);

  if (sufficientEvidence && !acceptedType) {
    return {
      ocrStatus: 'SUCCEEDED', classification: 'UNSUPPORTED_DOCUMENT', detectedIdType: best?.rule.canonical ?? null,
      extracted: emptyExtracted,
      warnings: ['The detected document category is not in the administrator-approved ID list.'],
      textQuality: confidence >= 60 ? 'HIGH' : confidence >= 35 ? 'MEDIUM' : 'LOW',
      reason: 'UNSUPPORTED_DOCUMENT',
    };
  }
  if (!sufficientEvidence) {
    const unreadable = confidence < minimumConfidence || readableLength < 18;
    return {
      ocrStatus: 'SUCCEEDED', classification: 'INCONCLUSIVE', detectedIdType: best?.score ? best.rule.canonical : null,
      extracted: emptyExtracted,
      warnings: [unreadable
        ? 'OCR completed, but too little readable text was recovered from the image.'
        : 'OCR completed, but the text did not contain enough document-specific indicators to identify the selected ID type.'],
      textQuality: confidence >= 60 ? 'HIGH' : confidence >= 35 ? 'MEDIUM' : 'LOW',
      reason: unreadable ? 'UNREADABLE_TEXT' : 'UNRECOGNIZED_DOCUMENT',
    };
  }
  if (!selectedMatches) warnings.push(`The selected ID type does not match the detected ${acceptedType}.`);
  if (confidence < 50) warnings.push('OCR quality is limited; verify every extracted value carefully.');

  return {
    ocrStatus: 'SUCCEEDED',
    classification: selectedMatches ? 'SUPPORTED_ID_TYPE' : 'INCONCLUSIVE',
    detectedIdType: acceptedType,
    extracted: {
      fullName: extractName(rawText),
      detectedIdType: acceptedType ?? '',
      idNumberLast4: extractLastFour(text),
      expirationDate: extractExpiration(text),
      issuingAuthority: detectedAuthority(text, best.rule),
    },
    warnings,
    textQuality: confidence >= 60 ? 'HIGH' : confidence >= 35 ? 'MEDIUM' : 'LOW',
    reason: selectedMatches ? 'CLASSIFIED' : 'DOCUMENT_TYPE_MISMATCH',
  };
}

export function failedDocumentScreening(
  message: string,
  reason: DocumentScreeningReason = 'ENGINE_UNAVAILABLE',
): DocumentScreeningResult {
  return {
    ocrStatus: 'FAILED', classification: 'INCONCLUSIVE', detectedIdType: null,
    extracted: { fullName: '', detectedIdType: '', idNumberLast4: '', expirationDate: '', issuingAuthority: '' },
    warnings: [message], textQuality: 'LOW', reason,
  };
}
