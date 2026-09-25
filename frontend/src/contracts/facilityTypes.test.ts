import { describe, expect, it } from 'vitest';
import {
  FACILITY_TYPE_OPTIONS,
  ROOM_TYPE_OPTIONS,
  parseFacilityType,
  parseRoomType,
} from './facilityTypes';

describe('facility and room type contract', () => {
  it('supports site and bookable facility types while preserving room-specific options', () => {
    expect(FACILITY_TYPE_OPTIONS.map(({ value }) => value)).toEqual(expect.arrayContaining([
      'HEADQUARTERS', 'OPERATIONS_HUB', 'OFFICE', 'DRIVER_SUPPORT_HUB',
    ]));
    expect(FACILITY_TYPE_OPTIONS.map(({ value }) => value)).toEqual(expect.arrayContaining([
      'MEETING_ROOM', 'DESK', 'CONFERENCE_HALL',
    ]));
    expect(ROOM_TYPE_OPTIONS.map(({ value }) => value)).toContain('MEETING_ROOM');
    expect(ROOM_TYPE_OPTIONS.map(({ value }) => value)).not.toContain('HEADQUARTERS');
  });

  it('normalizes canonical API values but rejects display labels and site-only room values', () => {
    expect(parseFacilityType(' headquarters ')).toBe('HEADQUARTERS');
    expect(parseFacilityType('Meeting Room')).toBeNull();
    expect(parseFacilityType('MEETING_ROOM')).toBe('MEETING_ROOM');
    expect(parseRoomType(' meeting_room ')).toBe('MEETING_ROOM');
    expect(parseRoomType('HEADQUARTERS')).toBeNull();
  });
});
