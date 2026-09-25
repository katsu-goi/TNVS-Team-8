import { adminDb } from "../_shared/db.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { writeAudit } from "../_shared/lockout.ts";
import type { AuthContext, RouteParams } from "../_shared/guard.ts";
import { parseFacilityType, parseRoomType } from "../_shared/facility-types.ts";

const db = adminDb();
const bucket = "facility-floorplans";
const guard = { kind: "assignedRoles", roles: ["FACILITIES_MANAGER"] } as const;
const reply = (data: unknown, message?: string) => jsonResponse(ok(data, message), 200);
const invalid = (message: string, code = "INVALID_REQUEST") => jsonResponse(fail(message, code), 400);
const conflict = (message: string, code: string) => jsonResponse(fail(message, code), 409);
const missing = () => jsonResponse(fail("Facility not found.", "FACILITY_NOT_FOUND"), 404);
const columns = "id,name,facility_name,code,type,description,capacity,total_capacity,amenities_json,status,active,floor_plan_path,floor_plan_file_name,floor_plan_mime_type,floor_plan_size,created_at,updated_at";
const facilityStatuses = new Set(["AVAILABLE", "MAINTENANCE", "INACTIVE"]);
const roomStatuses = new Set(["AVAILABLE", "VACANT", "OCCUPIED", "RESERVED", "MAINTENANCE", "OUT_OF_SERVICE", "INACTIVE"]);

type Row = Record<string, unknown>;

function audit(ctx: AuthContext | null, action: string, facilityId: string, description: string, severity = "INFO") {
  return writeAudit(ctx?.user ?? null, action, "FACILITIES", "Facility", facilityId, description, ctx?.ip ?? null, severity);
}

async function facilityById(id: string) {
  const { data, error } = await db.from("facilities").select(columns).eq("id", id).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

async function signedFloorPlan(row: Row): Promise<Row> {
  const path = typeof row.floor_plan_path === "string" ? row.floor_plan_path : null;
  if (!path) return { ...row, floor_plan_url: null };
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 900);
  if (error) {
    console.error("floor plan signing failed:", error.message);
    return { ...row, floor_plan_url: null };
  }
  return { ...row, floor_plan_url: data.signedUrl };
}

async function roomIdsForFacility(facilityId: string): Promise<string[]> {
  const { data, error } = await db.from("rooms").select("id").eq("facility_id", facilityId).eq("is_deleted", false);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.id));
}

async function reservationCount(roomIds: string[], facilityId: string): Promise<number> {
  const now = new Date().toISOString();
  const roomQuery = roomIds.length
    ? db.from("reservations").select("id", { count: "exact", head: true }).in("room_id", roomIds).not("status", "in", "(CANCELLED,REJECTED,COMPLETED)").gte("end_time", now)
    : Promise.resolve({ count: 0, error: null });
  const directQuery = db.from("facility_reservations").select("id", { count: "exact", head: true }).eq("facility_id", facilityId).in("status", ["PENDING", "CONFIRMED"]).gte("end_time", now);
  const [rooms, direct] = await Promise.all([roomQuery, directQuery]);
  if (rooms.error) throw rooms.error;
  if (direct.error) throw direct.error;
  return (rooms.count ?? 0) + (direct.count ?? 0);
}

async function enrichFacility(row: Row): Promise<Row> {
  const facilityId = String(row.id);
  const { data: rooms, error } = await db.from("rooms").select("id,capacity,active,status").eq("facility_id", facilityId).eq("is_deleted", false);
  if (error) throw error;
  const roomRows = (rooms ?? []) as Row[];
  const activeRooms = roomRows.filter((room) => room.active !== false && !["INACTIVE", "OUT_OF_SERVICE"].includes(String(room.status ?? "")));
  return signedFloorPlan({
    ...row,
    space_count: roomRows.length,
    active_space_count: activeRooms.length,
    active_capacity: activeRooms.reduce((total, room) => total + Number(room.capacity ?? 0), 0),
    active_reservation_count: await reservationCount(roomRows.map((room) => String(room.id)), facilityId),
  });
}

async function list() {
  const { data, error } = await db.from("facilities").select(columns).eq("is_deleted", false).order("created_at", { ascending: false });
  if (error) throw error;
  return reply(await Promise.all(((data ?? []) as Row[]).map(enrichFacility)));
}

function normalizedFacility(body: unknown) {
  const b = (body ?? {}) as Row;
  const name = String(b.facility_name ?? b.name ?? "").trim();
  const code = String(b.code ?? "").trim().toUpperCase();
  const type = parseFacilityType(b.type);
  const capacity = Number(b.capacity ?? b.total_capacity);
  const active = b.active !== false;
  const status = active ? String(b.status ?? "AVAILABLE").trim().toUpperCase() : "INACTIVE";
  if (!name) return { error: invalid("Facility name is required.") };
  if (!code || !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) return { error: invalid("Facility code is required and must use 2-32 letters, numbers, hyphens, or underscores.") };
  if (!type) return { error: invalid("Select a valid facility type.") };
  if (!facilityStatuses.has(status)) return { error: invalid("Select a supported facility status.") };
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000) return { error: invalid("Capacity must be a whole number between 1 and 100,000.") };
  const amenities = Array.isArray(b.amenities_json)
    ? [...new Set(b.amenities_json.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, 50)
    : [];
  return { payload: {
    name,
    facility_name: name,
    code,
    type,
    description: String(b.description ?? "").trim().slice(0, 2000) || null,
    capacity,
    total_capacity: capacity,
    amenities_json: amenities,
    active,
    status,
  } };
}

async function save(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const normalized = normalizedFacility(body);
  if (normalized.error) return normalized.error;
  const payload = normalized.payload!;
  let duplicate = db.from("facilities").select("id").ilike("code", payload.code).eq("is_deleted", false);
  if (params.id) duplicate = duplicate.neq("id", params.id);
  const { data: existing, error: duplicateError } = await duplicate.limit(1);
  if (duplicateError) throw duplicateError;
  if (existing?.length) return conflict("That facility code is already in use.", "FACILITY_CODE_EXISTS");
  const previous = params.id ? await facilityById(params.id) : null;
  if (params.id && !previous) return missing();
  const actor = ctx?.email ?? null;
  const query = params.id
    ? db.from("facilities").update({ ...payload, updated_at: new Date().toISOString(), updated_by: actor }).eq("id", params.id).eq("is_deleted", false)
    : db.from("facilities").insert({ ...payload, created_by: actor, updated_by: actor });
  const { data, error } = await query.select(columns).maybeSingle();
  if (error) throw error;
  if (!data) return missing();
  await audit(ctx, params.id ? "FACILITY_UPDATED" : "FACILITY_CREATED", String(data.id), `${params.id ? "Updated" : "Created"} facility ${payload.code}.`);
  if (previous && (previous.status !== data.status || previous.active !== data.active)) {
    await audit(ctx, "FACILITY_STATUS_CHANGED", String(data.id), `Changed facility ${payload.code} status from ${String(previous.status)} to ${String(data.status)}.`);
  }
  return reply(await enrichFacility(data as Row), params.id ? "Facility updated." : "Facility created.");
}

async function detail(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const facility = await facilityById(params.id);
  return facility ? reply(await enrichFacility(facility)) : missing();
}

async function status(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const active = (body as { active?: unknown })?.active;
  if (typeof active !== "boolean") return invalid("An active flag is required.");
  const { data, error } = await db.from("facilities").update({ active, status: active ? "AVAILABLE" : "INACTIVE", updated_at: new Date().toISOString(), updated_by: ctx?.email ?? null }).eq("id", params.id).eq("is_deleted", false).select(columns).maybeSingle();
  if (error) throw error;
  if (!data) return missing();
  await audit(ctx, active ? "FACILITY_ACTIVATED" : "FACILITY_ARCHIVED", params.id, `${active ? "Activated" : "Archived"} facility ${String(data.code ?? data.name)}.`, active ? "INFO" : "WARNING");
  return reply(await enrichFacility(data as Row));
}

async function upload(ctx: AuthContext | null, req: Request, _body: unknown, params: RouteParams) {
  const facility = await facilityById(params.id);
  if (!facility) return missing();
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024) return invalid("A non-empty image of at most 5 MB is required.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  const extension = png && file.type === "image/png" ? "png" : jpg && file.type === "image/jpeg" ? "jpg" : webp && file.type === "image/webp" ? "webp" : null;
  if (!extension) return invalid("Use a valid PNG, JPEG, or WebP image.");
  const path = `facilities/${params.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await db.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const previousPath = typeof facility.floor_plan_path === "string" ? facility.floor_plan_path : null;
  const { data, error } = await db.from("facilities").update({
    floor_plan_path: path,
    floor_plan_file_name: file.name.slice(0, 255),
    floor_plan_mime_type: file.type,
    floor_plan_size: file.size,
    floor_plan_url: null,
    updated_at: new Date().toISOString(),
    updated_by: ctx?.email ?? null,
  }).eq("id", params.id).select(columns).single();
  if (error) {
    await db.storage.from(bucket).remove([path]);
    throw error;
  }
  if (previousPath) await db.storage.from(bucket).remove([previousPath]);
  await audit(ctx, "FACILITY_FLOOR_PLAN_UPDATED", params.id, `Updated floor plan for facility ${String(data.code ?? data.name)}.`);
  return reply(await signedFloorPlan(data as Row));
}

async function removeFloorPlan(ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const facility = await facilityById(params.id);
  if (!facility) return missing();
  const path = typeof facility.floor_plan_path === "string" ? facility.floor_plan_path : null;
  const { error } = await db.from("facilities").update({ floor_plan_path: null, floor_plan_file_name: null, floor_plan_mime_type: null, floor_plan_size: null, floor_plan_url: null, updated_at: new Date().toISOString(), updated_by: ctx?.email ?? null }).eq("id", params.id);
  if (error) throw error;
  if (path) await db.storage.from(bucket).remove([path]);
  await audit(ctx, "FACILITY_FLOOR_PLAN_REMOVED", params.id, `Removed floor plan for facility ${String(facility.code ?? facility.name)}.`);
  return reply({ id: params.id });
}

async function spaces(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const { data, error } = await db.from("rooms").select("id,facility_id,name,room_number,building,floor,floor_number,capacity,type,status,equipment,is_available,description,active,created_at,updated_at").eq("facility_id", params.id).eq("is_deleted", false).order("name");
  if (error) throw error;
  return reply(data ?? []);
}

function normalizedSpace(body: unknown) {
  const b = (body ?? {}) as Row;
  const name = String(b.name ?? "").trim();
  const roomNumber = String(b.room_number ?? b.roomNumber ?? "").trim();
  const capacity = Number(b.capacity);
  const type = parseRoomType(b.type);
  const status = String(b.status ?? "AVAILABLE").trim().toUpperCase();
  if (!name || !roomNumber) return { error: invalid("Space name and room number are required.") };
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000) return { error: invalid("Space capacity must be a whole number between 1 and 10,000.") };
  if (!type) return { error: invalid("Select a valid room or space type.") };
  if (!roomStatuses.has(status)) return { error: invalid("Select a supported space status.") };
  return { payload: {
    name,
    room_number: roomNumber,
    building: String(b.building ?? "").trim() || null,
    floor: String(b.floor ?? "").trim() || null,
    floor_number: b.floor_number == null && b.floorNumber == null ? null : Number(b.floor_number ?? b.floorNumber),
    capacity,
    type,
    status,
    description: String(b.description ?? "").trim().slice(0, 2000) || null,
    active: b.active !== false,
    is_available: !["OCCUPIED", "RESERVED", "MAINTENANCE", "OUT_OF_SERVICE", "INACTIVE"].includes(status),
  } };
}

async function saveSpace(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const normalized = normalizedSpace(body);
  if (normalized.error) return normalized.error;
  const payload = normalized.payload!;
  const query = params.spaceId
    ? db.from("rooms").update({ ...payload, updated_at: new Date().toISOString(), updated_by: ctx?.email ?? null }).eq("id", params.spaceId).eq("facility_id", params.id).eq("is_deleted", false)
    : db.from("rooms").insert({ ...payload, facility_id: params.id, created_by: ctx?.email ?? null, updated_by: ctx?.email ?? null });
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  if (!data) return jsonResponse(fail("Space not found in this facility.", "SPACE_NOT_FOUND"), 404);
  await audit(ctx, params.spaceId ? "FACILITY_SPACE_UPDATED" : "FACILITY_SPACE_CREATED", params.id, `${params.spaceId ? "Updated" : "Created"} space ${payload.room_number}.`);
  return reply(data);
}

async function reservations(_ctx: AuthContext | null, req: Request, _body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const roomIds = await roomIdsForFacility(params.id);
  const statusFilter = new URL(req.url).searchParams.get("status")?.trim().toUpperCase();
  let roomQuery = db.from("reservations").select("id,room_id,title,purpose,start_time,end_time,expected_attendees,status,employee_name,employee_email,created_at,rooms(name,room_number)").order("start_time", { ascending: false });
  roomQuery = roomQuery.in("room_id", roomIds.length ? roomIds : ["00000000-0000-0000-0000-000000000000"]);
  let directQuery = db.from("facility_reservations").select("id,facility_id,title,start_time,end_time,notes,status,created_at").eq("facility_id", params.id).order("start_time", { ascending: false });
  if (statusFilter === "UPCOMING") {
    const now = new Date().toISOString();
    roomQuery = roomQuery.gte("start_time", now);
    directQuery = directQuery.gte("start_time", now);
  } else if (statusFilter === "TODAY") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    roomQuery = roomQuery.gte("start_time", start.toISOString()).lt("start_time", end.toISOString());
    directQuery = directQuery.gte("start_time", start.toISOString()).lt("start_time", end.toISOString());
  } else if (statusFilter && statusFilter !== "ALL") {
    roomQuery = roomQuery.eq("status", statusFilter);
    directQuery = directQuery.eq("status", statusFilter);
  }
  const [roomResult, directResult] = await Promise.all([roomQuery, directQuery]);
  if (roomResult.error) throw roomResult.error;
  if (directResult.error) throw directResult.error;
  return reply([
    ...(roomResult.data ?? []).map((row) => ({ ...row, source: "ROOM" })),
    ...(directResult.data ?? []).map((row) => ({ ...row, source: "FACILITY" })),
  ].sort((a, b) => String(b.start_time).localeCompare(String(a.start_time))));
}

async function assets(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const roomIds = await roomIdsForFacility(params.id);
  if (!roomIds.length) return reply([]);
  const { data, error } = await db.from("equipment").select("id,room_id,name,serial_number,category,status,last_maintenance_date,next_maintenance_date,created_at,rooms(name,room_number)").in("room_id", roomIds).eq("is_deleted", false).order("name");
  if (error) throw error;
  return reply(data ?? []);
}

async function maintenance(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const roomIds = await roomIdsForFacility(params.id);
  if (!roomIds.length) return reply([]);
  const { data, error } = await db.from("maintenance_schedules").select("id,room_id,title,description,start_time,end_time,status,assigned_to,notes,created_at,rooms(name,room_number)").in("room_id", roomIds).eq("is_deleted", false).order("start_time", { ascending: false });
  if (error) throw error;
  return reply(data ?? []);
}

async function activity(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const { data, error } = await db.from("audit_logs").select("id,action,description,severity,status,user_email,user_full_name,created_at").eq("module", "FACILITIES").eq("entity_type", "Facility").eq("entity_id", params.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return reply(data ?? []);
}

async function pins(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const { data, error } = await db.from("facility_pins").select("*").eq("facility_id", params.id).order("created_at");
  if (error) throw error;
  return reply(data ?? []);
}

async function savePin(ctx: AuthContext | null, req: Request, body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const b = (body ?? {}) as Row;
  const x = Number(b.x), y = Number(b.y), title = String(b.title ?? "").trim();
  if (!title || title.length > 120 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return invalid("A title and coordinates between 0 and 100 are required.");
  const payload = { x, y, title, description: String(b.description ?? "").trim().slice(0, 1000) || null, image_url: String(b.imageUrl ?? "").trim().slice(0, 2000) || null };
  const query = req.method === "POST"
    ? db.from("facility_pins").insert({ ...payload, facility_id: params.id })
    : db.from("facility_pins").update(payload).eq("id", params.pinId).eq("facility_id", params.id);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  if (!data) return jsonResponse(fail("Floor-plan pin not found in this facility.", "PIN_NOT_FOUND"), 404);
  await audit(ctx, req.method === "POST" ? "FACILITY_PIN_CREATED" : "FACILITY_PIN_UPDATED", params.id, `${req.method === "POST" ? "Created" : "Updated"} floor-plan pin ${title}.`);
  return reply(data);
}

async function deletePin(ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  if (!await facilityById(params.id)) return missing();
  const { data, error } = await db.from("facility_pins").delete().eq("id", params.pinId).eq("facility_id", params.id).select("id,title").maybeSingle();
  if (error) throw error;
  if (!data) return jsonResponse(fail("Floor-plan pin not found in this facility.", "PIN_NOT_FOUND"), 404);
  await audit(ctx, "FACILITY_PIN_DELETED", params.id, `Deleted floor-plan pin ${String(data.title ?? "")}.`, "WARNING");
  return reply({ id: data.id });
}

export const managementRoutes = [
  { method: "GET", path: "/facilities/management", guard, handler: list },
  { method: "POST", path: "/facilities/management", guard, handler: save },
  { method: "GET", path: "/facilities/management/:id", guard, handler: detail },
  { method: "PATCH", path: "/facilities/management/:id", guard, handler: save },
  { method: "PUT", path: "/facilities/management/:id", guard, handler: save },
  { method: "POST", path: "/facilities/management/:id/status", guard, handler: status },
  { method: "POST", path: "/facilities/management/:id/floor-plan", guard, handler: upload },
  { method: "DELETE", path: "/facilities/management/:id/floor-plan", guard, handler: removeFloorPlan },
  { method: "GET", path: "/facilities/management/:id/spaces", guard, handler: spaces },
  { method: "POST", path: "/facilities/management/:id/spaces", guard, handler: saveSpace },
  { method: "PATCH", path: "/facilities/management/:id/spaces/:spaceId", guard, handler: saveSpace },
  { method: "GET", path: "/facilities/management/:id/reservations", guard, handler: reservations },
  { method: "GET", path: "/facilities/management/:id/assets", guard, handler: assets },
  { method: "GET", path: "/facilities/management/:id/maintenance", guard, handler: maintenance },
  { method: "GET", path: "/facilities/management/:id/activity", guard, handler: activity },
  { method: "GET", path: "/facilities/management/:id/pins", guard, handler: pins },
  { method: "POST", path: "/facilities/management/:id/pins", guard, handler: savePin },
  { method: "PATCH", path: "/facilities/management/:id/pins/:pinId", guard, handler: savePin },
  { method: "DELETE", path: "/facilities/management/:id/pins/:pinId", guard, handler: deletePin },
] as const;
