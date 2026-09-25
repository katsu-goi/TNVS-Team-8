import { supabase } from '../lib/supabase';

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

function getClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

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

export const facilityManagementService = {
  async listFacilities(): Promise<ManagedFacility[]> {
    const { data, error } = await getClient()
      .from('facilities')
      .select('id, name, facility_name, code, type, capacity, amenities_json, status, active, floor_plan_url, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => mapFacility(row));
  },

  async createFacility(input: FacilityInput): Promise<ManagedFacility> {
    const { data, error } = await getClient()
      .from('facilities')
      .insert(toDatabasePayload(input))
      .select('id, name, facility_name, code, type, capacity, amenities_json, status, active, floor_plan_url, created_at')
      .single();

    if (error) throw error;
    return mapFacility(data as Record<string, unknown>);
  },

  async updateFacility(id: string, input: FacilityInput): Promise<ManagedFacility> {
    const { data, error } = await getClient()
      .from('facilities')
      .update(toDatabasePayload(input))
      .eq('id', id)
      .select('id, name, facility_name, code, type, capacity, amenities_json, status, active, floor_plan_url, created_at')
      .single();

    if (error) throw error;
    return mapFacility(data as Record<string, unknown>);
  },

  async deactivateFacility(id: string): Promise<void> {
    const { error } = await getClient()
      .from('facilities')
      .update({ active: false, status: 'INACTIVE' })
      .eq('id', id);

    if (error) throw error;
  },

  async activateFacility(id: string): Promise<void> {
    const { error } = await getClient()
      .from('facilities')
      .update({ active: true, status: 'AVAILABLE' })
      .eq('id', id);

    if (error) throw error;
  },

  async uploadFloorPlan(facilityId: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Floor plan must be an image file.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Floor plan images must be 5 MB or smaller.');

    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.jpg';
    const path = `facilities/${facilityId}/${crypto.randomUUID()}${extension}`;
    const { error } = await getClient().storage.from(FACILITY_FLOORPLAN_BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

    if (error) throw error;
    return getClient().storage.from(FACILITY_FLOORPLAN_BUCKET).getPublicUrl(path).data.publicUrl;
  },

  async listPins(facilityId: string): Promise<FacilityPin[]> {
    const { data, error } = await getClient()
      .from('facility_pins')
      .select('id, facility_id, x, y, title, description, image_url, created_at, updated_at')
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => mapPin(row));
  },

  async createPin(input: FacilityPinInput): Promise<FacilityPin> {
    const { data, error } = await getClient()
      .from('facility_pins')
      .insert({
        facility_id: input.facilityId,
        x: input.x,
        y: input.y,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        image_url: input.imageUrl?.trim() || null,
      })
      .select('id, facility_id, x, y, title, description, image_url, created_at, updated_at')
      .single();

    if (error) throw error;
    return mapPin(data as Record<string, unknown>);
  },

  async updatePin(id: string, input: Omit<FacilityPinInput, 'facilityId'>): Promise<FacilityPin> {
    const { data, error } = await getClient()
      .from('facility_pins')
      .update({
        x: input.x,
        y: input.y,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        image_url: input.imageUrl?.trim() || null,
      })
      .eq('id', id)
      .select('id, facility_id, x, y, title, description, image_url, created_at, updated_at')
      .single();

    if (error) throw error;
    return mapPin(data as Record<string, unknown>);
  },

  async deletePin(id: string): Promise<void> {
    const { error } = await getClient().from('facility_pins').delete().eq('id', id);
    if (error) throw error;
  },
};
