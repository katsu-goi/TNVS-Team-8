export const FACILITY_TYPE_OPTIONS = [
  { value: 'HEADQUARTERS', label: 'Headquarters' },
  { value: 'REGIONAL_OFFICE', label: 'Regional Office' },
  { value: 'OPERATIONS_HUB', label: 'Operations Hub' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'DRIVER_SUPPORT_HUB', label: 'Driver Support Hub' },
  { value: 'TRAINING_CENTER', label: 'Training Center' },
  { value: 'CUSTOMER_SUPPORT_CENTER', label: 'Customer Support Center' },
  { value: 'MAINTENANCE_DEPOT', label: 'Maintenance Depot' },
  { value: 'LOGISTICS_CENTER', label: 'Logistics Center' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const ROOM_TYPE_OPTIONS = [
  { value: 'MEETING_ROOM', label: 'Meeting Room' },
  { value: 'CONFERENCE_ROOM', label: 'Conference Room' },
  { value: 'BOARD_ROOM', label: 'Board Room' },
  { value: 'TRAINING_ROOM', label: 'Training Room' },
  { value: 'COLLABORATION_ROOM', label: 'Collaboration Room' },
  { value: 'OFFICE_ROOM', label: 'Office Room' },
  { value: 'WAITING_AREA', label: 'Waiting Area' },
  { value: 'MULTIPURPOSE_ROOM', label: 'Multipurpose Room' },
  { value: 'EVENT_HALL', label: 'Event Hall' },
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type FacilityType = (typeof FACILITY_TYPE_OPTIONS)[number]['value'];
export type RoomType = (typeof ROOM_TYPE_OPTIONS)[number]['value'];

const facilityTypes = new Set<string>(FACILITY_TYPE_OPTIONS.map(({ value }) => value));
const roomTypes = new Set<string>(ROOM_TYPE_OPTIONS.map(({ value }) => value));

export function parseFacilityType(value: unknown): FacilityType | null {
  const canonical = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return facilityTypes.has(canonical) ? canonical as FacilityType : null;
}

export function parseRoomType(value: unknown): RoomType | null {
  const canonical = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return roomTypes.has(canonical) ? canonical as RoomType : null;
}

export function isFacilityType(value: unknown): value is FacilityType {
  return typeof value === 'string' && facilityTypes.has(value);
}

export function isRoomType(value: unknown): value is RoomType {
  return typeof value === 'string' && roomTypes.has(value);
}
