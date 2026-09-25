import { describe, expect, it } from 'vitest';
import {
  FACILITY_TYPE_OPTIONS,
  ROOM_TYPE_OPTIONS,
  parseFacilityType,
  parseRoomType,
} from './facilityTypes';

describe('facility and room type contract', () => {
  it('keeps site types separate from room and space types', () => {
    expect(FACILITY_TYPE_OPTIONS.map(({ value }) => value)).toEqual(expect.arrayContaining([
      'HEADQUARTERS', 'OPERATIONS_HUB', 'OFFICE', 'DRIVER_SUPPORT_HUB',
    ]));
    expect(FACILITY_TYPE_OPTIONS.map(({ value }) => value)).not.toContain('MEETING_ROOM');
    expect(ROOM_TYPE_OPTIONS.map(({ value }) => value)).toContain('MEETING_ROOM');
    expect(ROOM_TYPE_OPTIONS.map(({ value }) => value)).not.toContain('HEADQUARTERS');
  });

  it('normalizes canonical API values but rejects display labels and cross-level types', () => {
    expect(parseFacilityType(' headquarters ')).toBe('HEADQUARTERS');
    expect(parseFacilityType('Meeting Room')).toBeNull();
    expect(parseFacilityType('MEETING_ROOM')).toBeNull();
    expect(parseRoomType(' meeting_room ')).toBe('MEETING_ROOM');
    expect(parseRoomType('HEADQUARTERS')).toBeNull();
  });
});
