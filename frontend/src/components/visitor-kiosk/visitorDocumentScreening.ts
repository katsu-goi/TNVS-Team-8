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

export type ExtractedIdField = keyof ExtractedIdInformation;

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
  /** Fields backed by recognizable OCR evidence; never inferred from selection alone. */
  extractedFields?: ExtractedIdField[];
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

const MONTHS: Record<string, number> = {
  JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4,
  MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9,
  SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11,
  DEC: 12, DECEMBER: 12,
};

const cleanLines = (rawText: string) => rawText.split(/\r?\n/)
  .map((line) => line.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

function labelledValue(lines: string[], label: RegExp, valid: (value: string) => boolean): string {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(label);
    if (!match || match.index === undefined) continue;
    const sameLine = lines[index].slice(match.index + match[0].length).replace(/^[\s:.,/-]+/, '').trim();
    if (valid(sameLine)) return sameLine;
    const nextLine = lines[index + 1]?.trim() ?? '';
    if (valid(nextLine)) return nextLine;
  }
  return '';
}

function normalizeDate(value: string): string {
  const cleaned = value.replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  const iso = cleaned.match(/\b(20\d{2}|19\d{2})[ /.-](\d{1,2})[ /.-](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const dayFirst = cleaned.match(/\b(\d{1,2})[\s./-]+([A-Z]{3,9})[\s,./-]+(20\d{2}|19\d{2})\b/i);
  const monthFirst = cleaned.match(/\b([A-Z]{3,9})[\s./-]+(\d{1,2})[\s,./-]+(20\d{2}|19\d{2})\b/i);
  const monthName = (dayFirst?.[2] ?? monthFirst?.[1] ?? '').toUpperCase();
  const month = MONTHS[monthName];
  if (month) {
    const day = Number(dayFirst?.[1] ?? monthFirst?.[2]);
    const year = dayFirst?.[3] ?? monthFirst?.[3];
    if (day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const numeric = cleaned.match(/\b(\d{1,2})[ /.-](\d{1,2})[ /.-](20\d{2}|19\d{2})\b/);
  if (!numeric) return '';
  const first = Number(numeric[1]); const second = Number(numeric[2]);
  if (first > 12 && second <= 12 && first <= 31) {
    return `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  }
  if (second > 12 && first <= 12 && second <= 31) {
    return `${numeric[3]}-${numeric[1].padStart(2, '0')}-${numeric[2].padStart(2, '0')}`;
  }
  // Preserve an ambiguous numeric date for visitor confirmation rather than guessing day/month order.
  return numeric[0];
}

function extractExpiration(rawText: string): string {
  const lines = cleanLines(rawText);
  const date = labelledValue(
    lines,
    /\b(?:EXPIR(?:Y|ATION)(?: DATE)?|DATE OF EXPIR(?:Y|ATION)|VALID(?:ITY)?(?: UNTIL| THRU| THROUGH| UP TO)?)\b/i,
    (value) => /(?:\d{1,2}[ /.-]\d{1,2}[ /.-]\d{2,4}|\d{4}[ /.-]\d{1,2}[ /.-]\d{1,2}|\d{1,2}[\s./-]+[A-Z]{3,9}[\s,./-]+\d{4}|[A-Z]{3,9}[\s./-]+\d{1,2}[\s,./-]+\d{4})/i.test(value),
  );
  return normalizeDate(date);
}

function extractLastFour(text: string): string {
  const labels = [
    /\bPASSPORT\s*(?:NO|NUMBER|#)\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
    /\b(?:DRIVER.?S\s+)?LICENSE\s*(?:NO|NUMBER|#)\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
    /\bREGISTRATION\s*(?:NO|NUMBER|#)\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
    /\bPOSTAL REFERENCE\s*(?:NO|NUMBER|#)?\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
    /\bPOSTAL ID\s*(?:NO|NUMBER|#)\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
    /\bPRN\s*(?:NO|NUMBER|#)?\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
    /\b(?:EMPLOYEE|STAFF|PERSONNEL)\s*(?:ID|NO|NUMBER|#)\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
    /\bID\s*(?:NO|NUMBER|#)\s*[:.-]?\s*([A-Z0-9-]{5,24})/i,
  ];
  const candidate = labels.map((pattern) => text.match(pattern)?.[1] ?? '')
    .find((value) => /\d/.test(value)) ?? '';
  return candidate.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase();
}

function extractName(rawText: string): string {
  const lines = cleanLines(rawText);
  const validName = (value: string) => {
    const normalizedValue = value.replace(/[^\p{L}' .-]/gu, ' ').replace(/\s+/g, ' ').trim();
    return normalizedValue.length >= 2 && normalizedValue.length <= 100
      && !/\d/.test(value)
      && !/^(?:SURNAME|LAST NAME|GIVEN NAMES?|FIRST NAME|MIDDLE NAME|APELYIDO|PANGALAN)$/i.test(normalizedValue)
      && !/(?:POSTAL|PASSPORT|LICENSE|IDENTIFICATION|REPUBLIC|PHILIPPINES|VALID|BIRTH|ADDRESS)/i.test(normalizedValue);
  };
  const cleanName = (value: string) => value.replace(/[^\p{L}' .-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const nameLabels = /\b(?:FULL NAME|NAME OF HOLDER|EMPLOYEE NAME|CARDHOLDER NAME|SURNAME|LAST NAME|APELYIDO|GIVEN NAMES?|FIRST NAME|PANGALAN|MIDDLE NAME|MIDDLE INITIAL|GITNANG (?:PANGALAN|APELYIDO))\b/i;
  const nameValue = (label: RegExp) => {
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(label);
      if (!match || match.index === undefined) continue;
      const remainder = lines[index].slice(match.index + match[0].length).replace(/^[\s:.,/-]+/, '');
      const sameLine = remainder.split(nameLabels)[0].trim();
      if (validName(sameLine)) return sameLine;
      const nextLine = lines[index + 1]?.split(nameLabels)[0].trim() ?? '';
      if (validName(nextLine)) return nextLine;
    }
    return '';
  };
  const fullName = nameValue(/^(?:FULL NAME|NAME OF HOLDER|EMPLOYEE NAME|CARDHOLDER NAME|NAME)\b/i);
  if (fullName) return cleanName(fullName).slice(0, 150);

  const surname = nameValue(/\b(?:SURNAME|LAST NAME|APELYIDO)\b/i);
  const given = nameValue(/\b(?:GIVEN NAMES?|FIRST NAME|PANGALAN)\b/i);
  const middle = nameValue(/\b(?:MIDDLE NAME|MIDDLE INITIAL|GITNANG (?:PANGALAN|APELYIDO))\b/i);
  if (surname && given) return cleanName(`${given}${middle ? ` ${middle}` : ''} ${surname}`).slice(0, 150);
  return '';
}

function detectedAuthority(rawText: string, rule?: IdRule): string {
  const text = normalize(rawText);
  if (/PHILIPPINE POSTAL CORPORATION/.test(text)) return 'Philippine Postal Corporation';
  if (/\bPHLPOST\b/.test(text)) return 'PHLPost';
  if (/LAND TRANSPORTATION OFFICE|\bLTO\b/.test(text)) return 'Land Transportation Office';
  if (/PROFESSIONAL REGULATION COMMISSION|\bPRC\b/.test(text)) return 'Professional Regulation Commission';
  if (/DEPARTMENT OF FOREIGN AFFAIRS|\bDFA\b/.test(text)) return 'Department of Foreign Affairs';

  const lines = cleanLines(rawText);
  const labelled = labelledValue(lines, /\b(?:ISSUED BY|ISSUING AUTHORITY|EMPLOYER|COMPANY)\b/i, (value) => (
    value.length >= 2 && value.length <= 120 && !/\d{5,}/.test(value)
  ));
  if (labelled) return labelled.slice(0, 120);
  if (rule?.canonical === 'Company-Issued Employee ID') {
    const organization = lines.find((line) => line.length <= 120 && /\b(?:INC|INCORPORATED|CORPORATION|COMPANY|LTD)\b/i.test(line));
    if (organization) return organization.slice(0, 120);
  }
  return '';
}

function extractedFields(extracted: ExtractedIdInformation): ExtractedIdField[] {
  return (Object.keys(extracted) as ExtractedIdField[]).filter((field) => Boolean(extracted[field]));
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
      extractedFields: [],
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
  const parsedExtracted: ExtractedIdInformation = {
    fullName: extractName(rawText),
    detectedIdType: acceptedType ?? '',
    idNumberLast4: extractLastFour(text),
    expirationDate: extractExpiration(rawText),
    issuingAuthority: detectedAuthority(rawText, best?.rule),
  };

  if (sufficientEvidence && !acceptedType) {
    return {
      ocrStatus: 'SUCCEEDED', classification: 'UNSUPPORTED_DOCUMENT', detectedIdType: best?.rule.canonical ?? null,
      extracted: emptyExtracted,
      warnings: ['The detected document category is not in the administrator-approved ID list.'],
      textQuality: confidence >= 60 ? 'HIGH' : confidence >= 35 ? 'MEDIUM' : 'LOW',
      reason: 'UNSUPPORTED_DOCUMENT',
      extractedFields: [],
    };
  }
  if (!sufficientEvidence) {
    const unreadable = confidence < minimumConfidence || readableLength < 18;
    return {
      ocrStatus: 'SUCCEEDED', classification: 'INCONCLUSIVE', detectedIdType: best?.score ? best.rule.canonical : null,
      extracted: parsedExtracted,
      warnings: [unreadable
        ? 'OCR completed, but too little readable text was recovered from the image.'
        : 'OCR completed, but the text did not contain enough document-specific indicators to identify the selected ID type.'],
      textQuality: confidence >= 60 ? 'HIGH' : confidence >= 35 ? 'MEDIUM' : 'LOW',
      reason: unreadable ? 'UNREADABLE_TEXT' : 'UNRECOGNIZED_DOCUMENT',
      extractedFields: extractedFields(parsedExtracted),
    };
  }
  if (!selectedMatches) warnings.push(`The selected ID type does not match the detected ${acceptedType}.`);
  if (confidence < 50) warnings.push('OCR quality is limited; verify every extracted value carefully.');

  return {
    ocrStatus: 'SUCCEEDED',
    classification: selectedMatches ? 'SUPPORTED_ID_TYPE' : 'INCONCLUSIVE',
    detectedIdType: acceptedType,
    extracted: parsedExtracted,
    warnings,
    textQuality: confidence >= 60 ? 'HIGH' : confidence >= 35 ? 'MEDIUM' : 'LOW',
    reason: selectedMatches ? 'CLASSIFIED' : 'DOCUMENT_TYPE_MISMATCH',
    extractedFields: extractedFields(parsedExtracted),
  };
}

export function failedDocumentScreening(
  message: string,
  reason: DocumentScreeningReason = 'ENGINE_UNAVAILABLE',
): DocumentScreeningResult {
  return {
    ocrStatus: 'FAILED', classification: 'INCONCLUSIVE', detectedIdType: null,
    extracted: { fullName: '', detectedIdType: '', idNumberLast4: '', expirationDate: '', issuingAuthority: '' },
    warnings: [message], textQuality: 'LOW', reason, extractedFields: [],
  };
}
