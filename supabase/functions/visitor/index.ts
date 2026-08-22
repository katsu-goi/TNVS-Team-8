import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";

const db = adminDb();

const MODULE = "VISITOR";

function emptyNotFound() {
  return new Response(null, { status: 404 });
}

function badRequest(message: string, errorCode: string) {
  return jsonResponse(fail(message, errorCode), 400);
}

/** Interprets a naive LocalDateTime as UTC (matches Spring's naive persistence). */
function toUtcIso(s: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).toISOString();
  const naive = s.includes("T") ? s : `${s}T00:00:00`;
  return naive + "Z";
}

// ---------------------------------------------------------------------------
// Visitor serialization (mirrors Spring Visitor entity with EAGER host User)
// ---------------------------------------------------------------------------

type VisitorRow = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  company: string | null;
  id_number: string | null;
  purpose_of_visit: string;
  expected_arrival: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  status: string | null;
  qr_code_token: string | null;
  badge_number: string | null;
  host_id: string | null;
  users?: HostUser | null;
};

type HostUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  employee_id: string | null;
  department: string | null;
  position: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  status: string | null;
};

function hostOf(v: VisitorRow): HostUser | null {
  return v.users ?? null;
}

function toVisitorDto(v: VisitorRow) {
  const h = hostOf(v);
  return {
    id: v.id,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
    createdBy: v.created_by,
    updatedBy: v.updated_by,
    deleted: v.is_deleted,
    deletedAt: v.deleted_at,
    deletedBy: v.deleted_by,
    fullName: v.full_name,
    email: v.email,
    phoneNumber: v.phone_number,
    company: v.company,
    idNumber: v.id_number,
    host: h
      ? {
          id: h.id,
          createdAt: null,
          updatedAt: null,
          createdBy: null,
          updatedBy: null,
          deleted: false,
          deletedAt: null,
          deletedBy: null,
          employeeId: h.employee_id,
          firstName: h.first_name,
          lastName: h.last_name,
          fullName: h.first_name && h.last_name
            ? `${h.first_name} ${h.last_name}`.trim()
            : null,
          email: h.email,
          phoneNumber: h.phone_number,
          department: h.department,
          position: h.position,
          avatarUrl: h.avatar_url,
          status: h.status,
          emailVerified: false,
          emailVerifiedAt: null,
          lastLoginAt: null,
          lastLoginIp: null,
          failedLoginAttempts: 0,
          lastFailedAttemptAt: null,
          lockedUntil: null,
          roles: [],
        }
      : null,
    purposeOfVisit: v.purpose_of_visit,
    expectedArrival: v.expected_arrival,
    actualArrival: v.actual_arrival,
    actualDeparture: v.actual_departure,
    status: v.status,
    qrCodeToken: v.qr_code_token,
    badgeNumber: v.badge_number,
  };
}

async function loadVisitor(id: string): Promise<VisitorRow | null> {
  const { data, error } = await db
    .from("visitors")
    .select(
      "*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`visitor lookup failed: ${error.message}`);
  return (data as unknown as VisitorRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Verification helpers (port of VisitorVerificationService)
// ---------------------------------------------------------------------------

const DRIVERS_LICENSE = /^[A-Z]\d{9,10}$/;
const GENERIC_ID = /^[A-Z0-9]{6,}$/;

function normalize(raw: string | null): string {
  if (raw == null) return "";
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function matchesFormat(type: string, normalized: string): boolean {
  if (normalized.length === 0) return false;
  return type === "DRIVERS_LICENSE"
    ? DRIVERS_LICENSE.test(normalized)
    : GENERIC_ID.test(normalized);
}

function nameMatches(watchlistName: string | null, visitorName: string | null): boolean {
  if (watchlistName == null || visitorName == null) return false;
  const a = watchlistName.trim().toLowerCase();
  const b = visitorName.trim().toLowerCase();
  if (a.length < 4 || b.length < 4) return false;
  return a.includes(b) || b.includes(a);
}

type WatchlistRow = {
  id: string;
  full_name: string;
  id_number: string | null;
  reason: string | null;
  status: string;
  created_at: string | null;
};

function toWatchlistDto(w: WatchlistRow) {
  return {
    id: w.id,
    fullName: w.full_name,
    idNumber: w.id_number,
    reason: w.reason,
    status: w.status,
    createdAt: w.created_at,
  };
}

function toVerificationDto(v: VerificationRow) {
  return {
    id: v.id,
    visitorId: v.visitor_id,
    idType: v.id_type,
    idNumber: v.id_number,
    extractedFields: v.extracted_fields ?? {},
    matchScore: v.match_score != null ? Number(v.match_score) : null,
    watchlistStatus: v.watchlist_status,
    verificationStatus: v.verification_status,
    verifiedAt: v.verified_at,
    verifiedBy: v.verified_by,
    notes: v.notes,
    createdAt: v.created_at,
  };
}

type VerificationRow = {
  id: string;
  visitor_id: string;
  id_type: string | null;
  id_number: string | null;
  extracted_fields: Record<string, unknown> | null;
  match_score: string | number | null;
  watchlist_status: string;
  verification_status: string;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string | null;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleListVisitors() {
  const { data, error } = await db
    .from("visitors")
    .select(
      "*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`visitors load failed: ${error.message}`);
  const rows = (data as unknown as VisitorRow[]) ?? [];
  return jsonResponse(ok(rows.map(toVisitorDto), "Visitors list retrieved"), 200);
}

async function handleRegister(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const fullName = typeof b.fullName === "string" ? b.fullName : null;
  const email = typeof b.email === "string" ? b.email : "";
  const hostId = typeof b.hostId === "string"
    ? b.hostId
    : typeof (b.host as { id?: unknown } | undefined)?.id === "string"
      ? (b.host as { id: string }).id
      : null;

  const { data: saved, error } = await db.from("visitors").insert({
    full_name: fullName,
    email,
    phone_number: typeof b.phoneNumber === "string" ? b.phoneNumber : null,
    company: typeof b.company === "string" ? b.company : null,
    id_number: typeof b.idNumber === "string" ? b.idNumber : null,
    host_id: hostId,
    purpose_of_visit: typeof b.purposeOfVisit === "string" ? b.purposeOfVisit : null,
    expected_arrival: typeof b.expectedArrival === "string"
      ? toUtcIso(b.expectedArrival)
      : null,
    status: "REGISTERED",
    qr_code_token: "QR-" + crypto.randomUUID().substring(0, 8).toUpperCase(),
    badge_number: typeof b.badgeNumber === "string" ? b.badgeNumber : null,
    updated_at: naiveIso(),
  }).select(
    "*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)",
  ).single();
  if (error) throw new Error(`visitor register failed: ${error.message}`);

  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor registered and pass generated"), 200);
}

async function handleCheckIn(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const v = await loadVisitor(p.id);
  if (!v) return emptyNotFound();

  const { data: saved, error } = await db.from("visitors")
    .update({
      status: "CHECKED_IN",
      actual_arrival: new Date().toISOString(),
      updated_at: naiveIso(),
    })
    .eq("id", p.id)
    .select(
      "*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)",
    )
    .single();
  if (error) throw new Error(`visitor check-in failed: ${error.message}`);

  // Side effect only - never throws, response shape unchanged.
  await notifyHostOfArrival(saved as unknown as VisitorRow);

  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor checked in"), 200);
}

async function handleCheckOut(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const v = await loadVisitor(p.id);
  if (!v) return emptyNotFound();

  const { data: saved, error } = await db.from("visitors")
    .update({
      status: "CHECKED_OUT",
      actual_departure: new Date().toISOString(),
      updated_at: naiveIso(),
    })
    .eq("id", p.id)
    .select(
      "*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)",
    )
    .single();
  if (error) throw new Error(`visitor check-out failed: ${error.message}`);

  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor checked out"), 200);
}

async function handleVerify(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const idType = parseIdType((body as Record<string, unknown> | null)?.idType);
  const rawNumber = (body as Record<string, unknown> | null)?.idNumber;
  const idNumber = rawNumber == null ? null : String(rawNumber);

  const result = await verify(p.id, idType, idNumber, ctx);
  if (!result) return emptyNotFound();

  const message = result.watchlist_status === "FLAGGED"
    ? "Visitor FLAGGED - watchlist match, security alert raised"
    : "Visitor verified - no watchlist match";
  return jsonResponse(ok(toVerificationDto(result), message), 200);
}

async function handleVerifications(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db.from("visitor_verifications")
    .select("*")
    .eq("visitor_id", p.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`verifications load failed: ${error.message}`);
  const rows = (data as unknown as VerificationRow[]) ?? [];
  return jsonResponse(ok(rows.map(toVerificationDto), "Verification history retrieved"), 200);
}

async function handleListWatchlist() {
  const { data, error } = await db.from("visitor_watchlist")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`watchlist load failed: ${error.message}`);
  const rows = (data as unknown as WatchlistRow[]) ?? [];
  return jsonResponse(ok(rows.map(toWatchlistDto), "Visitor watchlist retrieved"), 200);
}

async function handleAddWatchlist(ctx: AuthContext | null, _req: Request, body: unknown) {
  try {
    const b = (body ?? {}) as Record<string, unknown>;
    const fullName = typeof b.fullName === "string" ? b.fullName : null;
    if (fullName == null || fullName.trim() === "") {
      throw new Error("fullName is required");
    }
    const rawId = typeof b.idNumber === "string" ? b.idNumber : null;
    const reason = typeof b.reason === "string" ? b.reason : null;

    const { data: saved, error } = await db.from("visitor_watchlist").insert({
      full_name: fullName.trim(),
      id_number: rawId != null && rawId.trim() !== "" ? rawId.trim() : null,
      reason,
      status: "ACTIVE",
      created_at: naiveIso(),
      updated_at: naiveIso(),
    }).select("*").single();
    if (error) throw new Error(`watchlist insert failed: ${error.message}`);

    await writeAudit(ctx?.user ?? null, "ADD_VISITOR_WATCHLIST", MODULE, "VisitorWatchlist",
      (saved as { id: string }).id,
      `Added '${saved.full_name}' to the visitor watchlist. Reason: ${reason ?? "not recorded"}`,
      ctx ? resolveClientIp(_req).ip : null, "INFO");

    return jsonResponse(ok(toWatchlistDto(saved as unknown as WatchlistRow), "Watchlist entry added"), 200);
  } catch (e) {
    return badRequest((e as Error).message, "VALIDATION_ERROR");
  }
}

async function handleWatchlistStatus(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  try {
    const b = (body ?? {}) as Record<string, unknown>;
    const rawStatus = typeof b.status === "string" ? b.status : null;
    const next = (rawStatus ?? "").trim().toUpperCase();
    if (next !== "ACTIVE" && next !== "INACTIVE") {
      throw new Error("status must be ACTIVE or INACTIVE");
    }

    const { data: existing, error: findErr } = await db.from("visitor_watchlist")
      .select("*").eq("id", p.id).maybeSingle();
    if (findErr) throw new Error(`watchlist lookup failed: ${findErr.message}`);
    if (!existing) throw new Error(`Watchlist entry not found: ${p.id}`);

    const previous = existing.status as string;
    const { data: saved, error } = await db.from("visitor_watchlist")
      .update({ status: next, updated_at: naiveIso() })
      .eq("id", p.id)
      .select("*")
      .single();
    if (error) throw new Error(`watchlist update failed: ${error.message}`);

    await writeAudit(ctx?.user ?? null, "UPDATE_VISITOR_WATCHLIST", MODULE, "VisitorWatchlist", p.id,
      `Watchlist entry '${saved.full_name}' changed from ${previous} to ${next}`,
      ctx ? resolveClientIp(_req).ip : null, "INFO");

    return jsonResponse(ok(toWatchlistDto(saved as unknown as WatchlistRow), "Watchlist entry updated"), 200);
  } catch (e) {
    return badRequest((e as Error).message, "VALIDATION_ERROR");
  }
}

// ---------------------------------------------------------------------------
// Verification core (port of VisitorVerificationService.verify)
// ---------------------------------------------------------------------------

async function verify(
  visitorId: string,
  idType: string | null,
  idNumber: string | null,
  actor: AuthContext | null,
): Promise<VerificationRow | null> {
  const visitor = await loadVisitor(visitorId);
  if (!visitor) return null;

  const resolvedType = idType != null ? idType : "OTHER";
  const presented = idNumber != null && idNumber.trim() !== ""
    ? idNumber.trim()
    : visitor.id_number ?? "";

  const normalized = normalize(presented);
  const parses = matchesFormat(resolvedType, normalized);

  // --- Screen against the active watchlist ---------------------------
  const { data: activeRows, error: wlErr } = await db.from("visitor_watchlist")
    .select("*")
    .eq("status", "ACTIVE")
    .eq("is_deleted", false);
  if (wlErr) throw new Error(`watchlist screen failed: ${wlErr.message}`);
  const active = (activeRows as unknown as WatchlistRow[]) ?? [];

  let idHit: WatchlistRow | null = null;
  if (normalized.length > 0) {
    idHit = active.find((w) => normalized === normalize(w.id_number)) ?? null;
  }

  let nameHit: WatchlistRow | null = null;
  if (idHit == null) {
    nameHit = active.find((w) => nameMatches(w.full_name, visitor.full_name)) ?? null;
  }

  let watchlistStatus: string;
  let score: number;
  let notes: string;

  if (idHit != null) {
    watchlistStatus = "FLAGGED";
    score = 0.99;
    notes = `Watchlist ID match: '${idHit.full_name}'. Reason: ${idHit.reason ?? "not recorded"}`;
  } else if (nameHit != null) {
    watchlistStatus = "FLAGGED";
    score = 0.8;
    notes = `Watchlist name match: '${nameHit.full_name}'. Reason: ${nameHit.reason ?? "not recorded"}. ID number did not match - confirm identity manually.`;
  } else {
    watchlistStatus = "CLEAR";
    score = Math.min(0.4 + (parses ? 0.3 : 0), 0.95);
    notes = normalized.length === 0
      ? "No watchlist match. No ID number was presented, so the score reflects name screening only."
      : parses
        ? `No watchlist match. ID number matches the expected ${resolvedType} format.`
        : `No watchlist match. ID number does not match the expected ${resolvedType} format - inspect the physical ID.`;
  }
  score = Math.round(score * 100) / 100;

  const extractedFields = buildExtractedFields(visitor, resolvedType, presented, normalized, parses);
  const now = naiveIso();

  const { data: saved, error } = await db.from("visitor_verifications").insert({
    visitor_id: visitor.id,
    id_type: resolvedType,
    id_number: presented,
    extracted_fields: extractedFields,
    match_score: score,
    watchlist_status: watchlistStatus,
    verification_status: "VERIFIED",
    verified_at: now,
    verified_by: actor ? actor.email : "system",
    notes,
    created_at: now,
    updated_at: now,
  }).select("*").single();
  if (error) throw new Error(`verification insert failed: ${error.message}`);
  const result = saved as unknown as VerificationRow;

  if (watchlistStatus === "FLAGGED") {
    await raiseWatchlistAlert(visitor, result, notes);
  }

  await writeAudit(actor?.user ?? null, "VERIFY_VISITOR", MODULE, "Visitor", visitor.id,
    `Verified visitor '${visitor.full_name}' (${resolvedType}): ${watchlistStatus}, score ${result.match_score}. ${notes}`,
    actor ? actor.ip : null, "INFO");

  return result;
}

function buildExtractedFields(
  visitor: VisitorRow,
  type: string,
  presented: string,
  normalized: string,
  parses: boolean,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    idType: type,
    rawIdNumber: presented,
    normalizedIdNumber: normalized,
    formatValid: parses,
    detectedFormat: parses
      ? (type === "DRIVERS_LICENSE" ? "PH_DRIVERS_LICENSE" : "ALPHANUMERIC")
      : "UNRECOGNIZED",
  };
  if (parses && normalized.length > 0) {
    fields["prefix"] = normalized.substring(0, 1);
    fields["serial"] = normalized.substring(1);
  }
  fields["visitorFullName"] = visitor.full_name;
  fields["visitorCompany"] = visitor.company;
  fields["source"] = "HEURISTIC_PARSER";
  return fields;
}

async function raiseWatchlistAlert(visitor: VisitorRow, verification: VerificationRow, notes: string) {
  try {
    await db.from("security_alerts").insert({
      title: "Visitor watchlist match",
      description: `Visitor '${visitor.full_name}' (id ${visitor.id}) matched an active watchlist entry during verification ${verification.id}. ${notes}`,
      severity: "HIGH",
      alert_type: "VISITOR_WATCHLIST",
      target_ip: "",
      status: "UNRESOLVED",
    });
  } catch (e) {
    console.error("watchlist security alert insert failed:", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Host notification (check-in side effect, never throws)
// ---------------------------------------------------------------------------

async function notifyHostOfArrival(visitor: VisitorRow): Promise<boolean> {
  try {
    const host = hostOf(visitor);
    if (host == null) return false;

    const when = visitor.actual_arrival != null
      ? visitor.actual_arrival.slice(0, 16).replace("T", " ")
      : "just now";

    let message = visitor.full_name;
    if (visitor.company != null && visitor.company.trim() !== "") {
      message += ` (${visitor.company})`;
    }
    message += ` arrived at ${when}. Purpose: ${visitor.purpose_of_visit ?? "not stated"}.`;

    const { data: saved, error } = await db.from("employee_notifications").insert({
      recipient_id: host.id,
      title: `Visitor arrived: ${visitor.full_name}`,
      message,
      type: "VISITOR_ARRIVAL",
      related_entity_type: "Visitor",
      related_entity_id: visitor.id,
      is_read: false,
      created_at: naiveIso(),
      updated_at: naiveIso(),
    }).select("id").single();
    if (error) {
      console.error("VISITOR_ARRIVAL notification insert failed:", error.message);
      return false;
    }
    console.log(
      `Notification created: type=VISITOR_ARRIVAL recipient=${host.id} title=Visitor arrived: ${visitor.full_name}`,
    );
    return true;
  } catch (e) {
    console.error(`Failed to notify host of visitor arrival (${visitor.id}):`, (e as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unknown or absent idType degrades to OTHER rather than rejecting the request. */
function parseIdType(raw: unknown): string | null {
  if (raw == null) return "OTHER";
  const s = String(raw).trim().toUpperCase();
  return ["DRIVERS_LICENSE", "UMID", "PASSPORT", "NATIONAL_ID", "OTHER"].includes(s)
    ? s
    : "OTHER";
}

const VISITOR_ROLES = ["FACILITIES_OFFICER", "SUPER_ADMIN", "FACILITIES_MANAGER"];

const routes = [
  { method: "GET", path: "/visitors", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleListVisitors },
  { method: "POST", path: "/visitors/register", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleRegister },
  { method: "POST", path: "/visitors/:id/check-in", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleCheckIn },
  { method: "POST", path: "/visitors/:id/check-out", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleCheckOut },
  { method: "POST", path: "/visitors/:id/verify", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleVerify },
  { method: "GET", path: "/visitors/:id/verifications", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleVerifications },
  { method: "GET", path: "/visitors/watchlist", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleListWatchlist },
  { method: "POST", path: "/visitors/watchlist", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleAddWatchlist },
  { method: "POST", path: "/visitors/watchlist/:id/status", guard: { kind: "roles", roles: VISITOR_ROLES }, handler: handleWatchlistStatus },
] as const;

Deno.serve(createHandler(routes as never, { name: "visitor" }));