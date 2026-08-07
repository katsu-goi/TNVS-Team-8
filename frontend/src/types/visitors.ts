/**
 * Visitor verification and watchlist screening (Task 4).
 *
 * Mirrors the backend enums in
 * `module/visitor/domain/{IdType,VerificationStatus,WatchlistStatus}.java`
 * as string unions so no runtime enum objects are needed.
 */

export type IdType =
  | 'DRIVERS_LICENSE'
  | 'UMID'
  | 'PASSPORT'
  | 'NATIONAL_ID'
  | 'OTHER';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'ERROR';

export type WatchlistStatus = 'CLEAR' | 'FLAGGED';

export type WatchlistEntryStatus = 'ACTIVE' | 'INACTIVE';

/** Components the heuristic parser pulled out of the presented ID. */
export interface ExtractedIdFields {
  idType?: string;
  rawIdNumber?: string | null;
  normalizedIdNumber?: string;
  formatValid?: boolean;
  detectedFormat?: string;
  prefix?: string;
  serial?: string;
  visitorFullName?: string;
  visitorCompany?: string | null;
  source?: string;
  [key: string]: unknown;
}

export interface VisitorVerification {
  id: string;
  visitorId: string;
  idType: IdType | null;
  idNumber: string | null;
  extractedFields: ExtractedIdFields;
  /** 0.00-0.99. High score + FLAGGED means a confident watchlist hit. */
  matchScore: number | null;
  watchlistStatus: WatchlistStatus;
  verificationStatus: VerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  notes: string | null;
  createdAt: string | null;
}

export interface VisitorWatchlistEntry {
  id: string;
  fullName: string;
  idNumber: string | null;
  reason: string | null;
  status: WatchlistEntryStatus | string;
  createdAt: string | null;
}

export const ID_TYPES: IdType[] = [
  'DRIVERS_LICENSE',
  'UMID',
  'PASSPORT',
  'NATIONAL_ID',
  'OTHER',
];
