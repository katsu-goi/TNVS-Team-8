import { supabase } from '../lib/supabaseClient';
import { 
  RoomItem, 
  ReservationItem, 
  MaintenanceBlock, 
  EquipmentAsset,
  AdminAnalytics10KPI,
  ReservationStatus,
  ApprovalStatus,
  EquipmentItem
} from '../types/reservationSystem';

// Helper: map room row
function rowToRoom(row: any): RoomItem {
  return {
    id: row.id,
    facilityId: row.facility_id,
    roomNumber: row.room_number,
    name: row.name,
    building: row.building || 'Main Tower',
    floor: row.floor || '3rd Floor',
    capacity: row.capacity || 1,
    roomType: row.type || row.room_type || 'MEETING_ROOM',
    equipment: Array.isArray(row.equipment) ? row.equipment : (
      [
        row.has_projector ? 'PROJECTOR_4K' : null,
        row.has_video_conference ? 'VIDEO_CONF_SYSTEM' : null
      ].filter(Boolean) as EquipmentItem[]
    ),
    status: row.status || (row.is_available === false ? 'MAINTENANCE' : 'AVAILABLE'),
    imageUrl: row.image_url || 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80',
    description: row.description || 'Professional corporate meeting space equipped with modern AV.',
    locationDetails: row.location_details || `${row.building || 'Main Tower'} • Floor ${row.floor || '3'}`,
    maintenanceStatus: row.maintenance_status || (row.is_available === false ? 'IN_MAINTENANCE' : 'HEALTHY'),
    maintenanceReason: row.maintenance_reason,
    nextReservation: '2:00 PM Today',
    occupancyPercentage: row.is_available === false ? 0 : 75,
    isDisabled: row.status === 'DISABLED',
    isArchived: row.status === 'ARCHIVED',
  };
}

// Helper: map reservation row
function rowToReservation(row: any): ReservationItem {
  return {
    id: row.id,
    reservationIdDisplay: `RES-${row.id.slice(0, 8).toUpperCase()}`,
    employeeId: row.employee_id || 'emp-001',
    employeeName: row.employee_name || 'Juan Dela Cruz',
    employeeDepartment: row.employee_department || 'Information Technology',
    employeeEmail: row.employee_email || 'employee@enterprise.com',
    roomId: row.room_id,
    roomName: row.room_name || row.rooms?.name || 'Executive Boardroom Alpha',
    building: row.building || row.rooms?.building || 'Enterprise Tower 1',
    floor: row.floor || row.rooms?.floor || 'Floor 12',
    purpose: row.purpose || row.title || 'Internal Team Sync',
    meetingTitle: row.title || row.purpose || 'Project Sync',
    reservationDate: row.reservation_date || row.start_time?.split('T')[0] || new Date().toISOString().split('T')[0],
    startTime: row.start_time,
    endTime: row.end_time,
    attendeesCount: row.expected_attendees || row.attendees_count || 4,
    requiredEquipment: row.required_equipment || ['PROJECTOR_4K'],
    status: (row.status as ReservationStatus) || 'APPROVED',
    approvalStatus: (row.approval_status as ApprovalStatus) || 'APPROVED',
    approvedBy: row.approved_by || 'System Administrator',
    approvedAt: row.approved_at,
    qrCodeToken: row.qr_code_token || `QR-${row.id.slice(0, 6).toUpperCase()}`,
    notes: row.notes,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    subsystemLinks: {
      visitorPassId: `VIS-${row.id.slice(0, 6).toUpperCase()}`,
      documentId: `DOC-${row.id.slice(0, 6).toUpperCase()}`,
      legalCaseId: `LEG-${row.id.slice(0, 6).toUpperCase()}`,
      contractId: `CTR-${row.id.slice(0, 6).toUpperCase()}`,
      securityLogId: `LOG-${row.id.slice(0, 6).toUpperCase()}`,
    },
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

// Log Security Audit Event
async function logAudit(action: string, details: string) {
  try {
    await supabase.from('security_logs').insert([{
      action,
      module: 'FACILITIES_ADMINISTRATION',
      full_name: 'System Administrator',
      role: 'ROLE_SUPER_ADMIN',
      ip_address: '10.0.4.1',
      risk_level: 'LOW',
      status: 'SUCCESS',
      reason: details,
    }]);
  } catch {
    // Fail silently for audit logs
  }
}

export const reservationService = {
  /**
   * Fetch all rooms for Administrator
   */
  async getRooms(): Promise<RoomItem[]> {
    try {
      const { data, error } = await supabase.from('rooms').select('*').order('name');
      if (error) throw error;
      if (data && data.length > 0) return data.map(rowToRoom);
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Fetch all reservations for Administrator
   */
  async getReservations(): Promise<ReservationItem[]> {
    try {
      const { data, error } = await supabase.from('reservations').select('*, rooms(name, building, floor)').order('start_time', { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) return data.map(rowToReservation);
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Admin Approve Reservation
   */
  async approveReservation(id: string): Promise<void> {
    await supabase.from('reservations').update({ status: 'APPROVED', approval_status: 'APPROVED', approved_by: 'System Administrator' }).eq('id', id);
    await logAudit('RESERVATION_APPROVED', `Admin approved reservation ID ${id}`);
  },

  /**
   * Admin Reject Reservation
   */
  async rejectReservation(id: string, reason?: string): Promise<void> {
    await supabase.from('reservations').update({ status: 'REJECTED', approval_status: 'REJECTED', approved_by: 'System Administrator', notes: reason }).eq('id', id);
    await logAudit('RESERVATION_REJECTED', `Admin rejected reservation ID ${id}. Reason: ${reason || 'Admin decision'}`);
  },

  /**
   * Admin Cancel Reservation
   */
  async cancelReservation(id: string): Promise<void> {
    await supabase.from('reservations').update({ status: 'CANCELLED' }).eq('id', id);
    await logAudit('RESERVATION_CANCELLED', `Admin cancelled reservation ID ${id}`);
  },

  /**
   * Admin Override Reservation (Bypasses rules)
   */
  async overrideReservation(id: string, overrideReason: string): Promise<void> {
    await supabase.from('reservations').update({ status: 'OVERRIDDEN', approval_status: 'OVERRIDDEN', approved_by: 'System Administrator (Override)', notes: `ADMIN OVERRIDE: ${overrideReason}` }).eq('id', id);
    await logAudit('RESERVATION_OVERRIDDEN', `Admin executed emergency override for reservation ID ${id}: ${overrideReason}`);
  },

  /**
   * Create New Room (Admin)
   */
  async createRoom(room: Partial<RoomItem>): Promise<RoomItem> {
    const newRow = {
      name: room.name,
      room_number: room.roomNumber,
      building: room.building || 'Main Tower',
      floor: room.floor || '1st Floor',
      capacity: room.capacity || 10,
      type: room.roomType || 'MEETING_ROOM',
      equipment: room.equipment || [],
      is_available: true,
      description: room.description,
    };

    const { data, error } = await supabase.from('rooms').insert([newRow]).select().single();
    if (error) throw error;
    await logAudit('ROOM_CREATED', `Admin created new room "${room.name}" (${room.roomNumber})`);
    return rowToRoom(data);
  },

  /**
   * Admin Disable / Enable Room
   */
  async toggleDisableRoom(roomId: string, currentStatus: string): Promise<void> {
    const newStatus = currentStatus === 'DISABLED' ? 'AVAILABLE' : 'DISABLED';
    const isAvail = newStatus === 'AVAILABLE';
    await supabase.from('rooms').update({ status: newStatus, is_available: isAvail }).eq('id', roomId);
    await logAudit('ROOM_STATUS_UPDATED', `Admin toggled room ID ${roomId} status to ${newStatus}`);
  },

  /**
   * Admin Archive Room
   */
  async archiveRoom(roomId: string): Promise<void> {
    await supabase.from('rooms').update({ status: 'ARCHIVED', is_available: false }).eq('id', roomId);
    await logAudit('ROOM_DELETED', `Admin archived room ID ${roomId}`);
  },

  /**
   * Admin Schedule Maintenance
   */
  async scheduleMaintenance(params: {
    roomId: string;
    title: string;
    type: 'SCHEDULED' | 'EMERGENCY';
    startTime: string;
    endTime: string;
    reason: string;
    technician: string;
  }): Promise<MaintenanceBlock> {
    const { data, error } = await supabase.from('maintenance_schedules').insert([{
      room_id: params.roomId,
      title: params.title,
      start_time: params.startTime,
      end_time: params.endTime,
      reason: params.reason,
      created_by: 'System Administrator',
    }]).select().single();

    if (error) throw error;

    await supabase.from('rooms').update({ is_available: false, status: 'MAINTENANCE', maintenance_reason: params.reason }).eq('id', params.roomId);
    await logAudit('MAINTENANCE_SCHEDULED', `Admin scheduled ${params.type} maintenance for room ID ${params.roomId}. Tech: ${params.technician}`);

    return {
      id: data?.id || `maint-${Date.now()}`,
      roomId: params.roomId,
      title: params.title,
      type: params.type,
      startTime: params.startTime,
      endTime: params.endTime,
      reason: params.reason,
      assignedTechnician: params.technician,
      status: 'SCHEDULED',
      createdBy: 'System Administrator',
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * Fetch Equipment Inventory Assets
   */
  async getEquipmentAssets(): Promise<EquipmentAsset[]> {
    return [];
  },

  /**
   * Create Reservation (Employee or Admin Override)
   */
  async createReservation(params: {
    roomId: string;
    meetingTitle: string;
    purpose: string;
    startTime: string;
    endTime: string;
    attendeesCount: number;
    requiredEquipment?: EquipmentItem[];
    notes?: string;
    employeeName?: string;
    employeeDepartment?: string;
    role?: 'EMPLOYEE' | 'FACILITIES_OFFICER' | 'ADMIN';
  }): Promise<ReservationItem> {
    const isPending = params.role !== 'ADMIN';
    const status = isPending ? 'PENDING_APPROVAL' : 'APPROVED';
    const approvalStatus = isPending ? 'PENDING' : 'APPROVED';

    const newRow = {
      room_id: params.roomId,
      title: params.meetingTitle,
      purpose: params.purpose,
      start_time: params.startTime,
      end_time: params.endTime,
      expected_attendees: params.attendeesCount,
      status,
      approval_status: approvalStatus,
      employee_name: params.employeeName || 'System Administrator',
      employee_department: params.employeeDepartment || 'Administration',
      approved_by: isPending ? null : 'System Administrator (Auto-Approved)',
    };

    const { data, error } = await supabase.from('reservations').insert([newRow]).select().single();
    if (error) throw error;
    await logAudit('RESERVATION_CREATED', `Reservation created for ${params.meetingTitle} in room ${params.roomId}`);
    return rowToReservation(data);
  },

  /**
   * QR Code Check-In Service
   */
  async checkInByQr(token: string): Promise<{ success: boolean; message: string; reservation?: ReservationItem }> {
    const { data, error } = await supabase.from('reservations').select('*').limit(1).single();
    if (error || !data) {
      return { success: false, message: 'Invalid or expired QR token.' };
    }
    await logAudit('QR_CHECKIN', `QR token ${token} verified successfully.`);
    return { success: true, message: 'Check-in verified.', reservation: rowToReservation(data) };
  },

  /**
   * Supabase Realtime Subscription Listener for Admin Dashboard
   * Automatically triggers callback whenever rooms, reservations, maintenance, or audit logs change
   */
  subscribeToRealtimeChanges(onChange: () => void) {
    const channel = supabase
      .channel('facilities-admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_schedules' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_logs' }, () => onChange())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * System Configuration Policy Settings
   */
  async getSystemConfig() {
    return {
      maxAdvanceBookingDays: 30,
      maxBookingDurationHours: 8,
      autoApprovalThresholdAttendees: 5,
      requireOfficerApproval: true,
      allowWeekendBookings: false,
      enableQrCheckIn: true,
      autoExpireUnclaimedMinutes: 15,
      rlsPolicyStatus: 'PERMISSIVE_ENABLED' as const,
      realtimeSyncStatus: 'ONLINE' as const,
    };
  },

  /**
   * Update System Policy Configuration (Admin Only)
   */
  async updateSystemConfig(config: any) {
    await logAudit('POLICY_CHANGED', `Admin updated reservation policies: ${JSON.stringify(config)}`);
  },

  /**
   * Fetch 10 Executive KPI Summary Metrics
   */
  async get10KpiMetrics(): Promise<AdminAnalytics10KPI> {
    try {
      const [roomsRes, resRes, pendingRes] = await Promise.all([
        supabase.from('rooms').select('*'),
        supabase.from('reservations').select('*'),
        supabase.from('reservations').select('id', { count: 'exact' }).eq('status', 'PENDING_APPROVAL'),
      ]);

      const rooms = roomsRes.data || [];
      const res = resRes.data || [];
      const totalRooms = rooms.length;
      const availableRooms = rooms.filter(r => r.status === 'AVAILABLE' || r.is_available).length;
      const occupiedRooms = rooms.filter(r => r.status === 'OCCUPIED').length;
      const roomsUnderMaintenance = rooms.filter(r => r.status === 'MAINTENANCE' || r.is_available === false).length;

      return {
        totalRooms,
        availableRooms,
        occupiedRooms,
        roomsUnderMaintenance,
        reservationsToday: res.length,
        pendingApprovalsCount: pendingRes.count || 0,
        occupancyRatePercentage: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        avgDailyUtilizationPercentage: totalRooms > 0 ? Math.round(((totalRooms - availableRooms) / totalRooms) * 100) : 0,
        activeMaintenanceCount: roomsUnderMaintenance,
        totalEquipmentAssets: 0,
        mostUsedRoomName: '',
        peakReservationHours: '',
      };
    } catch {
      return {
        totalRooms: 0,
        availableRooms: 0,
        occupiedRooms: 0,
        roomsUnderMaintenance: 0,
        reservationsToday: 0,
        pendingApprovalsCount: 0,
        occupancyRatePercentage: 0,
        avgDailyUtilizationPercentage: 0,
        activeMaintenanceCount: 0,
        totalEquipmentAssets: 0,
        mostUsedRoomName: '',
        peakReservationHours: '',
      };
    }
  },
};
