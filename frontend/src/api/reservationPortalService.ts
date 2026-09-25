import { apiClient } from './client';

export type PortalFacility = {
  id: string;
  facilityName: string;
  code: string | null;
  capacity: number;
  amenities: string[];
  status: string;
  floorPlanUrl: string | null;
};

export type PortalReservation = {
  id: string;
  facilityId: string;
  facilityName: string;
  hostUserId: string;
  hostName: string;
  hostEmail: string | null;
  title: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  status: string;
  createdAt: string;
};

export type ReservationInviteeDetails = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
};

export type ReservationDetails = PortalReservation & {
  invitees: ReservationInviteeDetails[];
};

export type ReservationInvitation = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  check_in_status: boolean;
  qrPayload: string;
  magicLinkUrl?: string;
  magicLinkExpiresAt?: string;
  emailDelivery?: 'SENT' | 'SIMULATED' | 'FAILED';
};

export type CreateReservationResult = {
  reservation: {
    id: string;
    facilityId: string;
    facilityName: string;
    hostName: string;
    title: string;
    startTime: string;
    endTime: string;
    notes: string | null;
    status: string;
  };
  invitations: ReservationInvitation[];
  emailDelivery: 'SENT' | 'SIMULATED' | 'FAILED' | 'PARTIAL' | 'NO_INVITEES';
};

export const reservationPortalService = {
  async getFacilities(): Promise<PortalFacility[]> {
    const { data } = await apiClient.get('/reservation-portal/facilities');
    return data?.data ?? [];
  },

  async getReservations(params?: { date?: string; from?: string; to?: string }): Promise<PortalReservation[]> {
    const { data } = await apiClient.get('/reservation-portal/reservations', { params });
    return data?.data ?? [];
  },

  async getReservationDetails(id: string): Promise<ReservationDetails> {
    const { data } = await apiClient.get(`/reservation-portal/reservations/${id}`);
    return data?.data;
  },

  async getMyBookings(): Promise<PortalReservation[]> {
    const { data } = await apiClient.get('/reservation-portal/reservations', { params: { mine: 'true' } });
    return data?.data ?? [];
  },

  async createReservation(payload: {
    facilityId: string;
    title: string;
    startTime: string;
    endTime: string;
    notes?: string;
    inviteeEmails: string[];
  }): Promise<CreateReservationResult> {
    const { data } = await apiClient.post('/reservation-portal/reservations', payload);
    return data?.data;
  },

  async updateReservation(id: string, payload: { title: string; startTime: string; endTime: string; notes?: string }): Promise<PortalReservation> {
    const { data } = await apiClient.patch(`/reservation-portal/reservations/${id}`, payload);
    return data?.data;
  },

  async cancelReservation(id: string): Promise<void> {
    await apiClient.post(`/reservation-portal/reservations/${id}/cancel`);
  },

  async verifyPass(token: string) {
    const { data } = await apiClient.get('/reservation-portal/passes', { params: { token } });
    return data?.data;
  },

  async getGuestPass(token: string) {
    const { data } = await apiClient.get(`/reservation-portal/guest-pass/${encodeURIComponent(token)}`);
    return data?.data;
  },

  async checkInPass(token: string) {
    const { data } = await apiClient.post('/reservation-portal/passes/check-in', null, { params: { token } });
    return data?.data;
  },

  async checkOutPass(token: string) {
    const { data } = await apiClient.post('/reservation-portal/passes/check-out', null, { params: { token } });
    return data?.data;
  },
};
