import { apiClient } from './client';

export const FACILITY_FLOORPLAN_BUCKET = 'facility-floorplans';

export type ManagedFacility = {
  id: string;
  name: string;
  facilityName: string;
  code: string | null;
  type: string | null;
  capacity: number;
  amenities: string[];
  status: string;
  active: boolean;
  floorPlanUrl: string | null;
  createdAt: string;
};

export type FacilityInput = {
  facilityName: string;
  code: string;
  type: string;
  capacity: number;
  amenities: string[];
  status: string;
  active: boolean;
  floorPlanUrl?: string | null;
};

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


function parseAmenities(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function mapFacility(row: Record<string, unknown>): ManagedFacility {
  return {
    id: String(row.id),
    name: String(row.name ?? row.facility_name ?? 'Unnamed facility'),
    facilityName: String(row.facility_name ?? row.name ?? 'Unnamed facility'),
    code: typeof row.code === 'string' ? row.code : null,
    type: typeof row.type === 'string' ? row.type : null,
    capacity: Number(row.capacity ?? row.total_capacity ?? 0),
    amenities: parseAmenities(row.amenities_json),
    status: String(row.status ?? (row.active === false ? 'INACTIVE' : 'AVAILABLE')),
    active: row.active !== false,
    floorPlanUrl: typeof row.floor_plan_url === 'string' ? row.floor_plan_url : null,
    createdAt: String(row.created_at ?? ''),
  };
}

function toDatabasePayload(input: FacilityInput) {
  return {
    name: input.facilityName.trim(),
    facility_name: input.facilityName.trim(),
    code: input.code.trim() || null,
    type: input.type.trim() || null,
    capacity: input.capacity,
    amenities_json: input.amenities,
    status: input.status,
    active: input.active,
    ...(input.floorPlanUrl !== undefined ? { floor_plan_url: input.floorPlanUrl } : {}),
  };
}

function mapPin(row: Record<string, unknown>): FacilityPin {
  return {
    id: String(row.id),
    facilityId: String(row.facility_id),
    x: Number(row.x),
    y: Number(row.y),
    title: String(row.title ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

const endpoint = '/facilities/management';
export const facilityManagementService = {
  async listFacilities(): Promise<ManagedFacility[]> {
    const { data } = await apiClient.get(endpoint);
    return (data.data ?? []).map(mapFacility);
  },
  async createFacility(input: FacilityInput): Promise<ManagedFacility> {
    const { data } = await apiClient.post(endpoint, toDatabasePayload(input));
    return mapFacility(data.data);
  },
  async updateFacility(id: string, input: FacilityInput): Promise<ManagedFacility> {
    const { data } = await apiClient.put(endpoint + '/' + id, toDatabasePayload(input));
    return mapFacility(data.data);
  },
  async deactivateFacility(id: string): Promise<void> {
    await apiClient.post(endpoint + '/' + id + '/status', { active: false });
  },
  async activateFacility(id: string): Promise<void> {
    await apiClient.post(endpoint + '/' + id + '/status', { active: true });
  },
  async uploadFloorPlan(facilityId: string, file: File): Promise<string> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Use a PNG, JPEG, or WebP image.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Floor plan images must be 5 MB or smaller.');
    const form = new FormData(); form.append('file', file);
    const { data } = await apiClient.post(endpoint + '/' + facilityId + '/floor-plan', form, { headers: { 'Content-Type': undefined } });
    return data.data.url;
  },
  async listPins(facilityId: string): Promise<FacilityPin[]> {
    const { data } = await apiClient.get(endpoint + '/' + facilityId + '/pins');
    return (data.data ?? []).map(mapPin);
  },
  async createPin(input: FacilityPinInput): Promise<FacilityPin> {
    const { data } = await apiClient.post(endpoint + '/' + input.facilityId + '/pins', input);
    return mapPin(data.data);
  },
  async updatePin(id: string, input: Omit<FacilityPinInput, 'facilityId'>): Promise<FacilityPin> {
    const { data } = await apiClient.put(endpoint + '/pins/' + id, input);
    return mapPin(data.data);
  },
  async deletePin(id: string): Promise<void> { await apiClient.delete(endpoint + '/pins/' + id); },
};
