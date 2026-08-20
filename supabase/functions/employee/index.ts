import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import type { AuthUser } from "../_shared/auth-users.ts";

const db = adminDb();

function nowIso(): string {
  return new Date().toISOString();
}

function notFound(message: string) {
  return jsonResponse(fail(message, "RESOURCE_NOT_FOUND"), 404);
}

function businessRule(message: string) {
  return jsonResponse(fail(message, "BUSINESS_RULE_VIOLATION"), 422);
}

function accessDenied() {
  return jsonResponse(fail("Access denied: insufficient permissions", "ACCESS_DENIED"), 403);
}

/** Interprets a naive LocalDateTime string (Spring's LocalDateTime.parse) as UTC, matching how the Spring backend persisted timestamptz columns. */
function toUtcIso(s: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).toISOString();
  const naive = s.includes("T") ? s : `${s}T00:00:00`;
  return naive + "Z";
}

function isInPast(naiveIsoUtc: string): boolean {
  return new Date(naiveIsoUtc).getTime() < Date.now();
}

function hhmm(s: string): string {
  if (!s) return "";
  return s.length === 5 ? `${s}:00` : s;
}

// ---------------------------------------------------------------------------
// DTO mappers
// ---------------------------------------------------------------------------

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
  rooms?: {
    id: string;
    name: string | null;
    room_number: string | null;
    floor_number: number | null;
    facility_id: string | null;
    facilities?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
  } | null;
};

function facilityOf(room: NonNullable<ReservationRow["rooms"]>): { id: string; name: string | null; code: string | null } | null {
  const f = room.facilities;
  if (Array.isArray(f)) return f[0] ?? null;
  return f ?? null;
}

function toReservationDto(r: ReservationRow) {
  const room = r.rooms ?? null;
  const fac = room ? facilityOf(room) : null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    expectedAttendees: r.expected_attendees,
    rejectionReason: r.rejection_reason,
    roomId: room?.id ?? null,
    roomName: room?.name ?? null,
    roomNumber: room?.room_number ?? null,
    floorNumber: room?.floor_number ?? null,
    facilityName: fac?.name ?? null,
    facilityCode: fac?.code ?? null,
    createdAt: r.created_at,
  };
}

type VisitorRow = {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  company: string | null;
  id_number: string | null;
  purpose_of_visit: string;
  expected_arrival: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  status: string | null;
  badge_number: string | null;
  created_at: string | null;
};

function toVisitorDto(v: VisitorRow) {
  return {
    id: v.id,
    fullName: v.full_name,
    email: v.email,
    phoneNumber: v.phone_number,
    company: v.company,
    idNumber: v.id_number,
    purposeOfVisit: v.purpose_of_visit,
    expectedArrival: v.expected_arrival,
    actualArrival: v.actual_arrival,
    actualDeparture: v.actual_departure,
    status: v.status,
    badgeNumber: v.badge_number,
    createdAt: v.created_at,
  };
}

type DocumentRow = {
  id: string;
  title: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  status: string | null;
  classification_level: string | null;
  supabase_storage_url: string | null;
  version_number: number | null;
  created_at: string | null;
};

function toDocumentDto(d: DocumentRow) {
  return {
    id: d.id,
    title: d.title,
    fileName: d.file_name,
    fileType: d.file_type,
    fileSize: d.file_size,
    status: d.status,
    classificationLevel: d.classification_level,
    supabaseStorageUrl: d.supabase_storage_url,
    versionNumber: d.version_number,
    createdAt: d.created_at,
  };
}

type RequestRow = {
  id: string;
  requester_id: string | null;
  type: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  decision_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  users?: { id: string; first_name: string | null; last_name: string | null } | { id: string; first_name: string | null; last_name: string | null }[] | null;
};

function toRequestDto(r: RequestRow) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    decisionNotes: r.decision_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toReviewDto(r: RequestRow) {
  const u = Array.isArray(r.users) ? r.users[0] : r.users;
  const requesterName = u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null : null;
  return {
    ...toRequestDto(r),
    requesterId: r.requester_id,
    requesterName,
  };
}

type NotificationRow = {
  id: string;
  title: string;
  message: string | null;
  type: string | null;
  is_read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string | null;
};

function toNotificationDto(n: NotificationRow) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.is_read,
    relatedEntityType: n.related_entity_type,
    relatedEntityId: n.related_entity_id,
    createdAt: n.created_at,
  };
}

function toProfileDto(u: AuthUser["row"]) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    fullName: `${u.first_name} ${u.last_name}`,
    email: u.email,
    phoneNumber: u.phone_number,
    employeeId: u.employee_id,
    department: u.department,
    position: u.position,
    status: u.status,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadReservations(userId: string): Promise<ReservationRow[]> {
  const { data, error } = await db
    .from("reservations")
    .select("*, rooms(name, room_number, floor_number, facility_id, facilities(name, code))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`reservations load failed: ${error.message}`);
  return (data as unknown as ReservationRow[]) ?? [];
}

async function findOwnedReservation(id: string, userId: string): Promise<ReservationRow | null> {
  const { data, error } = await db
    .from("reservations")
    .select("*, rooms(name, room_number, floor_number, facility_id, facilities(name, code))")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`reservation lookup failed: ${error.message}`);
  return data as ReservationRow | null;
}

async function notifyEmployee(
  actorEmail: string | null,
  userId: string,
  type: string,
  title: string,
  message: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  try {
    const { error } = await db.from("employee_notifications").insert({
      recipient_id: userId,
      title,
      message,
      type,
      is_read: false,
      related_entity_type: entityType,
      related_entity_id: entityId,
      created_by: actorEmail,
    });
    if (error) console.error("employee_notification insert failed:", error.message);
  } catch (e) {
    console.error("employee_notification insert threw:", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function handleDashboardSummary(ctx: AuthContext | null, _req: Request) {
  const uid = ctx!.userId;
  const reservations = await loadReservations(uid);
  const { data: requests, error: reqErr } = await db
    .from("employee_requests")
    .select("*")
    .eq("requester_id", uid)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (reqErr) throw new Error(`employee_requests load failed: ${reqErr.message}`);

  const pendingReservations = reservations.filter((r) => r.status === "PENDING").length;
  const approvedReservations = reservations.filter((r) => r.status === "APPROVED").length;
  const rejectedReservations = reservations.filter((r) => r.status === "REJECTED").length;

  const reqList = (requests as unknown as RequestRow[]) ?? [];
  const pendingRequests = reqList.filter((r) => r.status === "PENDING" || r.status === "IN_REVIEW").length;
  const approvedRequests = reqList.filter((r) => r.status === "APPROVED").length;
  const rejectedRequests = reqList.filter((r) => r.status === "REJECTED").length;

  const now = Date.now();
  const upcoming = reservations
    .filter((r) => r.start_time && new Date(r.start_time).getTime() > now)
    .filter((r) => r.status === "PENDING" || r.status === "APPROVED")
    .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime());

  const { count, error: cntErr } = await db
    .from("employee_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", uid)
    .eq("is_read", false)
    .eq("is_deleted", false);
  if (cntErr) throw new Error(`unread count failed: ${cntErr.message}`);
  const unreadNotifications = count ?? 0;

  const { data: recentNotifs, error: rnErr } = await db
    .from("employee_notifications")
    .select("*")
    .eq("recipient_id", uid)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(5);
  if (rnErr) throw new Error(`recent notifications failed: ${rnErr.message}`);

  const summary: Record<string, unknown> = {
    activeRequests: pendingReservations + pendingRequests,
    pendingApprovals: pendingReservations + pendingRequests,
    approvedRequests: approvedReservations + approvedRequests,
    rejectedRequests: rejectedReservations + rejectedRequests,
    upcomingReservations: upcoming.length,
    notifications: unreadNotifications,
    upcomingReservationsList: upcoming.slice(0, 5).map(toReservationDto),
    recentRequests: reqList.slice(0, 5).map(toRequestDto),
    recentNotifications: ((recentNotifs as unknown as NotificationRow[]) ?? []).slice(0, 5).map(toNotificationDto),
  };
  return jsonResponse(ok(summary), 200);
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

async function handleListReservations(ctx: AuthContext | null, _req: Request) {
  const reservations = await loadReservations(ctx!.userId);
  return jsonResponse(ok(reservations.map(toReservationDto), "Reservations retrieved"), 200);
}

async function handleCreateReservation(ctx: AuthContext | null, _req: Request, body: unknown) {
  const req = (body ?? {}) as Record<string, unknown>;
  let roomId: string;
  try {
    roomId = String(req.roomId);
  } catch {
    return businessRule("A valid roomId is required.");
  }
  if (!roomId || roomId === "undefined") return businessRule("A valid roomId is required.");

  const { data: room, error: roomErr } = await db
    .from("rooms")
    .select("id, name, room_number, floor_number, status, active, open_time, close_time, facility_id, facilities(name, code)")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr) throw new Error(`room lookup failed: ${roomErr.message}`);
  if (!room) return notFound(`Room not found with id: '${roomId}'`);

  const roomRow = room as Record<string, unknown> & { active: boolean | null; status: string | null; open_time: string | null; close_time: string | null };
  if (roomRow.active !== true) return businessRule("This room is not active and cannot be reserved.");

  const startRaw = String(req.startTime ?? "");
  const endRaw = String(req.endTime ?? "");
  const start = toUtcIso(startRaw);
  const end = toUtcIso(endRaw);
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return businessRule("End time must be after start time.");
  }
  if (isInPast(start)) {
    return businessRule("Reservation cannot be in the past.");
  }

  if (roomRow.open_time && roomRow.close_time) {
    const withinHours = startRaw.split("T")[1]?.slice(0, 5) >= hhmm(String(roomRow.open_time)).slice(0, 5)
      && endRaw.split("T")[1]?.slice(0, 5) <= hhmm(String(roomRow.close_time)).slice(0, 5);
    if (!withinHours) {
      return businessRule(
        `Selected time is outside the room's operating hours (${String(roomRow.open_time).slice(0, 5)} - ${String(roomRow.close_time).slice(0, 5)}).`,
      );
    }
  }

  const maintenanceBlocked = roomRow.status === "MAINTENANCE" || roomRow.status === "OUT_OF_SERVICE"
    || await hasMaintenanceOverlap(roomId, start, end);
  if (maintenanceBlocked) {
    return businessRule("This room is under maintenance for the selected timeframe.");
  }

  const conflict = await firstConflict(roomId, start, end);
  if (conflict) {
    return businessRule(
      `Room is already reserved for the selected timeframe (${conflict.start_time} - ${conflict.end_time}).`,
    );
  }

  const expectedAttendees = req.expectedAttendees != null
    ? Number.parseInt(String(req.expectedAttendees), 10)
    : null;
  if (req.expectedAttendees != null && Number.isNaN(expectedAttendees)) {
    throw new Error("expectedAttendees must be a number");
  }

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
  }).select("id, room_id, user_id, title, description, start_time, end_time, expected_attendees, status, rejection_reason, created_at")
    .single();
  if (insErr) throw new Error(`reservation insert failed: ${insErr.message}`);

  await writeAudit(ctx!.user, "CREATE_RESERVATION", "EMPLOYEE", "Reservation", (saved as { id: string }).id,
    `Submitted reservation request: ${String(req.title ?? "Room Reservation")}`, resolveClientIp(_req).ip);

  const dto = await findOwnedReservation((saved as { id: string }).id, ctx!.userId);
  return jsonResponse(ok(dto ? toReservationDto(dto) : saved, "Reservation request submitted"), 200);
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

async function firstConflict(roomId: string, start: string, end: string): Promise<{ title: string; start_time: string; end_time: string } | null> {
  const { data, error } = await db
    .from("reservations")
    .select("title, start_time, end_time")
    .eq("room_id", roomId)
    .notIn("status", ["CANCELLED", "REJECTED"])
    .lt("start_time", end)
    .gt("end_time", start)
    .order("start_time", { ascending: true })
    .limit(1);
  if (error) throw new Error(`conflict lookup failed: ${error.message}`);
  return (data?.[0] as { title: string; start_time: string; end_time: string } | undefined) ?? null;
}

async function handleUpdateReservation(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const r = await findOwnedReservation(p.id, ctx!.userId);
  if (!r) return notFound(`Reservation not found with id: '${p.id}'`);
  if (r.status !== "PENDING") {
    return businessRule("Only pending reservations can be modified before approval.");
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  if (b.title != null) fields.title = String(b.title);
  if (b.description != null) fields.description = String(b.description);
  if (b.expectedAttendees != null) {
    const ea = Number.parseInt(String(b.expectedAttendees), 10);
    if (Number.isNaN(ea)) throw new Error("expectedAttendees must be a number");
    fields.expected_attendees = ea;
  }
  if (b.startTime != null) fields.start_time = toUtcIso(String(b.startTime));
  if (b.endTime != null) fields.end_time = toUtcIso(String(b.endTime));

  if (fields.end_time != null && fields.start_time != null && !(fields.end_time > fields.start_time)) {
    return businessRule("End time must be after start time.");
  }
  fields.updated_by = ctx!.email;

  const { data: saved, error: updErr } = await db.from("reservations").update(fields).eq("id", r.id)
    .select("id, room_id, user_id, title, description, start_time, end_time, expected_attendees, status, rejection_reason, created_at")
    .single();
  if (updErr) throw new Error(`reservation update failed: ${updErr.message}`);

  await writeAudit(ctx!.user, "UPDATE_RESERVATION", "EMPLOYEE", "Reservation", r.id,
    `Updated reservation request: ${String(fields.title ?? r.title ?? "")}`, resolveClientIp(_req).ip);

  const dto = await findOwnedReservation(r.id, ctx!.userId);
  return jsonResponse(ok(dto ? toReservationDto(dto) : saved, "Reservation updated"), 200);
}

async function handleCancelReservation(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const r = await findOwnedReservation(p.id, ctx!.userId);
  if (!r) return notFound(`Reservation not found with id: '${p.id}'`);
  if (r.status === "APPROVED" || r.status === "CHECKED_IN" || r.status === "COMPLETED") {
    return businessRule(`A ${String(r.status).toLowerCase()} reservation cannot be cancelled.`);
  }
  const { data: saved, error: updErr } = await db.from("reservations").update({ status: "CANCELLED", updated_by: ctx!.email })
    .eq("id", r.id)
    .select("id, room_id, user_id, title, description, start_time, end_time, expected_attendees, status, rejection_reason, created_at")
    .single();
  if (updErr) throw new Error(`reservation update failed: ${updErr.message}`);

  await writeAudit(ctx!.user, "CANCEL_RESERVATION", "EMPLOYEE", "Reservation", r.id,
    `Cancelled reservation request: ${String(r.title ?? "")}`, resolveClientIp(_req).ip);

  const dto = await findOwnedReservation(r.id, ctx!.userId);
  return jsonResponse(ok(dto ? toReservationDto(dto) : saved, "Reservation cancelled"), 200);
}

// ---------------------------------------------------------------------------
// Rooms (availability search + filters)
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
  facility_id: string | null;
  facilities?: { id: string; name: string | null; code: string | null; type: string | null } | { id: string; name: string | null; code: string | null; type: string | null }[] | null;
};

async function loadActiveRooms(): Promise<RoomRow[]> {
  const { data, error } = await db
    .from("rooms")
    .select("*, facilities(id, name, code, type)")
    .eq("active", true);
  if (error) throw new Error(`rooms load failed: ${error.message}`);
  return (data as unknown as RoomRow[]) ?? [];
}

async function loadAmenityNames(roomIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (roomIds.length === 0) return map;
  const { data, error } = await db
    .from("facility_amenities")
    .select("room_id, name")
    .in("room_id", roomIds);
  if (error) throw new Error(`amenities load failed: ${error.message}`);
  for (const a of (data as { room_id: string; name: string }[]) ?? []) {
    const list = map.get(a.room_id) ?? [];
    list.push(a.name);
    map.set(a.room_id, list);
  }
  return map;
}

function buildRoomMap(room: RoomRow, amenities: string[]): Record<string, unknown> {
  const fac = Array.isArray(room.facilities) ? room.facilities[0] : room.facilities;
  return {
    id: room.id,
    name: room.name,
    roomNumber: room.room_number,
    type: room.type,
    floorNumber: room.floor_number,
    building: room.building,
    capacity: room.capacity,
    openTime: room.open_time,
    closeTime: room.close_time,
    status: room.status,
    hasProjector: room.has_projector,
    hasVideoConference: room.has_video_conference,
    hasWhiteboard: room.has_whiteboard,
    facilityId: room.facility_id,
    facilityName: fac?.name ?? null,
    facilityCode: fac?.code ?? null,
    facilityType: fac?.type ?? null,
    amenities,
  };
}

function withinOperatingHours(room: RoomRow, startHm: string, endHm: string): boolean {
  if (!room.open_time || !room.close_time) return true;
  return startHm >= hhmm(room.open_time).slice(0, 5) && endHm <= hhmm(room.close_time).slice(0, 5);
}

async function handleRoomsAvailable(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const req = (body ?? {}) as Record<string, unknown>;
  const date = String(req.date ?? "");
  const startHm = String(req.startTime ?? "");
  const endHm = String(req.endTime ?? "");
  const start = toUtcIso(`${date}T${startHm}`);
  const end = toUtcIso(`${date}T${endHm}`);

  const facilityId = req.facilityId != null && req.facilityId !== "" ? String(req.facilityId) : null;
  const facilityType = req.facilityType != null && req.facilityType !== "" ? String(req.facilityType) : null;
  const building = req.building != null && req.building !== "" ? String(req.building) : null;
  const floor = req.floor != null ? Number.parseInt(String(req.floor), 10) : null;
  const minCapacity = req.minCapacity != null ? Number.parseInt(String(req.minCapacity), 10) : null;
  const roomType = req.roomType != null && req.roomType !== "" ? String(req.roomType) : null;
  const availability = req.availability != null && req.availability !== "" ? String(req.availability) : null;

  let rooms = await loadActiveRooms();
  rooms = rooms.filter((r) => {
    const fac = Array.isArray(r.facilities) ? r.facilities[0] : r.facilities;
    if (facilityId && r.facility_id !== facilityId) return false;
    if (facilityType && !fac?.type) return false;
    if (facilityType && fac && String(fac.type).toLowerCase() !== facilityType.toLowerCase()) return false;
    if (building && !(r.building && String(r.building).toLowerCase() === building.toLowerCase())) return false;
    if (floor != null && !Number.isNaN(floor) && r.floor_number !== floor) return false;
    if (minCapacity != null && !Number.isNaN(minCapacity) && (r.capacity == null || r.capacity < minCapacity)) return false;
    if (roomType && r.type !== roomType) return false;
    return true;
  });

  const amenityMap = await loadAmenityNames(rooms.map((r) => r.id));

  const items: Record<string, unknown>[] = [];
  let available = 0;
  let occupied = 0;
  let maintenance = 0;
  let outOfService = 0;
  let closed = 0;

  for (const room of rooms) {
    const m = buildRoomMap(room, amenityMap.get(room.id) ?? []);
    const withinHours = withinOperatingHours(room, startHm, endHm);
    const maintOverlap = await hasMaintenanceOverlap(room.id, start, end);
    const maintenanceBlocked = maintOverlap || room.status === "MAINTENANCE" || room.status === "OUT_OF_SERVICE";
    const conflict = await firstConflict(room.id, start, end);

    let status: string;
    if (room.status === "OUT_OF_SERVICE") {
      status = "OUT_OF_SERVICE";
      outOfService++;
    } else if (maintenanceBlocked) {
      status = "MAINTENANCE";
      maintenance++;
    } else if (conflict) {
      status = "OCCUPIED";
      occupied++;
      m.occupiedBy = conflict.title;
      m.occupiedUntil = conflict.end_time;
    } else if (!withinHours) {
      status = "CLOSED";
      closed++;
    } else {
      status = "AVAILABLE";
      available++;
    }

    m.availability = status;
    m.selectable = status === "AVAILABLE";
    m.withinOperatingHours = withinHours;

    if (availability === null || status.toLowerCase() === availability.toLowerCase()) {
      items.push(m);
    }
  }

  const summary = {
    total: rooms.length,
    available,
    occupied,
    maintenance,
    outOfService,
    closed,
    startDateTime: start,
    endDateTime: end,
  };
  return jsonResponse(ok({ summary, rooms: items }, "Available rooms retrieved"), 200);
}

async function handleRoomFilters(_ctx: AuthContext | null, _req: Request) {
  const rooms = await loadActiveRooms();
  const facilities: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const buildings: string[] = [];
  const floors: number[] = [];
  const roomTypes: string[] = [];

  for (const r of rooms) {
    const fac = Array.isArray(r.facilities) ? r.facilities[0] : r.facilities;
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

  const result = {
    facilities,
    buildings,
    floors,
    roomTypes,
    statuses: ["AVAILABLE", "OCCUPIED", "MAINTENANCE", "OUT_OF_SERVICE", "CLOSED"],
  };
  return jsonResponse(ok(result, "Room filters retrieved"), 200);
}

// ---------------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------------

async function loadVisitors(userId: string): Promise<VisitorRow[]> {
  const { data, error } = await db
    .from("visitors")
    .select("*")
    .eq("host_id", userId)
    .order("created_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`visitors load failed: ${error.message}`);
  return (data as unknown as VisitorRow[]) ?? [];
}

async function findOwnedVisitor(id: string, userId: string): Promise<VisitorRow | null> {
  const { data, error } = await db
    .from("visitors")
    .select("*")
    .eq("id", id)
    .eq("host_id", userId)
    .maybeSingle();
  if (error) throw new Error(`visitor lookup failed: ${error.message}`);
  return data as VisitorRow | null;
}

async function handleListVisitors(ctx: AuthContext | null, _req: Request) {
  const visitors = await loadVisitors(ctx!.userId);
  return jsonResponse(ok(visitors.map(toVisitorDto), "Visitors retrieved"), 200);
}

async function handleCreateVisitor(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const fullName = b.fullName != null ? String(b.fullName) : null;
  const email = b.email != null ? String(b.email) : null;
  const purpose = b.purposeOfVisit != null ? String(b.purposeOfVisit) : null;
  const arrivalRaw = b.expectedArrival != null ? String(b.expectedArrival) : null;
  if (fullName === null || fullName.trim() === "") return businessRule("Visitor full name is required.");
  if (email === null || email.trim() === "") return businessRule("Visitor email is required.");
  if (purpose === null || purpose.trim() === "") return businessRule("Purpose of visit is required.");
  if (arrivalRaw === null || arrivalRaw.trim() === "") return businessRule("Expected arrival is required.");

  const { data: saved, error: insErr } = await db.from("visitors").insert({
    full_name: fullName,
    email,
    phone_number: b.phoneNumber != null ? String(b.phoneNumber) : null,
    company: b.company != null ? String(b.company) : null,
    id_number: b.idNumber != null ? String(b.idNumber) : null,
    host_id: ctx!.userId,
    purpose_of_visit: purpose,
    expected_arrival: toUtcIso(arrivalRaw),
    status: "REGISTERED",
    qr_code_token: `VIS-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    created_by: ctx!.email,
  }).select("*").single();
  if (insErr) throw new Error(`visitor insert failed: ${insErr.message}`);

  await writeAudit(ctx!.user, "REGISTER_VISITOR", "EMPLOYEE", "Visitor", (saved as { id: string }).id,
    `Registered visitor: ${fullName}`, resolveClientIp(_req).ip);
  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor registered"), 200);
}

async function handleUpdateVisitor(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const v = await findOwnedVisitor(p.id, ctx!.userId);
  if (!v) return notFound(`Visitor not found with id: '${p.id}'`);
  if (v.status !== "REGISTERED") {
    return businessRule("Only a registered visit can be modified before check-in.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  if (b.fullName != null) fields.full_name = String(b.fullName);
  if (b.email != null) fields.email = String(b.email);
  if (b.phoneNumber != null) fields.phone_number = String(b.phoneNumber);
  if (b.company != null) fields.company = String(b.company);
  if (b.idNumber != null) fields.id_number = String(b.idNumber);
  if (b.purposeOfVisit != null) fields.purpose_of_visit = String(b.purposeOfVisit);
  if (b.expectedArrival != null) fields.expected_arrival = toUtcIso(String(b.expectedArrival));
  fields.updated_by = ctx!.email;

  const { data: saved, error: updErr } = await db.from("visitors").update(fields).eq("id", v.id).select("*").single();
  if (updErr) throw new Error(`visitor update failed: ${updErr.message}`);

  await writeAudit(ctx!.user, "UPDATE_VISITOR", "EMPLOYEE", "Visitor", v.id,
    `Updated visitor: ${String(saved.full_name ?? "")}`, resolveClientIp(_req).ip);
  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor updated"), 200);
}

// ---------------------------------------------------------------------------
// Documents (create + read only)
// ---------------------------------------------------------------------------

async function handleListDocuments(ctx: AuthContext | null, _req: Request) {
  const { data, error } = await db
    .from("documents")
    .select("id, title, file_name, file_type, file_size, status, classification_level, supabase_storage_url, version_number, created_at")
    .eq("created_by", ctx!.email)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`documents load failed: ${error.message}`);
  return jsonResponse(ok(((data as unknown as DocumentRow[]) ?? []).map(toDocumentDto), "Documents retrieved"), 200);
}

async function handleCreateDocument(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = b.title != null ? String(b.title) : null;
  const fileName = b.fileName != null ? String(b.fileName) : null;
  if (title === null || title.trim() === "") return businessRule("Document title is required.");
  if (fileName === null || fileName.trim() === "") return businessRule("A file name is required.");

  let classification = "INTERNAL";
  if (b.classificationLevel != null) {
    classification = String(b.classificationLevel).toUpperCase();
  }

  let fileSize: number | null = null;
  if (b.fileSize != null) {
    const n = Number.parseInt(String(b.fileSize), 10);
    if (!Number.isNaN(n)) fileSize = n;
  }

  const { data: saved, error: insErr } = await db.from("documents").insert({
    title,
    file_name: fileName,
    file_type: b.fileType != null ? String(b.fileType) : null,
    file_size: fileSize,
    classification_level: classification,
    status: "PENDING_REVIEW",
    version_number: 1,
    created_by: ctx!.email,
  }).select("id, title, file_name, file_type, file_size, status, classification_level, supabase_storage_url, version_number, created_at").single();
  if (insErr) throw new Error(`document insert failed: ${insErr.message}`);

  await writeAudit(ctx!.user, "UPLOAD_DOCUMENT", "EMPLOYEE", "Document", (saved as { id: string }).id,
    `Uploaded document: ${title}`, resolveClientIp(_req).ip);
  return jsonResponse(ok(toDocumentDto(saved as unknown as DocumentRow), "Document uploaded"), 200);
}

// ---------------------------------------------------------------------------
// Contract / legal requests
// ---------------------------------------------------------------------------

async function handleListRequests(ctx: AuthContext | null, _req: Request) {
  const { data, error } = await db
    .from("employee_requests")
    .select("*")
    .eq("requester_id", ctx!.userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`employee_requests load failed: ${error.message}`);
  return jsonResponse(ok(((data as unknown as RequestRow[]) ?? []).map(toRequestDto), "Requests retrieved"), 200);
}

async function handleCreateRequest(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = b.title != null ? String(b.title) : null;
  if (title === null || title.trim() === "") return businessRule("Request title is required.");

  let type = "CONTRACT";
  if (b.type != null) type = String(b.type).toUpperCase();

  const { data: saved, error: insErr } = await db.from("employee_requests").insert({
    requester_id: ctx!.userId,
    type,
    title,
    description: b.description != null ? String(b.description) : null,
    status: "PENDING",
    created_by: ctx!.email,
  }).select("*").single();
  if (insErr) throw new Error(`employee_request insert failed: ${insErr.message}`);

  await writeAudit(ctx!.user, "SUBMIT_REQUEST", "EMPLOYEE", "EmployeeRequest", (saved as { id: string }).id,
    `Submitted ${type} request: ${title}`, resolveClientIp(_req).ip);

  await notifyEmployee(ctx!.email, ctx!.userId, "INFO", "Request submitted",
    `Your ${type.toLowerCase()} request "${title}" was submitted and is pending review.`,
    "EmployeeRequest", (saved as { id: string }).id);

  return jsonResponse(ok(toRequestDto(saved as unknown as RequestRow), "Request submitted"), 200);
}

async function handleCancelRequest(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data: r, error } = await db
    .from("employee_requests")
    .select("*")
    .eq("id", p.id)
    .eq("requester_id", ctx!.userId)
    .maybeSingle();
  if (error) throw new Error(`employee_request lookup failed: ${error.message}`);
  if (!r) return notFound(`EmployeeRequest not found with id: '${p.id}'`);
  if (r.status !== "PENDING" && r.status !== "IN_REVIEW") {
    return businessRule("Only pending or in-review requests can be cancelled.");
  }
  const { data: saved, error: updErr } = await db.from("employee_requests")
    .update({ status: "CANCELLED", updated_by: ctx!.email }).eq("id", r.id).select("*").single();
  if (updErr) throw new Error(`employee_request update failed: ${updErr.message}`);

  await writeAudit(ctx!.user, "CANCEL_REQUEST", "EMPLOYEE", "EmployeeRequest", r.id,
    `Cancelled request: ${String(r.title ?? "")}`, resolveClientIp(_req).ip);

  await notifyEmployee(ctx!.email, ctx!.userId, "CANCELLED", "Request Cancelled",
    `Your ${String(r.type ?? "").toLowerCase()} request "${String(r.title ?? "")}" has been cancelled.`,
    "EmployeeRequest", r.id);

  return jsonResponse(ok(toRequestDto(saved as unknown as RequestRow), "Request cancelled"), 200);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function handleListNotifications(ctx: AuthContext | null, _req: Request) {
  const { data, error } = await db
    .from("employee_notifications")
    .select("*")
    .eq("recipient_id", ctx!.userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`employee_notifications load failed: ${error.message}`);
  return jsonResponse(ok(((data as unknown as NotificationRow[]) ?? []).map(toNotificationDto), "Notifications retrieved"), 200);
}

async function handleUnreadCount(ctx: AuthContext | null, _req: Request) {
  const { count, error } = await db
    .from("employee_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", ctx!.userId)
    .eq("is_read", false)
    .eq("is_deleted", false);
  if (error) throw new Error(`unread count failed: ${error.message}`);
  return jsonResponse(ok(count ?? 0, "Unread count retrieved"), 200);
}

async function handleMarkRead(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data: n, error } = await db
    .from("employee_notifications")
    .select("*")
    .eq("id", p.id)
    .eq("recipient_id", ctx!.userId)
    .maybeSingle();
  if (error) throw new Error(`employee_notification lookup failed: ${error.message}`);
  if (!n) return notFound(`EmployeeNotification not found with id: '${p.id}'`);
  const { data: saved, error: updErr } = await db.from("employee_notifications")
    .update({ is_read: true, updated_by: ctx!.email }).eq("id", n.id).select("*").single();
  if (updErr) throw new Error(`employee_notification update failed: ${updErr.message}`);
  return jsonResponse(ok(toNotificationDto(saved as unknown as NotificationRow), "Notification marked as read"), 200);
}

async function handleMarkAllRead(ctx: AuthContext | null, _req: Request) {
  const { error } = await db.from("employee_notifications")
    .update({ is_read: true, updated_by: ctx!.email })
    .eq("recipient_id", ctx!.userId)
    .eq("is_read", false)
    .eq("is_deleted", false);
  if (error) throw new Error(`employee_notifications update-all failed: ${error.message}`);
  return jsonResponse(ok("All notifications marked as read"), 200);
}

async function handleDismissNotification(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data: n, error } = await db
    .from("employee_notifications")
    .select("*")
    .eq("id", p.id)
    .eq("recipient_id", ctx!.userId)
    .maybeSingle();
  if (error) throw new Error(`employee_notification lookup failed: ${error.message}`);
  if (!n) return notFound(`EmployeeNotification not found with id: '${p.id}'`);
  const { error: delErr } = await db.from("employee_notifications")
    .update({ is_deleted: true, deleted_at: nowIso(), deleted_by: ctx!.email, updated_by: ctx!.email })
    .eq("id", n.id);
  if (delErr) throw new Error(`employee_notification delete failed: ${delErr.message}`);
  return jsonResponse(ok("Notification dismissed"), 200);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

async function handleGetProfile(ctx: AuthContext | null, _req: Request) {
  return jsonResponse(ok(toProfileDto(ctx!.user.row), "Profile retrieved"), 200);
}

async function handleUpdateProfile(ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  if (b.firstName != null) fields.first_name = String(b.firstName);
  if (b.lastName != null) fields.last_name = String(b.lastName);
  if (b.phoneNumber != null) fields.phone_number = String(b.phoneNumber);
  if (b.department != null) fields.department = String(b.department);
  if (b.position != null) fields.position = String(b.position);
  if (b.avatarUrl != null) fields.avatar_url = String(b.avatarUrl);
  fields.updated_by = ctx!.email;

  const { data: saved, error: updErr } = await db.from("users").update(fields).eq("id", ctx!.userId).select("id, employee_id, first_name, last_name, email, phone_number, department, position, status").single();
  if (updErr) throw new Error(`profile update failed: ${updErr.message}`);

  await writeAudit(ctx!.user, "UPDATE_PROFILE", "EMPLOYEE", "User", ctx!.userId,
    "Updated own profile", resolveClientIp(_req).ip);
  const row = saved as unknown as AuthUser["row"];
  return jsonResponse(ok(toProfileDto(row), "Profile updated"), 200);
}

// ---------------------------------------------------------------------------
// Request review (SUPER_ADMIN / CONTRACT_OFFICER / LEGAL_OFFICER)
// ---------------------------------------------------------------------------

function canReview(ctx: AuthContext, r: { type: string | null }): boolean {
  if (ctx.roles.includes("SUPER_ADMIN")) return true;
  if (r.type === "CONTRACT" && ctx.roles.includes("CONTRACT_OFFICER")) return true;
  if (r.type === "LEGAL" && ctx.roles.includes("LEGAL_OFFICER")) return true;
  return false;
}

async function loadAllRequestsWithRequester(): Promise<RequestRow[]> {
  const { data, error } = await db
    .from("employee_requests")
    .select("*, users(id, first_name, last_name)")
    .eq("is_deleted", false);
  if (error) throw new Error(`employee_requests load failed: ${error.message}`);
  return (data as unknown as RequestRow[]) ?? [];
}

async function findReviewRequest(id: string): Promise<RequestRow | null> {
  const { data, error } = await db
    .from("employee_requests")
    .select("*, users(id, first_name, last_name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`employee_request lookup failed: ${error.message}`);
  return data as RequestRow | null;
}

async function handleListForReview(ctx: AuthContext | null, _req: Request) {
  const requests = await loadAllRequestsWithRequester();
  const visible = requests
    .filter((r) => canReview(ctx!, r))
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  return jsonResponse(ok(visible.map(toReviewDto), "Requests retrieved"), 200);
}

async function handleListPending(ctx: AuthContext | null, _req: Request) {
  const requests = await loadAllRequestsWithRequester();
  const visible = requests
    .filter((r) => canReview(ctx!, r))
    .filter((r) => r.status === "PENDING" || r.status === "IN_REVIEW")
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  return jsonResponse(ok(visible.map(toReviewDto), "Pending requests retrieved"), 200);
}

async function requireDecidable(ctx: AuthContext, id: string):
  Promise<{ status: "ok"; row: RequestRow } | { status: "notFound" } | { status: "denied" } | { status: "rule" }> {
  const r = await findReviewRequest(id);
  if (!r) return { status: "notFound" };
  if (!canReview(ctx, r)) return { status: "denied" };
  if (r.status !== "PENDING" && r.status !== "IN_REVIEW") return { status: "rule" };
  return { status: "ok", row: r };
}

async function handleApprove(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const res = await requireDecidable(ctx!, p.id);
  if (res.status === "notFound") return notFound(`EmployeeRequest not found with id: '${p.id}'`);
  if (res.status === "denied") return accessDenied();
  if (res.status === "rule") return businessRule("Only pending or in-review requests can be decided.");
  const r = res.row;
  const { data: saved, error } = await db.from("employee_requests")
    .update({ status: "APPROVED", updated_by: ctx!.email }).eq("id", r.id)
    .select("*, users(id, first_name, last_name)").single();
  if (error) throw new Error(`employee_request update failed: ${error.message}`);

  await writeAudit(ctx!.user, "APPROVE_REQUEST", "REQUEST_REVIEW", "EmployeeRequest", r.id,
    `Approved request: ${String(r.title ?? "")}`, resolveClientIp(_req).ip);
  await notifyEmployee(ctx!.email, r.requester_id!, "APPROVAL", "Request Approved",
    `Your ${String(r.type ?? "").toLowerCase()} request "${String(r.title ?? "")}" has been approved.`,
    "EmployeeRequest", r.id);

  return jsonResponse(ok(toReviewDto(saved as unknown as RequestRow), "Request approved"), 200);
}

async function handleReject(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const res = await requireDecidable(ctx!, p.id);
  if (res.status === "notFound") return notFound(`EmployeeRequest not found with id: '${p.id}'`);
  if (res.status === "denied") return accessDenied();
  if (res.status === "rule") return businessRule("Only pending or in-review requests can be decided.");
  const r = res.row;
  const b = (body ?? {}) as Record<string, unknown>;
  const reason = b.reason != null ? String(b.reason) : null;
  const fields: Record<string, unknown> = { status: "REJECTED", updated_by: ctx!.email };
  if (reason !== null && reason.trim() !== "") fields.decision_notes = reason;
  const { data: saved, error } = await db.from("employee_requests")
    .update(fields).eq("id", r.id)
    .select("*, users(id, first_name, last_name)").single();
  if (error) throw new Error(`employee_request update failed: ${error.message}`);

  const auditDesc = reason !== null && reason.trim() !== ""
    ? `Rejected request: ${String(r.title ?? "")} - ${reason}`
    : `Rejected request: ${String(r.title ?? "")}`;
  await writeAudit(ctx!.user, "REJECT_REQUEST", "REQUEST_REVIEW", "EmployeeRequest", r.id,
    auditDesc, resolveClientIp(_req).ip);

  let message = "has been rejected.";
  if (reason !== null && reason.trim() !== "") message += ` Reason: ${reason}`;
  await notifyEmployee(ctx!.email, r.requester_id!, "REJECTION", "Request Rejected",
    `Your ${String(r.type ?? "").toLowerCase()} request "${String(r.title ?? "")}" ${message}`,
    "EmployeeRequest", r.id);

  return jsonResponse(ok(toReviewDto(saved as unknown as RequestRow), "Request rejected"), 200);
}

async function handleComplete(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const r = await findReviewRequest(p.id);
  if (!r) return notFound(`EmployeeRequest not found with id: '${p.id}'`);
  if (!canReview(ctx!, r)) return accessDenied();
  if (r.status !== "APPROVED") {
    return businessRule("Only approved requests can be completed.");
  }
  const { data: saved, error } = await db.from("employee_requests")
    .update({ status: "COMPLETED", updated_by: ctx!.email }).eq("id", r.id)
    .select("*, users(id, first_name, last_name)").single();
  if (error) throw new Error(`employee_request update failed: ${error.message}`);

  await writeAudit(ctx!.user, "COMPLETE_REQUEST", "REQUEST_REVIEW", "EmployeeRequest", r.id,
    `Completed request: ${String(r.title ?? "")}`, resolveClientIp(_req).ip);
  await notifyEmployee(ctx!.email, r.requester_id!, "COMPLETED", "Request Completed",
    `Your ${String(r.type ?? "").toLowerCase()} request "${String(r.title ?? "")}" has been completed.`,
    "EmployeeRequest", r.id);

  return jsonResponse(ok(toReviewDto(saved as unknown as RequestRow), "Request completed"), 200);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/employee/dashboard/summary", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleDashboardSummary },
  { method: "GET", path: "/employee/reservations", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleListReservations },
  { method: "POST", path: "/employee/reservations", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleCreateReservation },
  { method: "PUT", path: "/employee/reservations/:id", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleUpdateReservation },
  { method: "POST", path: "/employee/reservations/:id/cancel", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleCancelReservation },
  { method: "POST", path: "/employee/rooms/available", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleRoomsAvailable },
  { method: "GET", path: "/employee/rooms/filters", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleRoomFilters },
  { method: "GET", path: "/employee/visitors", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleListVisitors },
  { method: "POST", path: "/employee/visitors", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleCreateVisitor },
  { method: "PUT", path: "/employee/visitors/:id", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleUpdateVisitor },
  { method: "GET", path: "/employee/documents", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleListDocuments },
  { method: "POST", path: "/employee/documents", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleCreateDocument },
  { method: "GET", path: "/employee/requests", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleListRequests },
  { method: "POST", path: "/employee/requests", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleCreateRequest },
  { method: "POST", path: "/employee/requests/:id/cancel", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleCancelRequest },
  { method: "GET", path: "/employee/notifications", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleListNotifications },
  { method: "GET", path: "/employee/notifications/unread-count", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleUnreadCount },
  { method: "POST", path: "/employee/notifications/:id/read", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleMarkRead },
  { method: "POST", path: "/employee/notifications/read-all", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleMarkAllRead },
  { method: "POST", path: "/employee/notifications/:id/dismiss", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleDismissNotification },
  { method: "GET", path: "/employee/profile", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleGetProfile },
  { method: "PUT", path: "/employee/profile", guard: { kind: "roles", roles: ["EMPLOYEE"] }, handler: handleUpdateProfile },

  { method: "GET", path: "/requests-review", guard: { kind: "roles", roles: ["SUPER_ADMIN", "CONTRACT_OFFICER", "LEGAL_OFFICER"] }, handler: handleListForReview },
  { method: "GET", path: "/requests-review/pending", guard: { kind: "roles", roles: ["SUPER_ADMIN", "CONTRACT_OFFICER", "LEGAL_OFFICER"] }, handler: handleListPending },
  { method: "POST", path: "/requests-review/:id/approve", guard: { kind: "roles", roles: ["SUPER_ADMIN", "CONTRACT_OFFICER", "LEGAL_OFFICER"] }, handler: handleApprove },
  { method: "POST", path: "/requests-review/:id/reject", guard: { kind: "roles", roles: ["SUPER_ADMIN", "CONTRACT_OFFICER", "LEGAL_OFFICER"] }, handler: handleReject },
  { method: "POST", path: "/requests-review/:id/complete", guard: { kind: "roles", roles: ["SUPER_ADMIN", "CONTRACT_OFFICER", "LEGAL_OFFICER"] }, handler: handleComplete },
] as const;

Deno.serve(createHandler(routes as never, { name: "employee" }));
