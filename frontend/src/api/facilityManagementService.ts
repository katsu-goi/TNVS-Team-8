import { apiClient } from './client';
import type { FacilityType, RoomType } from '../contracts/facilityTypes';

export const FACILITY_FLOORPLAN_BUCKET = 'facility-floorplans';

export type ManagedFacility = {
  id: string;
  name: string;
  facilityName: string;
  code: string | null;
  type: string | null;
  description: string | null;
  capacity: number;
  amenities: string[];
  status: string;
  active: boolean;
  floorPlanUrl: string | null;
  floorPlanFileName: string | null;
  floorPlanSize: number | null;
  spaceCount: number;
  activeSpaceCount: number;
  activeCapacity: number;
  activeReservationCount: number;
  createdAt: string;
  updatedAt: string | null;
};

export type FacilityInput = {
  facilityName: string;
  code: string;
  type: FacilityType;
  description?: string;
  capacity: number;
  amenities: string[];
  status: string;
  active: boolean;
};

export type FacilitySpace = {
  id: string;
  facilityId: string;
  name: string;
  roomNumber: string;
  building: string | null;
  floor: string | null;
  floorNumber: number | null;
  capacity: number;
  type: string | null;
  status: string;
  description: string | null;
  active: boolean;
};

export type FacilitySpaceInput = Omit<FacilitySpace, 'id' | 'facilityId' | 'type'> & { type: RoomType };
export type WorkspaceRecord = Record<string, unknown> & { id: string };

export type FacilityPin = {
  id: string;
  facilityId: string;
  x: number;
  y: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacilityPinInput = {
  facilityId: string;
  x: number;
  y: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapFacility(row: Record<string, unknown>): ManagedFacility {
  return {
    id: String(row.id),
    name: String(row.name ?? row.facility_name ?? 'Unnamed facility'),
    facilityName: String(row.facility_name ?? row.name ?? 'Unnamed facility'),
    code: typeof row.code === 'string' ? row.code : null,
    type: typeof row.type === 'string' ? row.type : null,
    description: typeof row.description === 'string' ? row.description : null,
    capacity: Number(row.capacity ?? row.total_capacity ?? 0),
    amenities: strings(row.amenities_json),
    status: String(row.status ?? (row.active === false ? 'INACTIVE' : 'AVAILABLE')),
    active: row.active !== false,
    floorPlanUrl: typeof row.floor_plan_url === 'string' ? row.floor_plan_url : null,
    floorPlanFileName: typeof row.floor_plan_file_name === 'string' ? row.floor_plan_file_name : null,
    floorPlanSize: row.floor_plan_size == null ? null : Number(row.floor_plan_size),
    spaceCount: Number(row.space_count ?? 0),
    activeSpaceCount: Number(row.active_space_count ?? 0),
    activeCapacity: Number(row.active_capacity ?? 0),
    activeReservationCount: Number(row.active_reservation_count ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? null : String(row.updated_at),
  };
}

function facilityPayload(input: FacilityInput) {
  return {
    facility_name: input.facilityName.trim(),
    code: input.code.trim(),
    type: input.type,
    description: input.description?.trim() || null,
    capacity: input.capacity,
    amenities_json: input.amenities,
    status: input.status,
    active: input.active,
  };
}

function mapSpace(row: Record<string, unknown>): FacilitySpace {
  return {
    id: String(row.id),
    facilityId: String(row.facility_id),
    name: String(row.name ?? ''),
    roomNumber: String(row.room_number ?? ''),
    building: typeof row.building === 'string' ? row.building : null,
    floor: typeof row.floor === 'string' ? row.floor : null,
    floorNumber: row.floor_number == null ? null : Number(row.floor_number),
    capacity: Number(row.capacity ?? 0),
    type: typeof row.type === 'string' ? row.type : null,
    status: String(row.status ?? 'AVAILABLE'),
    description: typeof row.description === 'string' ? row.description : null,
    active: row.active !== false,
  };
}

function spacePayload(input: FacilitySpaceInput) {
  return {
    name: input.name.trim(), room_number: input.roomNumber.trim(), building: input.building,
    floor: input.floor, floor_number: input.floorNumber, capacity: input.capacity, type: input.type,
    status: input.status, description: input.description, active: input.active,
  };
}

function mapPin(row: Record<string, unknown>): FacilityPin {
  return {
    id: String(row.id), facilityId: String(row.facility_id), x: Number(row.x), y: Number(row.y),
    title: String(row.title ?? ''), description: typeof row.description === 'string' ? row.description : null,
    imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
    createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
  };
}

const endpoint = '/facilities/management';
const records = (data: unknown): WorkspaceRecord[] => Array.isArray(data) ? data.map((row) => row as WorkspaceRecord) : [];

export const facilityManagementService = {
  async listFacilities(): Promise<ManagedFacility[]> {
    const { data } = await apiClient.get(endpoint);
    return (data.data ?? []).map(mapFacility);
  },
  async getFacility(id: string): Promise<ManagedFacility> {
    const { data } = await apiClient.get(`${endpoint}/${id}`);
    return mapFacility(data.data);
  },
  async createFacility(input: FacilityInput): Promise<ManagedFacility> {
    const { data } = await apiClient.post(endpoint, facilityPayload(input));
    return mapFacility(data.data);
  },
  async updateFacility(id: string, input: FacilityInput): Promise<ManagedFacility> {
    const { data } = await apiClient.patch(`${endpoint}/${id}`, facilityPayload(input));
    return mapFacility(data.data);
  },
  async setFacilityActive(id: string, active: boolean): Promise<ManagedFacility> {
    const { data } = await apiClient.post(`${endpoint}/${id}/status`, { active });
    return mapFacility(data.data);
  },
  async deactivateFacility(id: string): Promise<void> { await this.setFacilityActive(id, false); },
  async activateFacility(id: string): Promise<void> { await this.setFacilityActive(id, true); },
  async uploadFloorPlan(facilityId: string, file: File): Promise<ManagedFacility> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use a PNG, JPEG, or WebP image.');
    if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('Floor plan images must be non-empty and 5 MB or smaller.');
    const form = new FormData(); form.append('file', file);
    const { data } = await apiClient.post(`${endpoint}/${facilityId}/floor-plan`, form, { headers: { 'Content-Type': undefined } });
    return mapFacility(data.data);
  },
  async removeFloorPlan(facilityId: string): Promise<void> { await apiClient.delete(`${endpoint}/${facilityId}/floor-plan`); },
  async listSpaces(facilityId: string): Promise<FacilitySpace[]> {
    const { data } = await apiClient.get(`${endpoint}/${facilityId}/spaces`);
    return (data.data ?? []).map(mapSpace);
  },
  async createSpace(facilityId: string, input: FacilitySpaceInput): Promise<FacilitySpace> {
    const { data } = await apiClient.post(`${endpoint}/${facilityId}/spaces`, spacePayload(input));
    return mapSpace(data.data);
  },
  async updateSpace(facilityId: string, spaceId: string, input: FacilitySpaceInput): Promise<FacilitySpace> {
    const { data } = await apiClient.patch(`${endpoint}/${facilityId}/spaces/${spaceId}`, spacePayload(input));
    return mapSpace(data.data);
  },
  async listReservations(facilityId: string, status = 'ALL'): Promise<WorkspaceRecord[]> {
    const { data } = await apiClient.get(`${endpoint}/${facilityId}/reservations`, { params: { status } });
    return records(data.data);
  },
  async listAssets(facilityId: string): Promise<WorkspaceRecord[]> {
    const { data } = await apiClient.get(`${endpoint}/${facilityId}/assets`); return records(data.data);
  },
  async listMaintenance(facilityId: string): Promise<WorkspaceRecord[]> {
    const { data } = await apiClient.get(`${endpoint}/${facilityId}/maintenance`); return records(data.data);
  },
  async listActivity(facilityId: string): Promise<WorkspaceRecord[]> {
    const { data } = await apiClient.get(`${endpoint}/${facilityId}/activity`); return records(data.data);
  },
  async listPins(facilityId: string): Promise<FacilityPin[]> {
    const { data } = await apiClient.get(`${endpoint}/${facilityId}/pins`);
    return (data.data ?? []).map(mapPin);
  },
  async createPin(input: FacilityPinInput): Promise<FacilityPin> {
    const { data } = await apiClient.post(`${endpoint}/${input.facilityId}/pins`, input);
    return mapPin(data.data);
  },
  async updatePin(facilityId: string, id: string, input: Omit<FacilityPinInput, 'facilityId'>): Promise<FacilityPin> {
    const { data } = await apiClient.patch(`${endpoint}/${facilityId}/pins/${id}`, input);
    return mapPin(data.data);
  },
  async deletePin(facilityId: string, id: string): Promise<void> { await apiClient.delete(`${endpoint}/${facilityId}/pins/${id}`); },
};
