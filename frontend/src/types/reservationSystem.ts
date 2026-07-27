export type UserRole = 'ADMIN';

export type RoomType = 
  | 'MEETING_ROOM'
  | 'CONFERENCE_ROOM'
  | 'BOARD_ROOM'
  | 'TRAINING_ROOM'
  | 'INTERVIEW_ROOM'
  | 'EVENT_HALL'
  | 'COLLABORATION_ROOM'
  | 'EXECUTIVE_SUITE';

export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'DISABLED' | 'ARCHIVED';

export type ReservationStatus = 
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'OVERRIDDEN';

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN';

export type EquipmentItem = 
  | 'PROJECTOR_4K'
  | 'TV_DISPLAY_85'
  | 'SMART_WHITEBOARD'
  | 'CONFERENCE_PHONE'
  | 'VIDEO_CONF_SYSTEM'
  | 'PODIUM_MIC'
  | 'HIGH_SPEED_WIFI'
  | 'CATERING_SETUP';

export interface EquipmentAsset {
  id: string;
  assetTag: string;
  name: string;
  category: 'Projector' | 'TV' | 'Whiteboard' | 'Conference Phone' | 'Video Conference' | 'Audio';
  assignedRoomId?: string;
  assignedRoomName?: string;
  status: 'AVAILABLE' | 'IN_USE' | 'UNDER_REPAIR' | 'DECOMMISSIONED';
  purchaseDate?: string;
  serialNumber?: string;
}

export interface RoomItem {
  id: string;
  facilityId?: string;
  roomNumber: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
  roomType: RoomType;
  equipment: EquipmentItem[];
  status: RoomStatus;
  imageUrl?: string;
  description?: string;
  locationDetails?: string;
  qrCode?: string;
  maintenanceStatus?: string;
  maintenanceReason?: string;
  nextReservation?: string;
  occupancyPercentage?: number;
  isDisabled?: boolean;
  isArchived?: boolean;
}

export interface SubsystemLinks {
  visitorPassId?: string;    // Subsystem 1: Visitor Pass & Security
  documentId?: string;       // Subsystem 2: AI Document Management
  legalCaseId?: string;      // Subsystem 3: Legal & Disputes
  contractId?: string;       // Subsystem 4: Contract Analytics AI
  securityLogId?: string;    // Subsystem 5: Security Center Audit Log
}

export interface ReservationItem {
  id: string;
  reservationIdDisplay?: string;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  employeeEmail?: string;
  roomId: string;
  roomName?: string;
  building?: string;
  floor?: string;
  purpose: string;
  meetingTitle: string;
  reservationDate: string; // YYYY-MM-DD
  startTime: string;      // HH:mm or ISO string
  endTime: string;        // HH:mm or ISO string
  attendeesCount: number;
  requiredEquipment: EquipmentItem[];
  status: ReservationStatus;
  approvalStatus: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  qrCodeToken?: string;
  notes?: string;
  checkInTime?: string;
  checkOutTime?: string;
  subsystemLinks?: SubsystemLinks;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceBlock {
  id: string;
  roomId: string;
  roomName?: string;
  title: string;
  type: 'SCHEDULED' | 'EMERGENCY';
  startTime: string;
  endTime: string;
  reason: string;
  assignedTechnician?: string;
  estimatedCompletion?: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdBy: string;
  createdAt: string;
}

export interface SystemConfigPolicy {
  maxAdvanceBookingDays: number;
  maxBookingDurationHours: number;
  autoApprovalThresholdAttendees: number;
  requireOfficerApproval: boolean;
  allowWeekendBookings: boolean;
  enableQrCheckIn: boolean;
  autoExpireUnclaimedMinutes: number;
  rlsPolicyStatus: 'PERMISSIVE_ENABLED' | 'STRICT_ENABLED';
  realtimeSyncStatus: 'ONLINE' | 'OFFLINE';
}

export interface AdminAnalytics10KPI {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  roomsUnderMaintenance: number;
  reservationsToday: number;
  pendingApprovalsCount: number;
  occupancyRatePercentage: number;
  avgDailyUtilizationPercentage: number;
  activeMaintenanceCount: number;
  totalEquipmentAssets: number;
  mostUsedRoomName: string;
  peakReservationHours: string;
}
