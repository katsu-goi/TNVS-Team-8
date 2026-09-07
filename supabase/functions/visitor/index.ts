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
  current_verification_id: string | null;
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

function toVisitorDto(v: VisitorRow, verification?: VerificationRow | null) {
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
    currentVerificationId: v.current_verification_id,
    clearanceState: verification?.clearance_state ?? null,
    automatedClearance: verification?.automated_clearance ?? null,
    verificationStatus: verification?.verification_status ?? null,
    verificationReviewedAt: verification?.reviewed_at ?? null,
  };
}

async function currentClearanceMap(rows: VisitorRow[]): Promise<Map<string, VerificationRow>> {
  const ids = rows.map((row) => row.current_verification_id).filter((id): id is string => Boolean(id));
  const result = new Map<string, VerificationRow>();
  if (ids.length === 0) return result;
  const { data, error } = await db.from("visitor_verifications").select("*").in("id", ids);
  if (error) throw new Error(`visitor clearance load failed: ${error.message}`);
  for (const row of (data as unknown as VerificationRow[]) ?? []) result.set(row.id, row);
  return result;
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

type WatchlistRow = {
  id: string;
  full_name: string;
  id_number: string | null;
  reason: string | null;
  status: string;
  severity: string;
  created_at: string | null;
};

function toWatchlistDto(w: WatchlistRow) {
  return {
    id: w.id,
    fullName: w.full_name,
    idNumber: w.id_number,
    reason: w.reason,
    status: w.status,
    severity: w.severity,
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
    automatedClearance: v.automated_clearance,
    clearanceState: v.clearance_state,
    matchedWatchlistEntryId: v.matched_watchlist_entry_id,
    matchType: v.match_type,
    reviewedBy: v.reviewed_by,
    reviewedAt: v.reviewed_at,
    reviewNotes: v.review_notes,
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
  automated_clearance: string;
  clearance_state: string;
  matched_watchlist_entry_id: string | null;
  match_type: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

type WorkflowRpcResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  errorCode?: string;
  message?: string;
};

function workflowResponse(result: WorkflowRpcResult, successMessage: string) {
  if (result.ok) return jsonResponse(ok(result.data ?? {}, successMessage), 200);
  const code = result.errorCode ?? "BUSINESS_RULE_VIOLATION";
  const status = code === "ACCESS_DENIED" ? 403
    : code.endsWith("_NOT_FOUND") ? 404
    : ["VISITOR_ALREADY_CHECKED_IN", "VISITOR_INVALID_STATUS", "VISITOR_REVIEW_REQUIRED", "VISITOR_BLOCKED"].includes(code) ? 409
    : 400;
  return jsonResponse(fail(result.message ?? "Workflow request rejected.", code), status);
}

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
  const clearances = await currentClearanceMap(rows);
  return jsonResponse(ok(rows.map((row) => toVisitorDto(
    row,
    row.current_verification_id ? clearances.get(row.current_verification_id) ?? null : null,
  )), "Visitors list retrieved"), 200);
}

async function handleRegister(ctx: AuthContext | null, req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  const email = typeof b.email === "string" ? b.email : "";
  const hostId = typeof b.hostId === "string"
    ? b.hostId
    : typeof (b.host as { id?: unknown } | undefined)?.id === "string"
      ? (b.host as { id: string }).id
      : null;

  const purpose = typeof b.purposeOfVisit === "string" ? b.purposeOfVisit.trim() : "";
  const expectedArrival = typeof b.expectedArrival === "string" ? b.expectedArrival : null;
  if (!fullName || !purpose || !expectedArrival || !hostId) {
    return badRequest("Full name, purpose, expected arrival, and an active host are required.", "VALIDATION_ERROR");
  }
  const { data: host, error: hostError } = await db.from("users")
    .select("id").eq("id", hostId).eq("status", "ACTIVE").eq("is_deleted", false).maybeSingle();
  if (hostError) throw new Error(`host lookup failed: ${hostError.message}`);
  if (!host) return badRequest("The selected host is unavailable.", "VISITOR_HOST_REQUIRED");

  const { data: saved, error } = await db.from("visitors").insert({
    full_name: fullName,
    email,
    phone_number: typeof b.phoneNumber === "string" ? b.phoneNumber : null,
    company: typeof b.company === "string" ? b.company : null,
    id_number: typeof b.idNumber === "string" ? b.idNumber : null,
    host_id: hostId,
    purpose_of_visit: purpose,
    expected_arrival: toUtcIso(expectedArrival),
    status: "REGISTERED",
    qr_code_token: "QR-" + crypto.randomUUID().substring(0, 8).toUpperCase(),
    badge_number: typeof b.badgeNumber === "string" ? b.badgeNumber : null,
    created_by: ctx!.email,
    updated_at: naiveIso(),
  }).select(
    "*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)",
  ).single();
  if (error) throw new Error(`visitor register failed: ${error.message}`);

  await writeAudit(ctx?.user ?? null, "REGISTER_VISITOR", MODULE, "Visitor",
    (saved as { id: string }).id, "Visitor registration created for an active host.",
    resolveClientIp(req).ip, "INFO");

  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor registered and pass generated"), 200);
}

async function handleCheckIn(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db.rpc("phase5_check_in_visitor", {
    p_visitor_id: p.id,
    p_actor_id: ctx!.userId,
    p_actor_email: ctx!.email,
    p_actor_role: "FACILITIES_OFFICER",
  });
  if (error) throw new Error(`visitor check-in transaction failed: ${error.message}`);
  const result = data as WorkflowRpcResult;
  if (!result.ok) return workflowResponse(result, "Visitor checked in");
  const saved = await loadVisitor(p.id);
  if (!saved) return emptyNotFound();
  await notifyHostOfArrival(saved);
  return jsonResponse(ok(toVisitorDto(saved), "Visitor checked in"), 200);
}

async function handleCheckOut(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db.rpc("phase5_check_out_visitor", {
    p_visitor_id: p.id,
    p_actor_id: ctx!.userId,
    p_actor_email: ctx!.email,
    p_actor_role: "FACILITIES_OFFICER",
  });
  if (error) throw new Error(`visitor check-out transaction failed: ${error.message}`);
  const result = data as WorkflowRpcResult;
  if (!result.ok) return workflowResponse(result, "Visitor checked out");
  const saved = await loadVisitor(p.id);
  return saved ? jsonResponse(ok(toVisitorDto(saved), "Visitor checked out"), 200) : emptyNotFound();
}

async function handleVerify(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const idType = parseIdType((body as Record<string, unknown> | null)?.idType);
  const rawNumber = (body as Record<string, unknown> | null)?.idNumber;
  const idNumber = rawNumber == null ? null : String(rawNumber);

  const { data, error } = await db.rpc("phase5_verify_visitor", {
    p_visitor_id: p.id,
    p_id_type: idType,
    p_id_number: idNumber,
    p_actor_id: ctx!.userId,
    p_actor_email: ctx!.email,
    p_actor_role: "FACILITIES_OFFICER",
  });
  if (error) throw new Error(`visitor verification transaction failed: ${error.message}`);
  const result = data as WorkflowRpcResult;
  if (!result.ok) return workflowResponse(result, "Visitor verified");
  return jsonResponse(ok(toVerificationDto(result.data as unknown as VerificationRow), "Visitor verification completed"), 200);
}

async function handleReview(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const b = (body ?? {}) as Record<string, unknown>;
  const { data, error } = await db.rpc("phase5_review_visitor", {
    p_visitor_id: p.id,
    p_verification_id: p.verificationId,
    p_decision: String(b.decision ?? ""),
    p_notes: String(b.notes ?? ""),
    p_actor_id: ctx!.userId,
    p_actor_email: ctx!.email,
    p_actor_role: "FACILITIES_OFFICER",
  });
  if (error) throw new Error(`visitor review transaction failed: ${error.message}`);
  const result = data as WorkflowRpcResult;
  if (!result.ok) return workflowResponse(result, "Visitor review completed");
  return jsonResponse(ok(toVerificationDto(result.data as unknown as VerificationRow), "Visitor review completed"), 200);
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

async function handleVisitorHistory(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db.from("visitor_workflow_events")
    .select("id, visitor_id, verification_id, event_type, from_status, to_status, actor_id, actor_email, actor_role, details, occurred_at")
    .eq("visitor_id", p.id)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(`visitor history load failed: ${error.message}`);
  return jsonResponse(ok(data ?? [], "Visitor workflow history retrieved"), 200);
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
    const severity = typeof b.severity === "string" ? b.severity.trim().toUpperCase() : "HIGH";
    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) {
      throw new Error("severity must be LOW, MEDIUM, HIGH, or CRITICAL");
    }

    const { data: saved, error } = await db.from("visitor_watchlist").insert({
      full_name: fullName.trim(),
      id_number: rawId != null && rawId.trim() !== "" ? rawId.trim() : null,
      reason,
      severity,
      status: "ACTIVE",
      created_at: naiveIso(),
      updated_at: naiveIso(),
    }).select("*").single();
    if (error) throw new Error(`watchlist insert failed: ${error.message}`);

    await writeAudit(ctx?.user ?? null, "ADD_VISITOR_WATCHLIST", MODULE, "VisitorWatchlist",
      (saved as { id: string }).id,
      `Protected watchlist entry added with ${severity} severity; identity details remain in the protected source record.`,
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
      `Protected watchlist entry status changed from ${previous} to ${next}; identity details remain in the protected source record.`,
      ctx ? resolveClientIp(_req).ip : null, "INFO");

    return jsonResponse(ok(toWatchlistDto(saved as unknown as WatchlistRow), "Watchlist entry updated"), 200);
  } catch (e) {
    return badRequest((e as Error).message, "VALIDATION_ERROR");
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

    const { error } = await db.from("employee_notifications").insert({
      recipient_id: host.id,
      title: `Visitor arrived: ${visitor.full_name}`,
      message,
      type: "VISITOR_ARRIVAL",
      related_entity_type: "Visitor",
      related_entity_id: visitor.id,
      dedup_key: `phase5:visitor:${visitor.id}:host-arrival`,
      is_read: false,
      created_at: naiveIso(),
      updated_at: naiveIso(),
    });
    if (error) {
      if (error.code === "23505") return true;
      console.error("VISITOR_ARRIVAL notification insert failed:", error.message);
      return false;
    }
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

const VISITOR_VIEW_ROLES = ["FACILITIES_OFFICER", "FACILITIES_MANAGER"];
const VISITOR_OPERATIONS_ROLES = ["FACILITIES_OFFICER"];

const routes = [
  { method: "GET", path: "/visitors", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleListVisitors },
  { method: "POST", path: "/visitors/register", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleRegister },
  { method: "POST", path: "/visitors/:id/check-in", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleCheckIn },
  { method: "POST", path: "/visitors/:id/check-out", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleCheckOut },
  { method: "POST", path: "/visitors/:id/verify", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleVerify },
  { method: "POST", path: "/visitors/:id/verifications/:verificationId/review", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleReview },
  { method: "GET", path: "/visitors/:id/verifications", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleVerifications },
  { method: "GET", path: "/visitors/:id/history", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleVisitorHistory },
  { method: "GET", path: "/visitors/watchlist", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleListWatchlist },
  { method: "POST", path: "/visitors/watchlist", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleAddWatchlist },
  { method: "POST", path: "/visitors/watchlist/:id/status", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleWatchlistStatus },
] as const;

Deno.serve(createHandler(routes as never, { name: "visitor" }));
