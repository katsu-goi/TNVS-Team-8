import { adminDb } from "../_shared/db.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import type { AuthContext, RouteParams } from "../_shared/guard.ts";

const db = adminDb();
const bucket = "facility-floorplans";
const guard = { kind: "assignedRoles", roles: ["FACILITIES_MANAGER"] } as const;
const reply = (data: unknown) => jsonResponse(ok(data), 200);
const invalid = (message: string) => jsonResponse(fail(message, "INVALID_REQUEST"), 400);
const missing = () => jsonResponse(fail("Resource not found", "RESOURCE_NOT_FOUND"), 404);
const columns = "id,name,facility_name,code,type,capacity,total_capacity,amenities_json,status,active,floor_plan_url,created_at";

async function list() {
  const { data, error } = await db.from("facilities").select(columns).order("created_at", { ascending: false });
  if (error) throw error;
  return reply(data);
}

async function save(_ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = String(b.facility_name ?? "").trim();
  const capacity = Number(b.capacity);
  if (!name || !Number.isSafeInteger(capacity) || capacity < 1) return invalid("Name and positive whole-number capacity are required.");
  const payload = {
    name, facility_name: name, code: String(b.code ?? "").trim() || null,
    type: String(b.type ?? "MEETING_ROOM"), capacity, total_capacity: capacity,
    amenities_json: Array.isArray(b.amenities_json) ? b.amenities_json.filter(x => typeof x === "string") : [],
    active: b.active !== false, status: b.active === false ? "INACTIVE" : String(b.status ?? "AVAILABLE"),
    ...(b.floor_plan_url !== undefined ? { floor_plan_url: b.floor_plan_url == null ? null : String(b.floor_plan_url) } : {}),
  };
  const query = params.id
    ? db.from("facilities").update(payload).eq("id", params.id)
    : db.from("facilities").insert(payload);
  const { data, error } = await query.select(columns).maybeSingle();
  if (error) throw error;
  return data ? reply(data) : missing();
}

async function status(_ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const active = (body as { active?: unknown })?.active;
  if (typeof active !== "boolean") return invalid("An active flag is required.");
  const { data, error } = await db.from("facilities").update({ active, status: active ? "AVAILABLE" : "INACTIVE" }).eq("id", params.id).select("id").maybeSingle();
  if (error) throw error;
  return data ? reply(data) : missing();
}

async function upload(_ctx: AuthContext | null, req: Request, _body: unknown, params: RouteParams) {
  const { data: facility, error: lookupError } = await db.from("facilities").select("id").eq("id", params.id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!facility) return missing();
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size > 5 * 1024 * 1024) return invalid("An image of at most 5 MB is required.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  const extension = png && file.type === 'image/png' ? 'png' : jpg && file.type === 'image/jpeg' ? 'jpg' : webp && file.type === 'image/webp' ? 'webp' : null;
  if (!extension) return invalid("Use a valid PNG, JPEG, or WebP image.");
  const path = `facilities/${params.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) throw error;
  return reply({ url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl });
}

async function pins(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const { data, error } = await db.from("facility_pins").select("*").eq("facility_id", params.id).order("created_at");
  if (error) throw error;
  return reply(data);
}

async function savePin(_ctx: AuthContext | null, req: Request, body: unknown, params: RouteParams) {
  const b = (body ?? {}) as Record<string, unknown>;
  const x = Number(b.x), y = Number(b.y), title = String(b.title ?? "").trim();
  if (!title || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return invalid("A title and coordinates between 0 and 100 are required.");
  const payload = { x, y, title, description: String(b.description ?? "").trim() || null, image_url: String(b.imageUrl ?? "").trim() || null };
  const query = req.method === "POST"
    ? db.from("facility_pins").insert({ ...payload, facility_id: params.id })
    : db.from("facility_pins").update(payload).eq("id", params.id);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  return data ? reply(data) : missing();
}

async function deletePin(_ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const { data, error } = await db.from("facility_pins").delete().eq("id", params.id).select("id").maybeSingle();
  if (error) throw error;
  return data ? reply(data) : missing();
}

export const managementRoutes = [
  { method: "GET", path: "/facilities/management", guard, handler: list },
  { method: "POST", path: "/facilities/management", guard, handler: save },
  { method: "PUT", path: "/facilities/management/:id", guard, handler: save },
  { method: "POST", path: "/facilities/management/:id/status", guard, handler: status },
  { method: "POST", path: "/facilities/management/:id/floor-plan", guard, handler: upload },
  { method: "GET", path: "/facilities/management/:id/pins", guard, handler: pins },
  { method: "POST", path: "/facilities/management/:id/pins", guard, handler: savePin },
  { method: "PUT", path: "/facilities/management/pins/:id", guard, handler: savePin },
  { method: "DELETE", path: "/facilities/management/pins/:id", guard, handler: deletePin },
] as const;
