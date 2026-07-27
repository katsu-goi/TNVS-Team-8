import { supabase } from '../lib/supabaseClient';

export interface ApiFacility {
  id?: string;
  name: string;
  code?: string;
  type?: string;
  address?: string;
  city?: string;
  country?: string;
  totalCapacity?: number;
  active?: boolean;
}

export interface ApiRoom {
  id?: string;
  facilityId?: string;
  roomNumber: string;
  name: string;
  type?: string;
  capacity: number;
  hasProjector: boolean;
  hasVideoConference: boolean;
  hourlyRate: number;
}

export interface ApiReservation {
  id?: string;
  room?: { id: string };
  roomId?: string;
  title: string;
  startTime: string;
  endTime: string;
  status?: string;
  expectedAttendees: number;
  notes?: string;
}

export const facilityService = {
  getAllFacilities: async (): Promise<ApiFacility[]> => {
    const { data, error } = await supabase.from('facilities').select('*').order('name');
    if (error) {
      console.error('Error fetching facilities:', error);
      return [];
    }
    return (data || []).map(f => ({
      id: f.id,
      name: f.name,
      code: f.code,
      type: f.type,
      address: f.address,
      city: f.city,
      country: f.country,
      totalCapacity: f.total_capacity,
      active: f.active,
    }));
  },

  createFacility: async (facility: ApiFacility): Promise<ApiFacility> => {
    const { data, error } = await supabase.from('facilities').insert([{
      name: facility.name,
      code: facility.code || `FAC-${Date.now().toString().slice(-4)}`,
      type: facility.type || 'OFFICE',
      address: facility.address || '',
      city: facility.city || '',
      country: facility.country || '',
      total_capacity: facility.totalCapacity || 0,
      active: facility.active !== undefined ? facility.active : true,
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      type: data.type,
      address: data.address,
      city: data.city,
      country: data.country,
      totalCapacity: data.total_capacity,
      active: data.active,
    };
  },

  getRoomsByFacility: async (facilityId: string): Promise<ApiRoom[]> => {
    const { data, error } = await supabase.from('rooms').select('*').eq('facility_id', facilityId);
    if (error) {
      console.error('Error fetching rooms:', error);
      return [];
    }
    return (data || []).map(r => ({
      id: r.id,
      facilityId: r.facility_id,
      roomNumber: r.room_number,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      hasProjector: r.has_projector,
      hasVideoConference: r.has_video_conference,
      hourlyRate: Number(r.hourly_rate),
    }));
  },

  createRoom: async (room: ApiRoom): Promise<ApiRoom> => {
    const { data, error } = await supabase.from('rooms').insert([{
      facility_id: room.facilityId,
      room_number: room.roomNumber,
      name: room.name,
      type: room.type || 'MEETING_ROOM',
      capacity: room.capacity || 1,
      has_projector: room.hasProjector || false,
      has_video_conference: room.hasVideoConference || false,
      hourly_rate: room.hourlyRate || 0,
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      facilityId: data.facility_id,
      roomNumber: data.room_number,
      name: data.name,
      type: data.type,
      capacity: data.capacity,
      hasProjector: data.has_projector,
      hasVideoConference: data.has_video_conference,
      hourlyRate: Number(data.hourly_rate),
    };
  },

  getAllReservations: async (): Promise<ApiReservation[]> => {
    const { data, error } = await supabase.from('reservations').select('*, rooms(*)');
    if (error) {
      console.error('Error fetching reservations:', error);
      return [];
    }
    return (data || []).map(res => ({
      id: res.id,
      room: res.rooms ? { id: res.rooms.id } : (res.room_id ? { id: res.room_id } : undefined),
      roomId: res.room_id,
      title: res.title,
      startTime: res.start_time,
      endTime: res.end_time,
      status: res.status,
      expectedAttendees: res.expected_attendees,
      notes: res.notes,
    }));
  },

  createReservation: async (reservation: ApiReservation): Promise<ApiReservation> => {
    const roomId = reservation.room?.id || reservation.roomId;
    const { data, error } = await supabase.from('reservations').insert([{
      room_id: roomId,
      title: reservation.title,
      start_time: reservation.startTime,
      end_time: reservation.endTime,
      status: reservation.status || 'PENDING',
      expected_attendees: reservation.expectedAttendees || 1,
      notes: reservation.notes || '',
    }]).select().single();

    if (error) throw error;
    return {
      id: data.id,
      room: data.room_id ? { id: data.room_id } : undefined,
      roomId: data.room_id,
      title: data.title,
      startTime: data.start_time,
      endTime: data.end_time,
      status: data.status,
      expectedAttendees: data.expected_attendees,
      notes: data.notes,
    };
  },
};
