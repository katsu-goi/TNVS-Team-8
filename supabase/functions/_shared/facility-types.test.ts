import {
  FACILITY_TYPE_OPTIONS,
  ROOM_TYPE_OPTIONS,
  parseFacilityType,
  parseRoomType,
} from "./facility-types.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

Deno.test("canonical facility types exclude room types", () => {
  assertEquals(FACILITY_TYPE_OPTIONS.some(({ value }) => value === "HEADQUARTERS"), true, "HEADQUARTERS is a facility type");
  assertEquals(FACILITY_TYPE_OPTIONS.some(({ value }) => (value as string) === "MEETING_ROOM"), false, "MEETING_ROOM is not a facility type");
  assertEquals(ROOM_TYPE_OPTIONS.some(({ value }) => value === "MEETING_ROOM"), true, "MEETING_ROOM is a room type");
});

Deno.test("parsers accept canonical values and reject cross-level values", () => {
  assertEquals(parseFacilityType(" headquarters "), "HEADQUARTERS", "facility normalization");
  assertEquals(parseFacilityType("Meeting Room"), null, "facility display label rejection");
  assertEquals(parseFacilityType("MEETING_ROOM"), null, "room type rejected as facility type");
  assertEquals(parseRoomType(" meeting_room "), "MEETING_ROOM", "room normalization");
  assertEquals(parseRoomType("HEADQUARTERS"), null, "facility type rejected as room type");
});
