export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
}

export interface Facility {
  id: string;
  name: string;
  code: string;
  type: string;
  address: string;
  city: string;
  country: string;
  totalCapacity: number;
  active: boolean;
}

export interface Room {
  id: string;
  facilityId?: string;
  roomNumber: string;
  name: string;
  type?: string;
  capacity: number;
  hasProjector: boolean;
  hasVideoConference: boolean;
  hourlyRate: number;
  isAvailable?: boolean;
}

export interface Reservation {
  id: string;
  roomId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  expectedAttendees: number;
}

export interface Visitor {
  id: string;
  fullName: string;
  email: string;
  company: string;
  phone?: string;
  purposeOfVisit: string;
  expectedArrival: string;
  hostEmployeeId?: string;
  status: 'REGISTERED' | 'CHECKED_IN' | 'CHECKED_OUT';
  qrCodeToken: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  fileName: string;
  classificationLevel: string;
  status: string;
  aiPredictedCategory?: string;
  aiSummary?: string;
  ocrExtractedText?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

export interface LegalCaseItem {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
  priority: string;
  courtName: string;
  filedDate?: string;
  nextHearingDate?: string;
  leadCounselor?: string;
}

export interface ContractItem {
  id: string;
  contractNumber: string;
  title: string;
  type: string;
  counterParty: string;
  contractValue: number;
  status: string;
  aiAssessedRiskLevel?: string;
  aiRiskSummary?: string;
  startDate?: string;
  endDate?: string;
}
