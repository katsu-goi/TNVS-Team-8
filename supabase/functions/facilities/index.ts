import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";

const db = adminDb();

function notFound() {
  return new Response(null, { status: 404 });
}

function badRequest(message: string, errorCode: string) {
  return jsonResponse(fail(message, errorCode), 400);
}

function notFoundEnvelope(message: string) {
  return jsonResponse(fail(message, "RESOURCE_NOT_FOUND"), 404);
}

/** Interprets a naive LocalDateTime as UTC (matches Spring's naive persistence). */
function toUtcIso(s: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).toISOString();
  const naive = s.includes("T") ? s : `${s}T00:00:00`;
  return naive + "Z";
}

function dayStartIso(date: string): string {
  return `${date}T00:00:00Z`;
}

function dayEndIso(date: string): string {
  return `${date}T23:59:59.999Z`;
}

function localDatePart(iso: string): string {
  return (iso ?? "").slice(0, 10);
}

function timePart(iso: string): string {
  const t = (iso ?? "").split("T")[1] ?? "";
  return t.slice(0, 5);
}

function hhmm(s: string): string {
  if (!s) return "";
  return s.length === 5 ? `${s}:00` : s;
}

// ---------------------------------------------------------------------------
// Rooms / availability helpers
// ---------------------------------------------------------------------------

type RoomRow = {
  id: string;
  name: string | null;
  room_number: string | null;
  type: string | null;
  floor_number: number | null;
  building: string | null;
  capacity: number | null;
  open_time: string | null;
  close_time: string | null;
  status: string | null;
  has_projector: boolean | null;
  has_video_conference: boolean | null;
  has_whiteboard: boolean | null;
  active: boolean | null;
  facility_id: string | null;
  facilities?: { id: string; name: string | null; code: string | null; type: string | null } | { id: string; name: string | null; code: string | null; type: string | null }[] | null;
};

function facOf(r: RoomRow) {
  return Array.isArray(r.facilities) ? r.facilities[0] : r.facilities;
}

async function loadActiveRooms(): Promise<RoomRow[]> {
  const { data, error } = await db
    .from("rooms")
    .select("*, facilities(id, name, code, type)")
    .eq("active", true);
  if (error) throw new Error(`rooms load failed: ${error.message}`);
  return (data as unknown as RoomRow[]) ?? [];
}

async function loadAllRooms(): Promise<RoomRow[]> {
  const { data, error } = await db
    .from("rooms")
    .select("*, facilities(id, name, code, type)");
  if (error) throw new Error(`rooms load failed: ${error.message}`);
  return (data as unknown as RoomRow[]) ?? [];
}

async function loadAmenities(roomIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (roomIds.length === 0) return map;
  const { data, error } = await db.from("facility_amenities").select("room_id, name").in("room_id", roomIds);
  if (error) throw new Error(`amenities load failed: ${error.message}`);
  for (const a of (data as { room_id: string; name: string }[]) ?? []) {
    const list = map.get(a.room_id) ?? [];
    list.push(a.name);
    map.set(a.room_id, list);
  }
  return map;
}

async function hasMaintenanceOverlap(roomId: string, start: string, end: string): Promise<boolean> {
  const { data, error } = await db
    .from("maintenance_schedules")
    .select("id")
    .eq("room_id", roomId)
    .in("status", ["SCHEDULED", "IN_PROGRESS"])
    .lt("start_time", end)
    .gt("end_time", start)
    .limit(1);
  if (error) throw new Error(`maintenance lookup failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function conflictingReservations(roomId: string, start: string, end: string): Promise<ReservationRow[]> {
  const { data, error } = await db
    .from("reservations")
    .select("*")
    .eq("room_id", roomId)
    .notIn("status", ["CANCELLED", "REJECTED"])
    .lt("start_time", end)
    .gt("end_time", start);
  if (error) throw new Error(`conflict lookup failed: ${error.message}`);
  return (data as unknown as ReservationRow[]) ?? [];
}

type ReservationRow = {
  id: string;
  room_id: string | null;
  user_id: string | null;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  expected_attendees: number | null;
  status: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  rooms?: { id: string; name: string | null; room_number: string | null; floor_number: number | null; building: string | null; facility_id: string | null; facilities?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null } | null;
  users?: { id: string; employee_id: string | null; first_name: string | null; last_name: string | null; department: string | null; email: string | null } | { id: string; employee_id: string | null; first_name: string | null; last_name: string | null; department: string | null; email: string | null }[] | null;
};

async function loadReservationsWithJoins(roomIds?: string[]): Promise<ReservationRow[]> {
  let q = db
    .from("reservations")
    .select("*, rooms(name, room_number, floor_number, building, facility_id, facilities(name, code)), users(employee_id, first_name, last_name, department, email)");
  if (roomIds && roomIds.length > 0) q = q.in("room_id", roomIds);
  const { data, error } = await q;
  if (error) throw new Error(`reservations load failed: ${error.message}`);
  return (data as unknown as ReservationRow[]) ?? [];
}

function roomName(r: ReservationRow): string | null {
  return r.rooms?.name ?? null;
}

function roomNumber(r: ReservationRow): string | null {
  return r.rooms?.room_number ?? null;
}

function roomFloor(r: ReservationRow): number | null {
  return r.rooms?.floor_number ?? null;
}

function roomBuilding(r: ReservationRow): string | null {
  return r.rooms?.building ?? null;
}

function roomFacility(r: ReservationRow): { id: string; name: string | null; code: string | null } | null {
  const f = r.rooms?.facilities;
  return Array.isArray(f) ? f[0] ?? null : f ?? null;
}

function userOf(r: ReservationRow) {
  return Array.isArray(r.users) ? r.users[0] : r.users;
}

async function countReservationsByStatus(): Promise<Record<string, number>> {
  const { data, error } = await db.from("reservations").select("status");
  if (error) throw new Error(`reservations status load failed: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const r of (data as { status: string | null }[]) ?? []) {
    if (r.status) counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}

async function countByDateRange2(start: string, end: string): Promise<number> {
  const { count, error } = await db
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .gte("start_time", start)
    .lte("end_time", end);
  if (error) throw new Error(`reservations date-range count failed: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Facilities Manager
// ---------------------------------------------------------------------------

async function handleManagerKpi(_ctx: AuthContext | null, _req: Request) {
  const rooms = await loadAllRooms();
  const totalRooms = rooms.length;
  const availableRooms = rooms.filter((r) => r.active === true).length;
  const occupiedRooms = totalRooms - availableRooms;

  const today = new Date().toISOString().slice(0, 10);
  const statusCounts = await countReservationsByStatus();
  const todaysReservations = await countByDateRange2(dayStartIso(today), dayEndIso(today));

  const { count: totalAssets, error: aErr } = await db.from("equipment").select("id", { count: "exact", head: true });
  if (aErr) throw new Error(`equipment count failed: ${aErr.message}`);
  const { count: maintAssets, error: mErr } = await db.from("equipment").select("id", { count: "exact", head: true }).eq("status", "UNDER_MAINTENANCE");
  if (mErr) throw new Error(`equipment maint count failed: ${mErr.message}`);

  const utilizationRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

  return jsonResponse(ok({
    activeReservations: statusCounts["APPROVED"] ?? 0,
    pendingApprovals: statusCounts["PENDING"] ?? 0,
    availableRooms,
    occupiedRooms,
    maintenanceRooms: 0,
    totalAssets: totalAssets ?? 0,
    assetUtilizationRate: Math.round(utilizationRate * 10) / 10,
    todaysReservations,
  }), 200);
}

async function handleManagerReservations(_ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const roomId = url.searchParams.get("roomId");
  const userId = url.searchParams.get("userId");
  const building = url.searchParams.get("building");
  const floor = url.searchParams.get("floor");
  const date = url.searchParams.get("date");

  const all = await loadReservationsWithJoins();
  const filtered = all.filter((r) => {
    if (status && r.status !== status) return false;
    if (roomId && r.room_id !== roomId) return false;
    if (userId && r.user_id !== userId) return false;
    if (building && !(roomBuilding(r) && roomBuilding(r)!.toLowerCase() === building.toLowerCase())) return false;
    if (floor && roomFloor(r) !== Number.parseInt(floor, 10)) return false;
    if (date && localDatePart(r.start_time ?? "") !== date) return false;
    return true;
  });

  const reservations = filtered.map((r) => {
    const fac = roomFacility(r);
    const u = userOf(r);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status,
      expectedAttendees: r.expected_attendees,
      rejectionReason: r.rejection_reason,
      roomId: r.room_id,
      roomName: roomName(r),
      roomNumber: roomNumber(r),
      floorNumber: roomFloor(r),
      facilityName: fac?.name ?? null,
      facilityCode: fac?.code ?? null,
      employeeId: u?.employee_id ?? null,
      employeeName: u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null : null,
      employeeDepartment: u?.department ?? null,
      employeeEmail: u?.email ?? null,
      createdAt: r.created_at,
    };
  });

  const statusCounts = await countReservationsByStatus();
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEnd = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const overview = {
    pending: statusCounts["PENDING"] ?? 0,
    approved: statusCounts["APPROVED"] ?? 0,
    rejected: statusCounts["REJECTED"] ?? 0,
    cancelled: statusCounts["CANCELLED"] ?? 0,
    todaysReservations: await countByDateRange2(dayStartIso(today), dayEndIso(today)),
    upcomingReservations: await countByDateRange2(dayStartIso(today), dayEndIso(upcomingEnd)),
  };

  return jsonResponse(ok({ overview, reservations }), 200);
}

async function recordApproval(actorEmail: string, reservationId: string, decision: string, comments: string | null) {
  const { error } = await db.from("reservation_approvals").insert({
    reservation_id: reservationId,
    decision,
    comments,
    decided_at: new Date().toISOString(),
    created_by: actorEmail,
  });
  if (error) console.error("reservation_approval insert failed:", error.message);
}

async function handleApproveReservation(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const { data: r, error } = await db.from("reservations").select("*").eq("id", p.id).maybeSingle();
  if (error) throw new Error(`reservation lookup failed: ${error.message}`);
  if (!r) return notFound();
  const row = r as unknown as ReservationRow;

  const conflicts = await conflictingReservations(row.room_id!, row.start_time!, row.end_time!);
  const stillValid = conflicts.every((c) => c.id === row.id || c.status !== "APPROVED");
  if (!stillValid) {
    const { error: ue } = await db.from("reservations").update({
      status: "REJECTED",
      rejection_reason: "Another reservation for this room in the same timeframe was approved first.",
      updated_by: ctx!.email,
    }).eq("id", row.id);
    if (ue) throw new Error(`reservation update failed: ${ue.message}`);
    await recordApproval(ctx!.email, row.id, "REJECTED", null);
    return badRequest("Room was already approved for another booking in this timeframe. Reservation rejected.", "CONFLICT");
  }

  const { error: ue2 } = await db.from("reservations").update({
    status: "APPROVED",
    rejection_reason: null,
    updated_by: ctx!.email,
  }).eq("id", row.id);
  if (ue2) throw new Error(`reservation update failed: ${ue2.message}`);
  const comments = (body as Record<string, unknown> | null)?.comments != null ? String((body as Record<string, unknown>).comments) : null;
  await recordApproval(ctx!.email, row.id, "APPROVED", comments);

  return jsonResponse(ok({ id: row.id, status: "APPROVED" }), 200);
}

async function handleRejectReservation(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const { data: r, error } = await db.from("reservations").select("*").eq("id", p.id).maybeSingle();
  if (error) throw new Error(`reservation lookup failed: ${error.message}`);
  if (!r) return notFound();
  const row = r as unknown as ReservationRow;

  const b = (body as Record<string, unknown> | null) ?? {};
  const reason = b.reason != null ? String(b.reason) : "Rejected by facilities manager";
  const { error: ue } = await db.from("reservations").update({ status: "REJECTED", rejection_reason: reason, updated_by: ctx!.email }).eq("id", row.id);
  if (ue) throw new Error(`reservation update failed: ${ue.message}`);
  await recordApproval(ctx!.email, row.id, "REJECTED", b.reason != null ? String(b.reason) : null);

  return jsonResponse(ok({ id: row.id, status: "REJECTED" }), 200);
}

// --- Room management ---

async function handleRoomSummary(_ctx: AuthContext | null, _req: Request) {
  const rooms = await loadAllRooms();
  const total = rooms.length;
  const available = rooms.filter((r) => r.active === true).length;
  const occupied = total - available;
  return jsonResponse(ok({
    totalRooms: total,
    availableRooms: available,
    occupiedRooms: occupied,
    reservedRooms: occupied,
    maintenanceRooms: 0,
  }), 200);
}

async function handleListRooms(_ctx: AuthContext | null, _req: Request) {
  const rooms = await loadAllRooms();
  const amenityMap = await loadAmenities(rooms.map((r) => r.id));
  const items = rooms.map((r) => {
    const fac = facOf(r);
    return {
      id: r.id,
      name: r.name,
      roomNumber: r.room_number,
      floorNumber: r.floor_number,
      building: r.building,
      capacity: r.capacity,
      type: r.type,
      status: r.status,
      openTime: r.open_time,
      closeTime: r.close_time,
      active: r.active,
      hasProjector: r.has_projector,
      hasVideoConference: r.has_video_conference,
      hasWhiteboard: r.has_whiteboard,
      amenities: amenityMap.get(r.id) ?? [],
      facilityId: r.facility_id,
      facilityName: fac?.name ?? null,
      facilityCode: fac?.code ?? null,
      createdAt: (r as unknown as { created_at?: string }).created_at ?? null,
    };
  });
  return jsonResponse(ok(items), 200);
}

async function handleCreateRoom(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const facilityId = String(b.facilityId ?? "");
  const { data: facility, error: fe } = await db.from("facilities").select("id, name").eq("id", facilityId).maybeSingle();
  if (fe) throw new Error(`facility lookup failed: ${fe.message}`);
  if (!facility) return badRequest("Facility not found", "FACILITY_NOT_FOUND");

  const type = String(b.type ?? "");
  const { data: saved, error: insErr } = await db.from("rooms").insert({
    facility_id: facilityId,
    name: b.name != null ? String(b.name) : null,
    room_number: b.roomNumber != null ? String(b.roomNumber) : "",
    type,
    floor_number: b.floorNumber != null ? Number.parseInt(String(b.floorNumber), 10) : null,
    building: b.building != null ? String(b.building) : null,
    capacity: b.capacity != null ? Number.parseInt(String(b.capacity), 10) : null,
    open_time: b.openTime != null ? String(b.openTime) : null,
    close_time: b.closeTime != null ? String(b.closeTime) : null,
    status: b.status != null ? String(b.status) : "VACANT",
    has_projector: b.hasProjector != null && String(b.hasProjector).toLowerCase() === "true",
    has_video_conference: b.hasVideoConference != null && String(b.hasVideoConference).toLowerCase() === "true",
    has_whiteboard: b.hasWhiteboard != null && String(b.hasWhiteboard).toLowerCase() === "true",
    active: b.active == null || String(b.active).toLowerCase() === "true",
    created_by: ctx!.email,
  }).select("id, facility_id, name, room_number, floor_number, building, capacity, type, status, open_time, close_time, active").single();
  if (insErr) throw new Error(`room insert failed: ${insErr.message}`);

  if (Array.isArray(b.amenities)) {
    for (const a of b.amenities) {
      if (a == null) continue;
      await db.from("facility_amenities").insert({ room_id: (saved as { id: string }).id, name: String(a), created_by: ctx!.email });
    }
  }

  const amenityNames = Array.isArray(b.amenities) ? (b.amenities as unknown[]).filter((x) => x != null).map((x) => String(x)) : [];
  const result = {
    id: (saved as { id: string }).id,
    name: b.name ?? null,
    roomNumber: b.roomNumber ?? "",
    floorNumber: b.floorNumber != null ? Number.parseInt(String(b.floorNumber), 10) : null,
    building: b.building ?? null,
    capacity: b.capacity != null ? Number.parseInt(String(b.capacity), 10) : null,
    type: b.type,
    status: b.status ?? "VACANT",
    openTime: b.openTime ?? null,
    closeTime: b.closeTime ?? null,
    active: b.active == null || String(b.active).toLowerCase() === "true",
    facilityId,
    facilityName: (facility as { name: string }).name,
    amenities: amenityNames,
  };
  return jsonResponse(ok(result, "Room created successfully"), 200);
}

async function handleUpdateRoom(_ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const { data: room, error } = await db.from("rooms").select("*").eq("id", p.id).maybeSingle();
  if (error) throw new Error(`room lookup failed: ${error.message}`);
  if (!room) return notFound();
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  if (b.name != null) fields.name = String(b.name);
  if (b.roomNumber != null) fields.room_number = String(b.roomNumber);
  if (b.type != null) fields.type = String(b.type);
  if (b.floorNumber != null) fields.floor_number = Number.parseInt(String(b.floorNumber), 10);
  if (b.building != null) fields.building = String(b.building);
  if (b.capacity != null) fields.capacity = Number.parseInt(String(b.capacity), 10);
  if (b.openTime != null) fields.open_time = String(b.openTime);
  if (b.closeTime != null) fields.close_time = String(b.closeTime);
  if (b.status != null) fields.status = String(b.status);
  if (b.hasProjector != null) fields.has_projector = String(b.hasProjector).toLowerCase() === "true";
  if (b.hasVideoConference != null) fields.has_video_conference = String(b.hasVideoConference).toLowerCase() === "true";
  if (b.hasWhiteboard != null) fields.has_whiteboard = String(b.hasWhiteboard).toLowerCase() === "true";
  if (b.active != null) fields.active = String(b.active).toLowerCase() === "true";
  const { data: saved, error: ue } = await db.from("rooms").update(fields).eq("id", p.id).select("*").single();
  if (ue) throw new Error(`room update failed: ${ue.message}`);
  return jsonResponse(ok(saved, "Room updated successfully"), 200);
}

async function handleScheduleMaintenance(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const { data: room, error } = await db.from("rooms").select("*").eq("id", p.id).maybeSingle();
  if (error) throw new Error(`room lookup failed: ${error.message}`);
  if (!room) return notFound();
  const b = (body ?? {}) as Record<string, unknown>;
  const start = toUtcIso(String(b.startTime ?? ""));
  const end = toUtcIso(String(b.endTime ?? ""));

  const { data: saved, error: insErr } = await db.from("maintenance_schedules").insert({
    room_id: p.id,
    title: b.title != null ? String(b.title) : "Scheduled Maintenance",
    description: b.description != null ? String(b.description) : null,
    start_time: start,
    end_time: end,
    status: "SCHEDULED",
    assigned_to: b.assignedTo != null ? String(b.assignedTo) : null,
    notes: b.notes != null ? String(b.notes) : null,
    created_by: ctx!.email,
  }).select("*").single();
  if (insErr) throw new Error(`maintenance insert failed: ${insErr.message}`);

  if (b.markUnavailable == null || String(b.markUnavailable).toLowerCase() === "true") {
    await db.from("rooms").update({ status: "MAINTENANCE", updated_by: ctx!.email }).eq("id", p.id);
  }

  const result = {
    id: (saved as { id: string }).id,
    title: (saved as { title: string }).title,
    description: (saved as { description: string | null }).description,
    startTime: (saved as { start_time: string }).start_time,
    endTime: (saved as { end_time: string }).end_time,
    status: (saved as { status: string }).status,
    assignedTo: (saved as { assigned_to: string | null }).assigned_to,
    roomId: p.id,
    roomName: (room as { name: string }).name,
  };
  return jsonResponse(ok(result, "Maintenance scheduled successfully"), 200);
}

async function handleMaintenanceList(_ctx: AuthContext | null, _req: Request) {
  const { data, error } = await db
    .from("maintenance_schedules")
    .select("id, title, description, start_time, end_time, status, assigned_to, room_id, rooms(name)");
  if (error) throw new Error(`maintenance load failed: ${error.message}`);
  const items = ((data as unknown as {
    id: string; title: string; description: string | null; start_time: string; end_time: string;
    status: string | null; assigned_to: string | null; room_id: string | null;
    rooms?: { name: string | null } | { name: string | null }[] | null;
  }[]) ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    startTime: m.start_time,
    endTime: m.end_time,
    status: m.status,
    assignedTo: m.assigned_to,
    roomId: m.room_id,
    roomName: (Array.isArray(m.rooms) ? m.rooms[0] : m.rooms)?.name ?? null,
  }));
  return jsonResponse(ok(items), 200);
}

// --- Assets ---

async function loadAllEquipment(): Promise<{
  id: string; name: string | null; serial_number: string | null; category: string | null;
  status: string | null; last_maintenance_date: string | null; next_maintenance_date: string | null; room_id: string | null;
}[]> {
  const { data, error } = await db.from("equipment").select("id, name, serial_number, category, status, last_maintenance_date, next_maintenance_date, room_id");
  if (error) throw new Error(`equipment load failed: ${error.message}`);
  return (data as { id: string; name: string | null; serial_number: string | null; category: string | null; status: string | null; last_maintenance_date: string | null; next_maintenance_date: string | null; room_id: string | null }[]) ?? [];
}

async function handleAssetOverview(_ctx: AuthContext | null, _req: Request) {
  const all = await loadAllEquipment();
  const total = all.length;
  const activeCount = all.filter((e) => e.status === "AVAILABLE").length;
  const maintenanceCount = all.filter((e) => e.status === "UNDER_MAINTENANCE").length;
  const retiredCount = all.filter((e) => e.status === "DECOMMISSIONED").length;
  const categoryCount: Record<string, number> = {};
  for (const e of all) {
    if (e.category) categoryCount[e.category] = (categoryCount[e.category] ?? 0) + 1;
  }
  const utilRate = total > 0 ? (activeCount / total) * 100 : 0;
  return jsonResponse(ok({
    totalAssets: total,
    activeAssets: activeCount,
    maintenanceAssets: maintenanceCount,
    retiredAssets: retiredCount,
    categories: categoryCount,
    utilizationRate: Math.round(utilRate * 10) / 10,
  }), 200);
}

async function handleAssetList(_ctx: AuthContext | null, _req: Request) {
  const all = await loadAllEquipment();
  const roomIds = all.map((e) => e.room_id).filter((x): x is string => x != null);
  const { data: rooms, error } = roomIds.length > 0
    ? await db.from("rooms").select("id, name").in("id", roomIds)
    : { data: null as unknown, error: null };
  if (error) throw new Error(`rooms load failed: ${error.message}`);
  const roomMap = new Map<string, string>();
  for (const r of (rooms as { id: string; name: string }[]) ?? []) roomMap.set(r.id, r.name);
  const assets = all.map((e) => ({
    id: e.id,
    name: e.name,
    serialNumber: e.serial_number,
    category: e.category,
    status: e.status,
    lastMaintenanceDate: e.last_maintenance_date,
    nextMaintenanceDate: e.next_maintenance_date,
    roomId: e.room_id,
    roomName: e.room_id ? (roomMap.get(e.room_id) ?? null) : null,
  }));
  return jsonResponse(ok(assets), 200);
}

async function handleInventoryAlerts(_ctx: AuthContext | null, _req: Request) {
  const { data, error } = await db
    .from("hub_inventory_assets")
    .select("id, facility_id, sku, asset_name, category, current_stock, low_stock_threshold, unit, unit_price, supplier_name, status, facilities(name)")
    .eq("status", "CRITICAL_REORDER")
    .order("current_stock");
  if (error) throw new Error(`inventory alerts load failed: ${error.message}`);
  const alerts = ((data ?? []) as Array<Record<string, unknown>>).map((asset) => {
    const facility = Array.isArray(asset.facilities) ? asset.facilities[0] : asset.facilities;
    return {
      ...asset,
      hubName: (facility as Record<string, unknown> | null)?.name ?? "Unassigned hub",
      priority: "CRITICAL_REORDER",
    };
  });
  return jsonResponse(ok(alerts), 200);
}

async function handleInitiateReorder(ctx: AuthContext | null, _req: Request, body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const inventoryAssetId = typeof input.inventoryAssetId === "string" ? input.inventoryAssetId.trim() : "";
  const requestedQuantity = Number(input.requestedQuantity);
  const supplierName = typeof input.supplierName === "string" ? input.supplierName.trim() : "";
  if (!inventoryAssetId || !Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    return badRequest("inventoryAssetId and a positive whole requestedQuantity are required.", "VALIDATION_ERROR");
  }
  const { data: asset, error: assetError } = await db
    .from("hub_inventory_assets")
    .select("id, supplier_name")
    .eq("id", inventoryAssetId)
    .maybeSingle();
  if (assetError) throw new Error(`inventory asset lookup failed: ${assetError.message}`);
  if (!asset) return notFoundEnvelope("Inventory asset not found.");

  const { data: saved, error } = await db.from("facility_reorder_requests").insert({
    inventory_asset_id: inventoryAssetId,
    requested_by: ctx?.userId,
    supplier_name: supplierName || asset.supplier_name || null,
    requested_quantity: requestedQuantity,
    status: "PENDING_PROCUREMENT",
  }).select("*").single();
  if (error) {
    if (error.code === "23505") return badRequest("An active reorder request already exists for this asset.", "REORDER_ALREADY_PENDING");
    throw new Error(`reorder request creation failed: ${error.message}`);
  }
  return jsonResponse(ok(saved, "Procurement reorder request initiated."), 201);
}

async function handleRouteFacilityDocument(ctx: AuthContext | null, _req: Request, body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const documentId = typeof input.documentId === "string" ? input.documentId.trim() : "";
  const documentCategory = typeof input.documentCategory === "string" ? input.documentCategory.trim() : "";
  const permitNumber = typeof input.permitNumber === "string" ? input.permitNumber.trim() : null;
  const expiresOn = typeof input.expiresOn === "string" && input.expiresOn.trim() ? input.expiresOn.trim() : null;
  if (!documentId || !documentCategory) return badRequest("documentId and documentCategory are required.", "VALIDATION_ERROR");

  const { data: facility, error: facilityError } = await db
    .from("facilities")
    .select("id, name")
    .eq("is_deleted", false)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (facilityError) throw new Error(`facility lookup failed: ${facilityError.message}`);
  if (!facility) return notFoundEnvelope("No active TNVS hub is configured.");

  const isRegulatoryPermit = /permit|clearance|certificate|license|cpc|ltfrb/i.test(documentCategory);
  const reviewStatus = isRegulatoryPermit ? "PENDING_REVIEW" : "DRAFT";
  const record = {
    facility_id: facility.id,
    document_id: documentId,
    document_type: documentCategory,
    document_category: documentCategory,
    permit_number: permitNumber,
    expires_on: expiresOn,
    review_status: reviewStatus,
    submitted_by: ctx?.userId,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    routed_to_role: isRegulatoryPermit ? "COMPLIANCE_OFFICER" : null,
  };
  const existing = await db.from("facility_compliance_documents").select("id").eq("document_id", documentId).maybeSingle();
  if (existing.error) throw new Error(`facility document lookup failed: ${existing.error.message}`);
  const savedResult = existing.data
    ? await db.from("facility_compliance_documents").update(record).eq("id", existing.data.id).select("*").single()
    : await db.from("facility_compliance_documents").insert(record).select("*").single();
  if (savedResult.error) throw new Error(`facility document routing failed: ${savedResult.error.message}`);

  if (isRegulatoryPermit) {
    const { data: complianceOfficer, error: officerError } = await db
      .from("users")
      .select("id")
      .eq("email", "co@photonicomega.com")
      .eq("is_deleted", false)
      .maybeSingle();
    if (officerError) throw new Error(`compliance officer lookup failed: ${officerError.message}`);
    if (complianceOfficer) {
      const { error: notificationError } = await db.from("employee_notifications").insert({
        recipient_id: complianceOfficer.id,
        title: `Permit routed for review: ${documentCategory}`,
        message: `${facility.name ?? "TNVS hub"} has a new regulatory document awaiting Compliance Officer review.`,
        type: "FACILITY_PERMIT_REVIEW",
        related_entity_type: "FacilityComplianceDocument",
        related_entity_id: savedResult.data.id,
        is_read: false,
        created_by: ctx?.email ?? "SYSTEM",
      });
      if (notificationError) throw new Error(`permit notification failed: ${notificationError.message}`);
    }
  }
  return jsonResponse(ok({ ...savedResult.data, routed: isRegulatoryPermit, hubName: facility.name }), 201);
}

// --- Calendar / analytics / reports ---

async function handleCalendar(_ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const year = url.searchParams.get("year");
  const month = url.searchParams.get("month");
  const now = new Date();
  const y = year ? Number.parseInt(year, 10) : now.getUTCFullYear();
  const m = year && month ? Number.parseInt(month, 10) - 1 : now.getUTCMonth();
  const startDate = new Date(Date.UTC(y, m, 1));
  const endDate = new Date(Date.UTC(y, m + 1, 0));
  const startIso = startDate.toISOString().slice(0, 10);
  const endIso = endDate.toISOString().slice(0, 10);

  const { data: reservations, error: re } = await db
    .from("reservations")
    .select("*, rooms(name), users(first_name, last_name)")
    .gte("start_time", dayStartIso(startIso))
    .lte("start_time", dayEndIso(endIso));
  if (re) throw new Error(`reservations load failed: ${re.message}`);

  const events: Record<string, unknown>[] = ((reservations as unknown as {
    id: string; title: string | null; start_time: string; end_time: string; status: string | null;
    rooms?: { name: string | null } | { name: string | null }[] | null;
    users?: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  }[]) ?? []).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      title: r.title,
      start: r.start_time,
      end: r.end_time,
      type: "reservation",
      roomName: (Array.isArray(r.rooms) ? r.rooms[0] : r.rooms)?.name ?? null,
      status: r.status,
      employeeName: u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : null,
    };
  });

  const { data: maintenance, error: me } = await db
    .from("maintenance_schedules")
    .select("id, title, start_time, end_time, status, room_id, rooms(name)")
    .gte("start_time", dayStartIso(startIso))
    .lte("start_time", dayEndIso(endIso));
  if (me) throw new Error(`maintenance load failed: ${me.message}`);
  for (const mnt of (maintenance as unknown as {
    id: string; title: string | null; start_time: string; end_time: string; status: string | null;
    rooms?: { name: string | null } | { name: string | null }[] | null;
  }[]) ?? []) {
    events.push({
      id: mnt.id,
      title: mnt.title,
      start: mnt.start_time,
      end: mnt.end_time,
      type: "maintenance",
      roomName: (Array.isArray(mnt.rooms) ? mnt.rooms[0] : mnt.rooms)?.name ?? "",
      status: mnt.status,
    });
  }

  return jsonResponse(ok(events), 200);
}

async function handleAnalytics(_ctx: AuthContext | null, _req: Request) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startIso = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const endIso = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

  const reservations = await loadReservationsWithJoins();
  const monthReservations = reservations.filter((r) =>
    r.start_time && r.start_time >= dayStartIso(startIso) && r.start_time <= dayEndIso(endIso));

  const dailyUtilization: Record<string, number> = {};
  const peakHours: Record<string, number> = {};
  const departmentDistribution: Record<string, number> = {};
  const roomFrequency: Record<string, number> = {};
  for (const r of monthReservations) {
    const d = localDatePart(r.start_time ?? "");
    dailyUtilization[d] = (dailyUtilization[d] ?? 0) + 1;
    const hour = String(new Date(r.start_time!).getUTCHours());
    peakHours[hour] = (peakHours[hour] ?? 0) + 1;
    const dept = userOf(r)?.department;
    if (dept) departmentDistribution[dept] = (departmentDistribution[dept] ?? 0) + 1;
    if (r.room_id) roomFrequency[r.room_id] = (roomFrequency[r.room_id] ?? 0) + 1;
  }

  const topRooms = Object.entries(roomFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rid, count]) => {
      const r = reservations.find((x) => x.id === rid);
      const fac = r ? roomFacility(r) : null;
      return {
        roomName: r ? roomName(r) : "Unknown",
        roomNumber: r ? (roomNumber(r) ?? "") : "",
        facilityName: fac?.name ?? "",
        count,
      };
    });

  const equipment = await loadAllEquipment();
  const totalAssets = equipment.length;
  const maintAssets = equipment.filter((e) => e.status === "UNDER_MAINTENANCE").length;
  const assetUtil = totalAssets > 0 ? ((totalAssets - maintAssets) / totalAssets) * 100 : 0;
  const assetCats: Record<string, number> = {};
  for (const e of equipment) {
    if (e.category) assetCats[e.category] = (assetCats[e.category] ?? 0) + 1;
  }
  const assetTrends = Object.entries(assetCats).map(([cat, cnt]) => ({ category: cat, count: cnt }));

  return jsonResponse(ok({
    dailyRoomUtilization: dailyUtilization,
    monthlyReservationTrends: { total: monthReservations.length },
    peakReservationHours: peakHours,
    departmentDistribution,
    mostFrequentlyUsedRooms: topRooms,
    assetUtilizationTrends: { rate: Math.round(assetUtil * 10) / 10, categories: assetTrends },
  }), 200);
}

async function handleReports(_ctx: AuthContext | null, req: Request) {
  const url = new URL(req.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const start = startDate ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const end = endDate ?? new Date().toISOString().slice(0, 10);

  const reservations = await loadReservationsWithJoins();
  const inRange = reservations.filter((r) =>
    r.start_time && r.start_time >= dayStartIso(start) && r.start_time <= dayEndIso(end));

  const rooms = await loadAllRooms();
  const totalRooms = rooms.length;
  const available = rooms.filter((r) => r.active === true).length;
  const occupancyRate = totalRooms > 0 ? ((totalRooms - available) / totalRooms) * 100 : 0;

  const equipment = await loadAllEquipment();
  const totalAssets = equipment.length;
  const activeAssets = equipment.filter((e) => e.status === "AVAILABLE").length;
  const assetUtilRate = totalAssets > 0 ? (activeAssets / totalAssets) * 100 : 0;

  const countStatus = (s: string) => inRange.filter((r) => r.status === s).length;
  return jsonResponse(ok({
    reservationReports: {
      totalReservations: inRange.length,
      approved: countStatus("APPROVED"),
      pending: countStatus("PENDING"),
      rejected: countStatus("REJECTED"),
      cancelled: countStatus("CANCELLED"),
    },
    facilityUtilization: {
      totalRooms,
      availableRooms: available,
      occupancyRate: Math.round(occupancyRate * 10) / 10,
    },
    assetReports: {
      totalAssets,
      activeAssets,
      assetUtilizationRate: Math.round(assetUtilRate * 10) / 10,
    },
    occupancyReports: {
      totalRooms,
      occupiedRooms: totalRooms - available,
      occupancyRate: Math.round(occupancyRate * 10) / 10,
    },
  }), 200);
}

// ---------------------------------------------------------------------------
// Facilities Officer
// ---------------------------------------------------------------------------

function buildRoomMap(r: RoomRow, amenities: string[]): Record<string, unknown> {
  const fac = facOf(r);
  return {
    id: r.id,
    name: r.name,
    roomNumber: r.room_number,
    type: r.type,
    floorNumber: r.floor_number,
    building: r.building,
    capacity: r.capacity,
    openTime: r.open_time,
    closeTime: r.close_time,
    status: r.status,
    hasProjector: r.has_projector,
    hasVideoConference: r.has_video_conference,
    hasWhiteboard: r.has_whiteboard,
    facilityId: r.facility_id,
    facilityName: fac?.name ?? null,
    facilityCode: fac?.code ?? null,
    facilityType: fac?.type ?? null,
    amenities,
  };
}

function withinHours(r: RoomRow, startHm: string, endHm: string): boolean {
  if (!r.open_time || !r.close_time) return true;
  return startHm >= hhmm(r.open_time).slice(0, 5) && endHm <= hhmm(r.close_time).slice(0, 5);
}

async function findAvailableRooms(
  date: string, startHm: string, endHm: string,
  facilityId: string | null, facilityType: string | null, building: string | null,
  floor: number | null, minCapacity: number | null, roomType: string | null, availability: string | null,
): Promise<{ summary: Record<string, unknown>; rooms: Record<string, unknown>[] }> {
  const start = toUtcIso(`${date}T${startHm}`);
  const end = toUtcIso(`${date}T${endHm}`);

  let rooms = await loadActiveRooms();
  rooms = rooms.filter((r) => {
    const fac = facOf(r);
    if (facilityId && r.facility_id !== facilityId) return false;
    if (facilityType && (!fac?.type || String(fac.type).toLowerCase() !== facilityType.toLowerCase())) return false;
    if (building && !(r.building && String(r.building).toLowerCase() === building.toLowerCase())) return false;
    if (floor != null && !Number.isNaN(floor) && r.floor_number !== floor) return false;
    if (minCapacity != null && !Number.isNaN(minCapacity) && (r.capacity == null || r.capacity < minCapacity)) return false;
    if (roomType && r.type !== roomType) return false;
    return true;
  });

  const amenityMap = await loadAmenities(rooms.map((r) => r.id));
  const items: Record<string, unknown>[] = [];
  let available = 0;
  let occupied = 0;
  let maintenance = 0;
  let outOfService = 0;
  let closed = 0;

  for (const room of rooms) {
    const m = buildRoomMap(room, amenityMap.get(room.id) ?? []);
    const wh = withinHours(room, startHm, endHm);
    const conflicts = await conflictingReservations(room.id, start, end);
    const maintOverlap = await hasMaintenanceOverlap(room.id, start, end);
    const maintenanceBlocked = maintOverlap || room.status === "MAINTENANCE" || room.status === "OUT_OF_SERVICE";

    let status: string;
    if (room.status === "OUT_OF_SERVICE") {
      status = "OUT_OF_SERVICE";
      outOfService++;
    } else if (maintenanceBlocked) {
      status = "MAINTENANCE";
      maintenance++;
    } else if (conflicts.length > 0) {
      status = "OCCUPIED";
      occupied++;
      m.occupiedBy = conflicts[0].title;
      m.occupiedUntil = conflicts[0].end_time;
    } else if (!wh) {
      status = "CLOSED";
      closed++;
    } else {
      status = "AVAILABLE";
      available++;
    }

    m.availability = status;
    m.selectable = status === "AVAILABLE";
    m.withinOperatingHours = wh;

    if (availability === null || status.toLowerCase() === availability.toLowerCase()) {
      items.push(m);
    }
  }

  return {
    summary: {
      total: rooms.length,
      available,
      occupied,
      maintenance,
      outOfService,
      closed,
      startDateTime: start,
      endDateTime: end,
    },
    rooms: items,
  };
}

async function handleOfficerRoomsAvailable(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const req = (body ?? {}) as Record<string, unknown>;
  const date = String(req.date ?? "");
  const startHm = String(req.startTime ?? "");
  const endHm = String(req.endTime ?? "");
  const result = await findAvailableRooms(
    date, startHm, endHm,
    req.facilityId != null && req.facilityId !== "" ? String(req.facilityId) : null,
    req.facilityType != null && req.facilityType !== "" ? String(req.facilityType) : null,
    req.building != null && req.building !== "" ? String(req.building) : null,
    req.floor != null ? Number.parseInt(String(req.floor), 10) : null,
    req.minCapacity != null ? Number.parseInt(String(req.minCapacity), 10) : null,
    req.roomType != null && req.roomType !== "" ? String(req.roomType) : null,
    req.availability != null && req.availability !== "" ? String(req.availability) : null,
  );
  return jsonResponse(ok(result, "Rooms fetched successfully"), 200);
}

async function handleOfficerRoomFilters(_ctx: AuthContext | null, _req: Request) {
  const rooms = await loadActiveRooms();
  const facilities: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const buildings: string[] = [];
  const floors: number[] = [];
  const roomTypes: string[] = [];
  for (const r of rooms) {
    const fac = facOf(r);
    if (fac && !seen.has(fac.id)) {
      seen.add(fac.id);
      facilities.push({ id: fac.id, name: fac.name, code: fac.code, type: fac.type });
    }
    if (r.building && !buildings.includes(r.building)) buildings.push(r.building);
    if (r.floor_number != null && !floors.includes(r.floor_number)) floors.push(r.floor_number);
    if (r.type && !roomTypes.includes(r.type)) roomTypes.push(r.type);
  }
  buildings.sort();
  floors.sort((a, b) => a - b);
  return jsonResponse(ok({
    facilities,
    buildings,
    floors,
    roomTypes,
    statuses: ["AVAILABLE", "OCCUPIED", "MAINTENANCE", "OUT_OF_SERVICE", "CLOSED"],
  }, "Filters fetched successfully"), 200);
}

async function handleOfficerDashboard(_ctx: AuthContext | null, _req: Request) {
  const today = new Date().toISOString().slice(0, 10);
  const todayReservations = await loadReservationsWithJoins();

  const statusCounts = await countReservationsByStatus();
  const rooms = await loadAllRooms();
  const facilitiesUnderMaintenance = rooms.filter((r) => r.status === "MAINTENANCE" || r.status === "OUT_OF_SERVICE").length;

  const { data: maint, error: me } = await db
    .from("maintenance_schedules")
    .select("id, title, start_time, end_time, status, room_id, rooms(name)")
    .gte("start_time", dayStartIso(today))
    .lte("start_time", dayEndIso(today));
  if (me) throw new Error(`maintenance load failed: ${me.message}`);
  const maintRows = (maint as unknown as {
    id: string; title: string | null; start_time: string; end_time: string; status: string | null; room_id: string | null;
    rooms?: { name: string | null } | { name: string | null }[] | null;
  }[]) ?? [];
  const tasksDueToday = maintRows.filter((m) => m.status === "SCHEDULED" || m.status === "IN_PROGRESS").length;

  const dailyReservationLoad: Record<string, unknown>[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    dailyReservationLoad.push({
      day: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(day + "T00:00:00Z").getUTCDay()],
      count: await countByDateRange2(dayStartIso(day), dayEndIso(day)),
    });
  }

  const roomStatusCounts: Record<string, number> = {};
  for (const r of rooms) {
    if (r.status) roomStatusCounts[r.status] = (roomStatusCounts[r.status] ?? 0) + 1;
  }
  const facilityStatusBreakdown = Object.entries(roomStatusCounts).map(([name, value]) => ({ name, value }));

  const todays = todayReservations.filter((r) => localDatePart(r.start_time ?? "") === today);
  const todayBookings = todays.map((r) => ({
    title: r.title,
    status: r.status,
    room: roomName(r) ?? "Unknown",
    time: `${timePart(r.start_time ?? "")} - ${timePart(r.end_time ?? "")}`,
  }));

  const maintenanceTasks = maintRows.map((m) => ({
    task: m.title,
    priority: m.status === "IN_PROGRESS" ? "HIGH" : m.status === "SCHEDULED" ? "MEDIUM" : "LOW",
    location: (Array.isArray(m.rooms) ? m.rooms[0] : m.rooms)?.name ?? "Unknown",
    dueDate: localDatePart(m.start_time),
  }));

  const equipment = await loadAllEquipment();
  const roomIds = equipment.map((e) => e.room_id).filter((x): x is string => x != null);
  const { data: eqRooms, error: er } = roomIds.length > 0
    ? await db.from("rooms").select("id, name").in("id", roomIds)
    : { data: null as unknown, error: null };
  if (er) throw new Error(`rooms load failed: ${er.message}`);
  const roomMap = new Map<string, string>();
  for (const r2 of (eqRooms as { id: string; name: string }[]) ?? []) roomMap.set(r2.id, r2.name);
  const facilityInventory = equipment.map((e) => ({
    name: e.name,
    status: e.status,
    quantity: 1,
    location: e.room_id ? (roomMap.get(e.room_id) ?? "Unassigned") : "Unassigned",
  }));

  return jsonResponse(ok({
    kpi: {
      todaysReservations: todays.length,
      pendingRequests: statusCounts["PENDING"] ?? 0,
      facilitiesUnderMaintenance,
      tasksDueToday,
    },
    charts: {
      dailyReservationLoad,
      facilityStatusBreakdown,
    },
    tables: {
      todayBookings,
      maintenanceTasks,
      facilityInventory,
    },
  }, "Dashboard summary fetched successfully"), 200);
}

async function handleOfficerMyReservations(ctx: AuthContext | null, _req: Request) {
  const { data, error } = await db
    .from("reservations")
    .select("*, rooms(name, room_number, floor_number, facility_id, facilities(name, code))")
    .eq("user_id", ctx!.userId);
  if (error) throw new Error(`reservations load failed: ${error.message}`);
  const items = ((data as unknown as ReservationRow[]) ?? []).map((r) => {
    const fac = roomFacility(r);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status,
      expectedAttendees: r.expected_attendees,
      rejectionReason: r.rejection_reason,
      roomId: r.room_id,
      roomName: roomName(r),
      roomNumber: roomNumber(r),
      floorNumber: roomFloor(r),
      facilityName: fac?.name ?? null,
      facilityCode: fac?.code ?? null,
      createdAt: r.created_at,
    };
  });
  return jsonResponse(ok(items, "Reservations fetched successfully"), 200);
}

async function handleOfficerCreateReservation(ctx: AuthContext | null, _req: Request, body: unknown) {
  const req = (body ?? {}) as Record<string, unknown>;
  let roomId = "";
  try {
    roomId = String(req.roomId);
  } catch {
    return badRequest("Room not found", "ROOM_NOT_FOUND");
  }
  const { data: room, error: re } = await db.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (re) throw new Error(`room lookup failed: ${re.message}`);
  if (!room) return badRequest("Room not found", "ROOM_NOT_FOUND");
  const roomRow = room as unknown as { active: boolean | null; status: string | null; open_time: string | null; close_time: string | null };
  if (roomRow.active !== true) return badRequest("This room is not active and cannot be reserved.", "ROOM_INACTIVE");

  const start = toUtcIso(String(req.startTime ?? ""));
  const end = toUtcIso(String(req.endTime ?? ""));
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return badRequest("End time must be after start time.", "INVALID_RANGE");
  }
  if (new Date(start).getTime() < Date.now()) {
    return badRequest("Reservation cannot be in the past.", "PAST_TIME");
  }
  if (roomRow.open_time && roomRow.close_time) {
    const startHm = String(req.startTime ?? "").split("T")[1]?.slice(0, 5) ?? "";
    const endHm = String(req.endTime ?? "").split("T")[1]?.slice(0, 5) ?? "";
    if (!(startHm >= hhmm(String(roomRow.open_time)).slice(0, 5) && endHm <= hhmm(String(roomRow.close_time)).slice(0, 5))) {
      return badRequest(
        `Selected time is outside the room's operating hours (${String(roomRow.open_time).slice(0, 5)} - ${String(roomRow.close_time).slice(0, 5)}).`,
        "OUTSIDE_OPERATING_HOURS",
      );
    }
  }
  const maintenanceBlocked = roomRow.status === "MAINTENANCE" || roomRow.status === "OUT_OF_SERVICE"
    || await hasMaintenanceOverlap(roomId, start, end);
  if (maintenanceBlocked) {
    return badRequest("This room is under maintenance for the selected timeframe.", "UNDER_MAINTENANCE");
  }
  const conflicts = await conflictingReservations(roomId, start, end);
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    return badRequest(
      `Room is already reserved for the selected timeframe (${conflict.start_time} - ${conflict.end_time}).`,
      "CONFLICT",
    );
  }

  const expectedAttendees = req.expectedAttendees != null ? Number.parseInt(String(req.expectedAttendees), 10) : null;
  const { data: saved, error: insErr } = await db.from("reservations").insert({
    room_id: roomId,
    user_id: ctx!.userId,
    title: String(req.title ?? "Room Reservation"),
    description: req.description != null ? String(req.description) : null,
    start_time: start,
    end_time: end,
    expected_attendees: expectedAttendees,
    status: "PENDING",
    created_by: ctx!.email,
  }).select("id, title, start_time, end_time, status, room_id").single();
  if (insErr) throw new Error(`reservation insert failed: ${insErr.message}`);

  const result = {
    id: (saved as { id: string }).id,
    title: (saved as { title: string }).title,
    startTime: (saved as { start_time: string }).start_time,
    endTime: (saved as { end_time: string }).end_time,
    status: (saved as { status: string }).status,
    roomId,
    roomName: (room as { name: string }).name,
  };
  return jsonResponse(ok(result, "Reservation request submitted for approval"), 200);
}

async function handleOfficerCancelReservation(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data: r, error } = await db.from("reservations").select("*").eq("id", p.id).maybeSingle();
  if (error) throw new Error(`reservation lookup failed: ${error.message}`);
  if (!r) return notFound();
  const row = r as unknown as ReservationRow;
  if (row.user_id !== ctx!.userId) {
    return jsonResponse(fail("You can only cancel your own reservations.", "FORBIDDEN"), 403);
  }
  if (row.status === "APPROVED" || row.status === "CHECKED_IN" || row.status === "COMPLETED") {
    return badRequest(`A ${String(row.status).toLowerCase()} reservation cannot be cancelled by the requester.`, "INVALID_STATUS");
  }
  const { data: saved, error: ue } = await db.from("reservations").update({ status: "CANCELLED", updated_by: ctx!.email }).eq("id", row.id).select("id, status").single();
  if (ue) throw new Error(`reservation update failed: ${ue.message}`);
  return jsonResponse(ok({ id: (saved as { id: string }).id, status: (saved as { status: string }).status }, "Reservation cancelled successfully"), 200);
}

// ---------------------------------------------------------------------------
// Facility controller (/v1/facilities)
// ---------------------------------------------------------------------------

async function handleFacilities(_ctx: AuthContext | null, _req: Request) {
  const { data, error } = await db.from("facilities").select("*");
  if (error) throw new Error(`facilities load failed: ${error.message}`);
  const rooms = await loadAllRooms();
  const countByFacility: Record<string, number> = {};
  for (const r of rooms) {
    if (r.facility_id) countByFacility[r.facility_id] = (countByFacility[r.facility_id] ?? 0) + 1;
  }
  const items = ((data as unknown as {
    id: string; name: string; code: string | null; type: string | null; address: string | null;
    city: string | null; country: string | null; timezone: string | null; total_capacity: number | null; active: boolean | null;
  }[]) ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code,
    type: f.type,
    address: f.address,
    city: f.city,
    country: f.country,
    timezone: f.timezone,
    totalCapacity: f.total_capacity,
    active: f.active,
    roomCount: countByFacility[f.id] ?? 0,
  }));
  return jsonResponse(ok(items, "Facilities fetched successfully"), 200);
}

async function handleCreateFacility(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const { data: saved, error } = await db.from("facilities").insert({
    name: b.name != null ? String(b.name) : null,
    code: b.code != null ? String(b.code) : null,
    type: b.type != null ? String(b.type) : null,
    address: b.address != null ? String(b.address) : null,
    city: b.city != null ? String(b.city) : null,
    country: b.country != null ? String(b.country) : null,
    timezone: b.timezone != null ? String(b.timezone) : null,
    total_capacity: b.totalCapacity != null ? Number.parseInt(String(b.totalCapacity), 10) : null,
    active: b.active == null || String(b.active).toLowerCase() === "true",
    created_by: ctx!.email,
  }).select("*").single();
  if (error) throw new Error(`facility insert failed: ${error.message}`);
  const f = saved as unknown as {
    id: string; name: string; code: string | null; type: string | null; address: string | null;
    city: string | null; country: string | null; timezone: string | null; total_capacity: number | null; active: boolean | null;
  };
  return jsonResponse(ok({
    id: f.id,
    name: f.name,
    code: f.code,
    type: f.type,
    address: f.address,
    city: f.city,
    country: f.country,
    timezone: f.timezone,
    totalCapacity: f.total_capacity,
    active: f.active,
    roomCount: 0,
  }, "Facility created successfully"), 200);
}

async function handleRoomsByFacility(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db
    .from("rooms")
    .select("*, facilities(name)")
    .eq("facility_id", p.facilityId);
  if (error) throw new Error(`rooms load failed: ${error.message}`);
  const items = ((data as unknown as RoomRow[]) ?? []).map((r) => {
    const fac = facOf(r);
    return {
      id: r.id,
      roomNumber: r.room_number,
      name: r.name,
      type: r.type,
      floorNumber: r.floor_number,
      building: r.building,
      capacity: r.capacity,
      openTime: r.open_time,
      closeTime: r.close_time,
      status: r.status,
      hasProjector: r.has_projector,
      hasVideoConference: r.has_video_conference,
      hasWhiteboard: r.has_whiteboard,
      active: r.active,
      facilityId: r.facility_id,
      facilityName: fac?.name ?? null,
    };
  });
  return jsonResponse(ok(items, "Rooms fetched successfully"), 200);
}

async function handleCreateRoomFacility(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const facObj = b.facility as Record<string, unknown> | undefined;
  const facilityId = facObj && facObj.id != null ? String(facObj.id) : String(b.facilityId ?? "");
  const { data: saved, error } = await db.from("rooms").insert({
    facility_id: facilityId,
    room_number: b.roomNumber != null ? String(b.roomNumber) : "",
    name: b.name != null ? String(b.name) : null,
    type: b.type != null ? String(b.type) : null,
    floor_number: b.floorNumber != null ? Number.parseInt(String(b.floorNumber), 10) : null,
    building: b.building != null ? String(b.building) : null,
    capacity: b.capacity != null ? Number.parseInt(String(b.capacity), 10) : null,
    status: b.status != null ? String(b.status) : "VACANT",
    active: b.active == null || String(b.active).toLowerCase() === "true",
    created_by: ctx!.email,
  }).select("*").single();
  if (error) throw new Error(`room insert failed: ${error.message}`);
  return jsonResponse(ok(saved, "Room created successfully"), 200);
}

async function handleAllReservations(_ctx: AuthContext | null, _req: Request) {
  const all = await loadReservationsWithJoins();
  const items = all.map((r) => {
    const u = userOf(r);
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status,
      expectedAttendees: r.expected_attendees,
      rejectionReason: r.rejection_reason,
      roomId: r.room_id,
      roomName: roomName(r),
      roomNumber: roomNumber(r),
      reservedById: r.user_id,
      reservedByName: u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null : null,
      createdAt: r.created_at,
    };
  });
  return jsonResponse(ok(items, "Reservations fetched successfully"), 200);
}

async function handleCreateReservationFacility(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const roomId = b.room != null && (b.room as Record<string, unknown>).id != null
    ? String((b.room as Record<string, unknown>).id)
    : String(b.roomId ?? "");
  const start = toUtcIso(String(b.startTime ?? ""));
  const end = toUtcIso(String(b.endTime ?? ""));

  const conflicts = await conflictingReservations(roomId, start, end);
  if (conflicts.length > 0) {
    return badRequest("Room is already reserved for the selected timeframe.", "CONFLICT");
  }
  const { data: saved, error } = await db.from("reservations").insert({
    room_id: roomId,
    user_id: b.reservedBy != null && (b.reservedBy as Record<string, unknown>).id != null ? String((b.reservedBy as Record<string, unknown>).id) : String(b.userId ?? ""),
    title: b.title != null ? String(b.title) : "Room Reservation",
    description: b.description != null ? String(b.description) : null,
    start_time: start,
    end_time: end,
    expected_attendees: b.expectedAttendees != null ? Number.parseInt(String(b.expectedAttendees), 10) : null,
    status: "APPROVED",
    created_by: ctx!.email,
  }).select("*").single();
  if (error) throw new Error(`reservation insert failed: ${error.message}`);
  return jsonResponse(ok(saved, "Reservation confirmed successfully"), 200);
}

// ---------------------------------------------------------------------------
// AI endpoints (deterministic; no LLM)
// ---------------------------------------------------------------------------

const HIGH_CAPACITY_THRESHOLD = 50;
const PEAK_HOUR_START = 10;
const PEAK_HOUR_END = 14;

async function loadRoomsWithFacility(): Promise<RoomRow[]> {
  return await loadAllRooms();
}

function isPeakHour(hour: number): boolean {
  return hour >= PEAK_HOUR_START && hour < PEAK_HOUR_END;
}

function validateReservation(
  room: RoomRow, startIso: string, endIso: string, expectedAttendees: number | null,
  conflicts: ReservationRow[], maintBlocked: boolean,
): { code: string; severity: string; message: string; details: Record<string, unknown> }[] {
  const warnings: { code: string; severity: string; message: string; details: Record<string, unknown> }[] = [];
  const startHm = (startIso.split("T")[1] ?? "").slice(0, 5);
  const endHm = (endIso.split("T")[1] ?? "").slice(0, 5);

  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    warnings.push({ code: "INVALID_RANGE", severity: "ERROR", message: "End time must be after start time.", details: { start: startIso, end: endIso } });
    return warnings;
  }
  if (new Date(startIso).getTime() < Date.now()) {
    warnings.push({ code: "PAST_TIME", severity: "ERROR", message: "Reservation cannot be in the past.", details: { start: startIso } });
  }
  if (room.open_time && room.close_time) {
    const within = startHm >= hhmm(room.open_time).slice(0, 5) && endHm <= hhmm(room.close_time).slice(0, 5);
    if (!within) {
      warnings.push({
        code: "OUTSIDE_OPERATING_HOURS", severity: "WARNING",
        message: `Selected time is outside the room's operating hours (${String(room.open_time).slice(0, 5)} - ${String(room.close_time).slice(0, 5)}).`,
        details: { openTime: room.open_time, closeTime: room.close_time },
      });
    }
  }
  if (maintBlocked || room.status === "MAINTENANCE" || room.status === "OUT_OF_SERVICE") {
    warnings.push({ code: "MAINTENANCE", severity: "ERROR", message: "This room is under maintenance for the selected timeframe.", details: { roomId: room.id } });
  }
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    warnings.push({
      code: "CONFLICT", severity: "ERROR",
      message: `Room is already reserved for the selected timeframe (${conflict.start_time} - ${conflict.end_time}).`,
      details: { conflictingTitle: conflict.title, conflictingStart: conflict.start_time, conflictingEnd: conflict.end_time, conflictStatus: conflict.status },
    });
  }
  if (expectedAttendees != null && room.capacity != null) {
    if (expectedAttendees > room.capacity) {
      warnings.push({
        code: "CAPACITY", severity: "ERROR",
        message: `Expected attendees (${expectedAttendees}) exceed room capacity (${room.capacity}).`,
        details: { expectedAttendees, capacity: room.capacity },
      });
    } else if (expectedAttendees <= room.capacity * 0.4) {
      warnings.push({
        code: "CAPACITY", severity: "INFO",
        message: `Room is much larger than needed (${room.capacity} seats for ${expectedAttendees} attendees). A smaller room may be a better fit.`,
        details: { expectedAttendees, capacity: room.capacity },
      });
    }
  }
  if (expectedAttendees != null && expectedAttendees >= HIGH_CAPACITY_THRESHOLD) {
    warnings.push({
      code: "HIGH_CAPACITY", severity: "WARNING",
      message: `High-capacity booking (${expectedAttendees} attendees). This will be flagged for explicit Facilities Manager approval.`,
      details: { threshold: HIGH_CAPACITY_THRESHOLD, expectedAttendees },
    });
  }
  const startHour = new Date(startIso).getUTCHours();
  if (isPeakHour(startHour)) {
    warnings.push({
      code: "PEAK_HOURS", severity: "INFO",
      message: `Requested start falls in peak booking hours (${PEAK_HOUR_START}:00 - ${PEAK_HOUR_END}:00). Availability may be limited.`,
      details: { peakStart: PEAK_HOUR_START, peakEnd: PEAK_HOUR_END },
    });
  }
  return warnings;
}

async function findAlternativeSlots(room: RoomRow, startIso: string, endIso: string, limit: number): Promise<Record<string, unknown>[]> {
  const alternatives: Record<string, unknown>[] = [];
  const durationMinutes = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  const startDate = startIso.slice(0, 10);
  let cursor = new Date(startIso);
  let attempts = 0;
  while (alternatives.length < limit && attempts < 60) {
    attempts++;
    cursor = new Date(cursor.getTime() + 30 * 60000);
    if (cursor.toISOString().slice(0, 10) !== startDate) break;
    const altStartIso = cursor.toISOString();
    const altEndIso = new Date(cursor.getTime() + durationMinutes * 60000).toISOString();
    let ok = true;
    if (room.open_time && room.close_time) {
      const sHm = altStartIso.split("T")[1].slice(0, 5);
      const eHm = altEndIso.split("T")[1].slice(0, 5);
      if (!(sHm >= hhmm(room.open_time).slice(0, 5) && eHm <= hhmm(room.close_time).slice(0, 5))) ok = false;
    }
    if (ok && await hasMaintenanceOverlap(room.id, altStartIso, altEndIso)) ok = false;
    if (ok && (await conflictingReservations(room.id, altStartIso, altEndIso)).length > 0) ok = false;
    if (ok) {
      alternatives.push({
        date: altStartIso.slice(0, 10),
        startTime: altStartIso.split("T")[1].slice(0, 5),
        endTime: altEndIso.split("T")[1].slice(0, 5),
        startDateTime: altStartIso,
        endDateTime: altEndIso,
      });
    }
  }
  return alternatives;
}

function detectRoomType(lower: string): string | null {
  if (lower.includes("auditorium")) return "AUDITORIUM";
  if (lower.includes("boardroom") || lower.includes("board room")) return "EXECUTIVE_BOARDROOM";
  if (lower.includes("training") || lower.includes("workshop") || lower.includes("classroom")) return "TRAINING_ROOM";
  if (lower.includes("event hall") || lower.includes("function hall") || lower.includes("ballroom")) return "EVENT_HALL";
  if (lower.includes("workstation") || lower.includes("pod") || lower.includes("cubicle")) return "WORKSTATION_POD";
  if (lower.includes("meeting") || lower.includes("huddle")) return "MEETING_ROOM";
  if (lower.includes("conference") || lower.includes("conference room")) return "CONFERENCE_ROOM";
  return null;
}

async function detectBuilding(lower: string): Promise<string | null> {
  const rooms = await loadRoomsWithFacility();
  const buildings = [...new Set(rooms.map((r) => r.building).filter((b): b is string => b != null && b !== ""))];
  for (const b of buildings) {
    if (lower.includes(b.toLowerCase())) return b;
  }
  return null;
}

function detectFloor(lower: string): number | null {
  const m = lower.match(/floor\s*(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

function detectDate(lower: string): string | null {
  const now = new Date();
  if (lower.includes("today")) return now.toISOString().slice(0, 10);
  if (lower.includes("tomorrow")) return new Date(now.getTime() + 86400_000).toISOString().slice(0, 10);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 86400_000);
    const name = days[d.getUTCDay()];
    if (lower.includes(name) || lower.includes(name.slice(0, 3))) return d.toISOString().slice(0, 10);
  }
  return null;
}

function detectTimeRange(lower: string): [string | null, string | null] {
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/g;
  const times: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    let hour = Number.parseInt(m[1], 10);
    const minute = m[2] ? Number.parseInt(m[2], 10) : 0;
    const pm = m[3].toLowerCase().startsWith("p");
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    times.push([hour, minute]);
  }
  if (times.length >= 2) {
    const s = times[0];
    const e = times[1];
    return [`${String(s[0]).padStart(2, "0")}:${String(s[1]).padStart(2, "0")}`, `${String(e[0]).padStart(2, "0")}:${String(e[1]).padStart(2, "0")}`];
  }
  if (times.length === 1) {
    const s = times[0];
    const endHour = s[0] + 2 > 23 ? 23 : s[0] + 2;
    return [`${String(s[0]).padStart(2, "0")}:${String(s[1]).padStart(2, "0")}`, `${String(endHour).padStart(2, "0")}:${String(s[1]).padStart(2, "0")}`];
  }
  return [null, null];
}

async function handleAiSuggestRooms(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const req = (body ?? {}) as Record<string, unknown>;
  const naturalLanguage = req.query != null ? String(req.query) : "";
  const date = String(req.date ?? "");
  const start = String(req.startTime ?? "");
  const end = String(req.endTime ?? "");
  const limit = req.limit != null ? Number.parseInt(String(req.limit), 10) : 5;

  const lower = naturalLanguage.toLowerCase();
  const attendeesMatch = lower.match(/(\d+)\s*(?:people|persons|pax|attendees|guests|participants|seats)/);
  const expectedAttendees = attendeesMatch ? Number.parseInt(attendeesMatch[1], 10) : null;
  const keywords: string[] = [];
  if (lower.includes("projector") || lower.includes("projection")) keywords.push("projector");
  if (lower.includes("video conf") || lower.includes("video-conference") || lower.includes("videoconference") || lower.includes("vc") || lower.includes("zoom") || lower.includes("webcam")) keywords.push("videoConference");
  if (lower.includes("whiteboard") || lower.includes("white board") || lower.includes("flip chart") || lower.includes("flipchart")) keywords.push("whiteboard");
  const roomType = detectRoomType(lower);
  const building = await detectBuilding(lower);
  const floor = detectFloor(lower);

  const parsedCriteria = {
    expectedAttendees,
    requestedCapacity: null,
    requiresProjector: keywords.includes("projector"),
    requiresVideoConference: keywords.includes("videoConference"),
    requiresWhiteboard: keywords.includes("whiteboard"),
    roomType,
    building,
    floor,
    facilityId: null,
  };

  const startIso = toUtcIso(`${date}T${start}`);
  const endIso = toUtcIso(`${date}T${end}`);
  const rooms = await loadRoomsWithFacility();
  const candidates = rooms.filter((r) => {
    if (r.active !== true) return false;
    if (roomType && r.type !== roomType) return false;
    if (building && !(r.building && r.building.toLowerCase() === building.toLowerCase())) return false;
    if (floor != null && r.floor_number !== floor) return false;
    if (expectedAttendees != null && r.capacity != null && r.capacity < expectedAttendees) return false;
    return true;
  });

  const amenityMap = await loadAmenities(candidates.map((r) => r.id));
  const suggestions: Record<string, unknown>[] = [];
  for (const room of candidates) {
    const conflicts = await conflictingReservations(room.id, startIso, endIso);
    const maint = await hasMaintenanceOverlap(room.id, startIso, endIso);
    if (room.status === "MAINTENANCE" || room.status === "OUT_OF_SERVICE" || maint || conflicts.length > 0) continue;
    const wh = withinHours(room, start, end);
    if (!wh) continue;

    let score = 50;
    if (keywords.includes("projector") && room.has_projector) score += 15;
    if (keywords.includes("videoConference") && room.has_video_conference) score += 15;
    if (keywords.includes("whiteboard") && room.has_whiteboard) score += 10;
    if (building && room.building && room.building.toLowerCase() === building.toLowerCase()) score += 8;
    if (floor != null && room.floor_number === floor) score += 6;
    if (roomType && room.type === roomType) score += 10;
    if (expectedAttendees != null && room.capacity != null) {
      const ratio = room.capacity / expectedAttendees;
      if (ratio >= 1.0 && ratio <= 1.8) score += 12;
      else if (ratio > 1.8) score -= 4;
    }
    const { count, error } = await db.from("reservations").select("id", { count: "exact", head: true }).eq("room_id", room.id).gt("end_time", new Date().toISOString());
    if (error) throw new Error(`reservation count failed: ${error.message}`);
    const futureBookings = count ?? 0;
    score += Math.max(0, 10 - futureBookings);

    const reasons: string[] = [];
    if (expectedAttendees != null && room.capacity != null && room.capacity >= expectedAttendees) {
      reasons.push(`fits ${expectedAttendees} attendees (${room.capacity} seats)`);
    }
    if (keywords.includes("projector") && room.has_projector) reasons.push("has projector");
    if (keywords.includes("videoConference") && room.has_video_conference) reasons.push("has video conference");
    if (keywords.includes("whiteboard") && room.has_whiteboard) reasons.push("has whiteboard");
    if (room.building) reasons.push(`located in ${room.building}`);

    const fac = facOf(room);
    suggestions.push({
      roomId: room.id,
      roomName: room.name,
      roomNumber: room.room_number,
      facilityName: fac?.name ?? null,
      building: room.building,
      floorNumber: room.floor_number,
      capacity: room.capacity,
      roomType: room.type,
      score,
      matchReason: reasons.length > 0 ? reasons.join(", ") : "Available for the requested slot",
      hasProjector: room.has_projector,
      hasVideoConference: room.has_video_conference,
      hasWhiteboard: room.has_whiteboard,
      amenities: amenityMap.get(room.id) ?? [],
    });
  }
  suggestions.sort((a, b) => (b.score as number) - (a.score as number));
  const top = suggestions.slice(0, Math.max(1, limit));

  return jsonResponse(ok({
    query: naturalLanguage,
    parsedCriteria,
    date,
    startTime: start,
    endTime: end,
    suggestions: top,
    aiSummary: top.length > 0
      ? `Recommended top match: ${top[0].roomName} - ${top[0].matchReason}.`
      : "No available rooms matched the requested slot.",
  }, "AI room suggestions generated"), 200);
}

async function handleAiDraft(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const req = (body ?? {}) as Record<string, unknown>;
  const text = req.text != null ? String(req.text) : "";
  const lower = text.toLowerCase();
  const keywords: string[] = [];
  if (lower.includes("projector") || lower.includes("projection")) keywords.push("projector");
  if (lower.includes("video conf") || lower.includes("video-conference") || lower.includes("videoconference") || lower.includes("vc") || lower.includes("zoom") || lower.includes("webcam")) keywords.push("video conference");
  if (lower.includes("whiteboard") || lower.includes("white board") || lower.includes("flip chart") || lower.includes("flipchart")) keywords.push("whiteboard");

  const attendeesMatch = lower.match(/(\d+)\s*(?:people|persons|pax|attendees|guests|participants|seats)/);
  const expectedAttendees = attendeesMatch ? Number.parseInt(attendeesMatch[1], 10) : null;
  const roomType = detectRoomType(lower);
  const building = await detectBuilding(lower);
  const date = detectDate(lower);
  const [startTime, endTime] = detectTimeRange(lower);
  const title = text.trim().replace(/\s+/g, " ");
  const truncated = title.length > 80 ? `${title.slice(0, 80).trim()}...` : (title || "Room Reservation");

  return jsonResponse(ok({
    title: truncated,
    description: text.trim(),
    date,
    startTime,
    endTime,
    expectedAttendees,
    requestedCapacity: null,
    requiresProjector: keywords.includes("projector"),
    requiresVideoConference: keywords.includes("video conference"),
    requiresWhiteboard: keywords.includes("whiteboard"),
    roomType,
    building,
    detectedKeywords: keywords,
    aiSummary: `Draft parsed${date === null ? " - missing date" : ""}${startTime === null || endTime === null ? " - missing time range" : ""}.`,
  }, "Reservation draft generated from text"), 200);
}

async function handleAiValidate(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const req = (body ?? {}) as Record<string, unknown>;
  const roomId = String(req.roomId ?? "");
  const startIso = toUtcIso(String(req.startTime ?? ""));
  const endIso = toUtcIso(String(req.endTime ?? ""));
  const expectedAttendees = req.expectedAttendees != null ? Number.parseInt(String(req.expectedAttendees), 10) : null;

  const { data: room, error } = await db.from("rooms").select("*, facilities(name, code, type)").eq("id", roomId).maybeSingle();
  if (error) throw new Error(`room lookup failed: ${error.message}`);
  if (!room) throw new Error(`Room not found: ${roomId}`);
  const roomRow = room as unknown as RoomRow;

  const conflicts = await conflictingReservations(roomId, startIso, endIso);
  const maint = await hasMaintenanceOverlap(roomId, startIso, endIso);
  const warnings = validateReservation(roomRow, startIso, endIso, expectedAttendees, conflicts, maint);
  const blocked = warnings.some((w) => w.severity === "ERROR");
  const alternatives = blocked ? await findAlternativeSlots(roomRow, startIso, endIso, 5) : [];

  return jsonResponse(ok({
    roomId: roomRow.id,
    roomName: roomRow.name,
    valid: !blocked,
    blocked,
    warnings,
    alternatives,
    aiSummary: blocked
      ? "Reservation is blocked for this room/slot. Review the warnings or choose an alternative slot."
      : "No blocking issues found for this reservation.",
  }, "Reservation validated with AI"), 200);
}

async function handleAiApprovalSuggest(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data: r, error } = await db
    .from("reservations")
    .select("*, rooms(name, status, capacity, open_time, close_time), users(id, first_name, last_name)")
    .eq("id", p.id)
    .maybeSingle();
  if (error) throw new Error(`reservation lookup failed: ${error.message}`);
  if (!r) throw new Error(`Reservation not found: ${p.id}`);
  const row = r as unknown as ReservationRow & {
    rooms?: { id: string; name: string | null; status: string | null; capacity: number | null; open_time: string | null; close_time: string | null };
  };

  const reasons: { kind: string; code: string; message: string; details: Record<string, unknown> }[] = [];
  let score = 50;

  if (row.status !== "PENDING") {
    reasons.push({ kind: "INFO", code: "STATUS", message: `Reservation is ${String(row.status).toLowerCase()}, not pending review.`, details: { status: row.status } });
  }

  const allConflicts = await conflictingReservations(row.room_id!, row.start_time!, row.end_time!);
  const conflicts = allConflicts.filter((c) => c.id !== row.id && c.status === "APPROVED");
  if (conflicts.length > 0) {
    score -= 40;
    reasons.push({
      kind: "ERROR", code: "CONFLICT",
      message: "Another reservation was already approved for this room in the same timeframe.",
      details: { conflictingId: conflicts[0].id, conflictingStart: conflicts[0].start_time, conflictingEnd: conflicts[0].end_time },
    });
  }

  const room = row.rooms;
  if (room?.open_time && room.close_time) {
    const startHm = (row.start_time ?? "").split("T")[1]?.slice(0, 5) ?? "";
    const endHm = (row.end_time ?? "").split("T")[1]?.slice(0, 5) ?? "";
    if (startHm >= hhmm(room.open_time).slice(0, 5) && endHm <= hhmm(room.close_time).slice(0, 5)) {
      score += 5;
      reasons.push({ kind: "POSITIVE", code: "OPERATING_HOURS", message: `Request is within the room's operating hours (${String(room.open_time).slice(0, 5)} - ${String(room.close_time).slice(0, 5)}).`, details: {} });
    } else {
      score -= 10;
      reasons.push({ kind: "WARNING", code: "OPERATING_HOURS", message: "Request falls outside the room's operating hours.", details: { openTime: room.open_time, closeTime: room.close_time } });
    }
  }

  if (room?.status === "MAINTENANCE" || room?.status === "OUT_OF_SERVICE") {
    score -= 40;
    reasons.push({ kind: "ERROR", code: "MAINTENANCE", message: `Room is currently ${String(room.status).toLowerCase()}.`, details: { roomStatus: room.status } });
  }

  const attendees = row.expected_attendees;
  if (attendees != null && room?.capacity != null) {
    if (attendees > room.capacity) {
      score -= 30;
      reasons.push({ kind: "ERROR", code: "CAPACITY", message: `Expected attendees (${attendees}) exceed room capacity (${room.capacity}).`, details: { expectedAttendees: attendees, capacity: room.capacity } });
    } else if (attendees <= room.capacity * 0.4) {
      reasons.push({ kind: "INFO", code: "CAPACITY", message: `Room capacity (${room.capacity}) is much larger than the expected attendance (${attendees}).`, details: { expectedAttendees: attendees, capacity: room.capacity } });
    } else {
      score += 8;
      reasons.push({ kind: "POSITIVE", code: "CAPACITY", message: `Room capacity comfortably accommodates ${attendees} attendees.`, details: { expectedAttendees: attendees, capacity: room.capacity } });
    }
  }
  if (attendees != null && attendees >= HIGH_CAPACITY_THRESHOLD) {
    score -= 5;
    reasons.push({ kind: "WARNING", code: "HIGH_CAPACITY", message: `High-capacity booking of ${attendees} attendees - requires explicit manager sign-off.`, details: { threshold: HIGH_CAPACITY_THRESHOLD } });
  }

  if (row.start_time && row.end_time) {
    const durationHours = Math.round((new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 3600000);
    if (durationHours > 6) {
      reasons.push({ kind: "INFO", code: "DURATION", message: `Long-duration booking (${durationHours}h) - confirm the resource is needed for the full window.`, details: { durationHours } });
    }
  }

  const { data: myRows, error: myErr } = await db.from("reservations").select("status").eq("user_id", row.user_id);
  if (myErr) throw new Error(`reservation history failed: ${myErr.message}`);
  const requesterApprovals = ((myRows as unknown as { status: string | null }[]) ?? []).filter((x) => x.status === "APPROVED").length;
  const requesterCancellations = ((myRows as unknown as { status: string | null }[]) ?? []).filter((x) => x.status === "CANCELLED").length;
  if (requesterApprovals > 0) {
    score += 3;
    reasons.push({ kind: "POSITIVE", code: "REQUESTER_HISTORY", message: `Requester has ${requesterApprovals} previously approved booking(s).`, details: { approvedCount: requesterApprovals } });
  }
  if (requesterCancellations > 3) {
    score -= 3;
    reasons.push({ kind: "INFO", code: "REQUESTER_HISTORY", message: `Requester has a high cancellation count (${requesterCancellations}).`, details: { cancelledCount: requesterCancellations } });
  }

  let recommendation: string;
  if (score < 50) recommendation = "REJECT";
  else if (score >= 75) recommendation = "APPROVE";
  else recommendation = "REVIEW";

  const aiSummary = recommendation === "APPROVE"
    ? "Recommended for approval - all operational and policy checks pass."
    : recommendation === "REJECT"
      ? "Recommended for rejection - blocking issues were found."
      : "Recommended for manual review - no hard conflicts, but proceed with caution.";

  return jsonResponse(ok({
    reservationId: row.id,
    title: row.title,
    roomName: room?.name ?? null,
    recommendation,
    score: Math.max(0, Math.min(100, score)),
    confidence: Math.min(98, 60 + Math.abs(score - 65) / 2),
    reasons,
    aiSummary,
  }, "AI approval recommendation generated"), 200);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  // Facilities Manager
  { method: "GET", path: "/facilities-manager/dashboard/kpi", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleManagerKpi },
  { method: "GET", path: "/facilities-manager/reservations", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleManagerReservations },
  { method: "POST", path: "/facilities-manager/reservations/:id/approve", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleApproveReservation },
  { method: "POST", path: "/facilities-manager/reservations/:id/reject", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleRejectReservation },
  { method: "POST", path: "/facilities-manager/reservations/:id/ai/approval-suggest", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleAiApprovalSuggest },
  { method: "GET", path: "/facilities-manager/rooms/summary", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleRoomSummary },
  { method: "GET", path: "/facilities-manager/rooms", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleListRooms },
  { method: "POST", path: "/facilities-manager/rooms", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleCreateRoom },
  { method: "PUT", path: "/facilities-manager/rooms/:id", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleUpdateRoom },
  { method: "POST", path: "/facilities-manager/rooms/:id/maintenance", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleScheduleMaintenance },
  { method: "GET", path: "/facilities-manager/maintenance", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleMaintenanceList },
  { method: "GET", path: "/facilities-manager/assets", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleAssetOverview },
  { method: "GET", path: "/facilities-manager/assets/list", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleAssetList },
  { method: "GET", path: "/facilities-manager/inventory-alerts", guard: { kind: "assignedRoles", roles: ["FACILITIES_MANAGER"] }, handler: handleInventoryAlerts },
  { method: "POST", path: "/facilities-manager/inventory-alerts/reorder", guard: { kind: "assignedRoles", roles: ["FACILITIES_MANAGER"] }, handler: handleInitiateReorder },
  { method: "GET", path: "/facilities-manager/calendar", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleCalendar },
  { method: "GET", path: "/facilities-manager/analytics", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleAnalytics },
  { method: "GET", path: "/facilities-manager/reports", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleReports },

  // Facilities Officer
  { method: "POST", path: "/facilities-officer/rooms/available", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleOfficerRoomsAvailable },
  { method: "GET", path: "/facilities-officer/rooms/filters", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleOfficerRoomFilters },
  { method: "GET", path: "/facilities-officer/dashboard/summary", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleOfficerDashboard },
  { method: "GET", path: "/facilities-officer/reservations", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleOfficerMyReservations },
  { method: "POST", path: "/facilities-officer/reservations", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleOfficerCreateReservation },
  { method: "POST", path: "/facilities-officer/reservations/:id/cancel", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleOfficerCancelReservation },
  { method: "POST", path: "/facilities-officer/ai/suggest", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleAiSuggestRooms },
  { method: "POST", path: "/facilities-officer/ai/draft", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleAiDraft },
  { method: "POST", path: "/facilities-officer/ai/validate", guard: { kind: "roles", roles: ["FACILITIES_OFFICER"] }, handler: handleAiValidate },
  { method: "POST", path: "/facilities-officer/facility-documents/route", guard: { kind: "assignedRoles", roles: ["FACILITIES_OFFICER"] }, handler: handleRouteFacilityDocument },

  // Facility controller
  { method: "GET", path: "/facilities", guard: { kind: "roles", roles: ["FACILITIES_MANAGER", "FACILITIES_OFFICER"] }, handler: handleFacilities },
  { method: "POST", path: "/facilities", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleCreateFacility },
  { method: "GET", path: "/facilities/:facilityId/rooms", guard: { kind: "roles", roles: ["FACILITIES_MANAGER", "FACILITIES_OFFICER"] }, handler: handleRoomsByFacility },
  { method: "POST", path: "/facilities/rooms", guard: { kind: "roles", roles: ["FACILITIES_MANAGER"] }, handler: handleCreateRoomFacility },
  { method: "GET", path: "/facilities/reservations", guard: { kind: "roles", roles: ["FACILITIES_MANAGER", "FACILITIES_OFFICER"] }, handler: handleAllReservations },
  { method: "POST", path: "/facilities/reservations", guard: { kind: "roles", roles: ["FACILITIES_MANAGER", "FACILITIES_OFFICER"] }, handler: handleCreateReservationFacility },
] as const;

Deno.serve(createHandler(routes as never, { name: "facilities" }));
