import { createHandler, AuthContext } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";

const db = adminDb();
const DEFAULT_ALLOWED_DOMAINS = ["photonicomega.com", "team8.tnvs"];

function allowedDomains(): string[] {
  const configured = Deno.env.get("TEAM8_ALLOWED_DOMAINS")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_DOMAINS;
}

function isAllowedTeam8Email(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return allowedDomains().includes(domain);
}

function team8Only(ctx: AuthContext | null): Response | null {
  if (!ctx || isAllowedTeam8Email(ctx.email)) return null;
  return jsonResponse(
    fail("This portal is restricted to Team 8 internal email domains.", "TEAM8_DOMAIN_REQUIRED"),
    403,
  );
}

function canOperateReservations(ctx: AuthContext): boolean {
  return ctx.user.assignedRoles.some((role) =>
    role === "FACILITIES_OFFICER" || role === "FACILITIES_MANAGER"
  );
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "hidden";
  return `${local.slice(0, 1)}***@${domain}`;
}

function badRequest(message: string, code = "INVALID_REQUEST") {
  return jsonResponse(fail(message, code), 400);
}

function notFound(message: string) {
  return jsonResponse(fail(message, "RESOURCE_NOT_FOUND"), 404);
}

function conflict(message: string) {
  return jsonResponse(fail(message, "RESERVATION_CONFLICT"), 409);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function splitInviteeName(email: string): { firstName: string | null; lastName: string | null } {
  const localPart = email.split("@")[0] ?? "";
  const parts = localPart.split(/[._-]+/).filter(Boolean);
  return {
    firstName: parts[0] ? parts[0].replace(/^./, (char) => char.toUpperCase()) : null,
    lastName: parts[1] ? parts.slice(1).join(" ").replace(/^./, (char) => char.toUpperCase()) : null,
  };
}

async function handleFacilities(ctx: AuthContext | null) {
  const domainError = team8Only(ctx);
  if (domainError) return domainError;
  const { data, error } = await db
    .from("facilities")
    .select("id, name, facility_name, code, capacity, total_capacity, amenities_json, status, active")
    .eq("active", true)
    .neq("status", "INACTIVE")
    .order("name");
  if (error) throw new Error(`reservation portal facilities load failed: ${error.message}`);
  const facilities = (data ?? []).map((facility) => ({
    id: facility.id,
    facilityName: facility.facility_name ?? facility.name,
    code: facility.code,
    capacity: facility.capacity ?? facility.total_capacity ?? 0,
    amenities: Array.isArray(facility.amenities_json) ? facility.amenities_json : [],
    status: facility.status ?? "AVAILABLE",
  }));
  return jsonResponse(ok(facilities, "Reservation facilities loaded"), 200);
}

async function handleReservations(ctx: AuthContext | null, req: Request) {
  const domainError = team8Only(ctx);
  if (domainError) return domainError;
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = db
    .from("facility_reservations")
    .select("id, facility_id, host_user_id, title, start_time, end_time, notes, status, created_at")
    .neq("status", "CANCELLED")
    .order("start_time")
    .limit(500);
  if (!canOperateReservations(ctx!)) query = query.eq("host_user_id", ctx!.userId);
  if (date) {
    query = query.gte("start_time", `${date}T00:00:00.000Z`).lt("start_time", `${date}T23:59:59.999Z`);
  } else {
    if (from) query = query.gte("end_time", from);
    if (to) query = query.lte("start_time", to);
  }
  const { data, error } = await query;
  if (error) throw new Error(`reservation portal reservations load failed: ${error.message}`);

  const rows = data ?? [];
  const facilityIds = [...new Set(rows.map((row) => row.facility_id))];
  const hostIds = [...new Set(rows.map((row) => row.host_user_id))];
  const [{ data: facilities, error: facilitiesError }, { data: hosts, error: hostsError }] = await Promise.all([
    facilityIds.length ? db.from("facilities").select("id, name, facility_name").in("id", facilityIds) : Promise.resolve({ data: [], error: null }),
    hostIds.length ? db.from("users").select("id, first_name, last_name, email").in("id", hostIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (facilitiesError) throw new Error(`reservation portal facility join failed: ${facilitiesError.message}`);
  if (hostsError) throw new Error(`reservation portal host join failed: ${hostsError.message}`);
  const facilityMap = new Map((facilities ?? []).map((facility) => [facility.id, facility.facility_name ?? facility.name]));
  const hostMap = new Map((hosts ?? []).map((host) => [host.id,
    `${host.first_name ?? ""} ${host.last_name ?? ""}`.trim() || "Team 8 member",
  ]));
  return jsonResponse(ok(rows.map((row) => ({
    id: row.id,
    facilityId: row.facility_id,
    facilityName: facilityMap.get(row.facility_id) ?? "Meeting space",
    hostUserId: row.host_user_id,
    hostName: hostMap.get(row.host_user_id) ?? "Team 8 member",
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
  })), "Reservations loaded"), 200);
}

async function handleVerifyPass(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return badRequest("A QR pass token is required.", "PASS_TOKEN_REQUIRED");
  const tokenHash = await hashToken(token);
  const { data: invitee, error: inviteeError } = await db
    .from("reservation_invitees")
    .select("id, email, check_in_status, reservation_id")
    .eq("qr_token_hash", tokenHash)
    .maybeSingle();
  if (inviteeError) throw new Error(`reservation pass lookup failed: ${inviteeError.message}`);
  if (!invitee) return notFound("This QR pass is invalid or has expired.");

  const { data: reservation, error: reservationError } = await db
    .from("facility_reservations")
    .select("id, title, start_time, end_time, status, facility_id, facilities(name, facility_name)")
    .eq("id", invitee.reservation_id)
    .maybeSingle();
  if (reservationError) throw new Error(`reservation pass details lookup failed: ${reservationError.message}`);
  if (!reservation) return notFound("The reservation connected to this QR pass no longer exists.");
  const facility = Array.isArray(reservation.facilities) ? reservation.facilities[0] : reservation.facilities;
  return jsonResponse(ok({
    inviteeId: invitee.id,
    inviteeEmail: maskEmail(invitee.email),
    checkedIn: invitee.check_in_status,
    reservationId: reservation.id,
    title: reservation.title,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    status: reservation.status,
    facilityName: facility?.facility_name ?? facility?.name ?? "Meeting space",
  }, "QR pass verified"), 200);
}

async function handleCheckInPass(ctx: AuthContext | null, req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return badRequest("A QR pass token is required.", "PASS_TOKEN_REQUIRED");
  const tokenHash = await hashToken(token);

  const { data: invitee, error: inviteeError } = await db
    .from("reservation_invitees")
    .select("id, email, check_in_status, reservation_id")
    .eq("qr_token_hash", tokenHash)
    .maybeSingle();
  if (inviteeError) throw new Error(`reservation pass lookup failed: ${inviteeError.message}`);
  if (!invitee) return notFound("This QR pass is invalid or has expired.");
  if (invitee.check_in_status) return conflict("This QR pass has already been checked in.");

  const { data: reservation, error: reservationError } = await db
    .from("facility_reservations")
    .select("id, title, start_time, end_time, status, facility_id, facilities(name, facility_name)")
    .eq("id", invitee.reservation_id)
    .maybeSingle();
  if (reservationError) throw new Error(`reservation pass details lookup failed: ${reservationError.message}`);
  if (!reservation) return notFound("The reservation connected to this QR pass no longer exists.");
  if (reservation.status === "CANCELLED") return badRequest("This reservation has been cancelled.", "RESERVATION_CANCELLED");

  const { data: checkedIn, error: updateError } = await db
    .from("reservation_invitees")
    .update({ check_in_status: true, checked_in_at: new Date().toISOString() })
    .eq("id", invitee.id)
    .eq("check_in_status", false)
    .select("id, email, check_in_status, checked_in_at")
    .maybeSingle();
  if (updateError) throw new Error(`reservation pass check-in failed: ${updateError.message}`);
  if (!checkedIn) return conflict("This QR pass has already been checked in.");

  const facility = Array.isArray(reservation.facilities) ? reservation.facilities[0] : reservation.facilities;
  const { error: auditError } = await db.from("security_logs").insert({
    action: "RESERVATION_QR_CHECK_IN",
    module: "FACILITIES_RESERVATION_PORTAL",
    full_name: invitee.email,
    role: ctx?.roles?.join(",") ?? "FACILITIES_OFFICER",
    risk_level: "LOW",
    status: "SUCCESS",
    reason: `QR pass checked in for reservation ${reservation.id}`,
  });
  if (auditError) console.error(`reservation QR check-in audit failed: ${auditError.message}`);

  return jsonResponse(ok({
    inviteeId: checkedIn.id,
    inviteeEmail: maskEmail(checkedIn.email),
    checkedIn: checkedIn.check_in_status,
    checkedInAt: checkedIn.checked_in_at,
    reservationId: reservation.id,
    title: reservation.title,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    status: reservation.status,
    facilityName: facility?.facility_name ?? facility?.name ?? "Meeting space",
  }, "QR pass checked in successfully"), 200);
}

async function handleCheckOutPass(ctx: AuthContext | null, req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return badRequest("A QR pass token is required.", "PASS_TOKEN_REQUIRED");
  const tokenHash = await hashToken(token);
  const { data: invitee, error: inviteeError } = await db.from("reservation_invitees")
    .select("id, email, check_in_status, reservation_id").eq("qr_token_hash", tokenHash).maybeSingle();
  if (inviteeError) throw new Error(`reservation pass lookup failed: ${inviteeError.message}`);
  if (!invitee) return notFound("This QR pass is invalid or has expired.");
  if (!invitee.check_in_status) return conflict("This QR pass is not currently checked in.");
  const { data: reservation, error: reservationError } = await db.from("facility_reservations")
    .select("id, title, start_time, end_time, status, facility_id, facilities(name, facility_name)")
    .eq("id", invitee.reservation_id).maybeSingle();
  if (reservationError) throw new Error(`reservation pass details lookup failed: ${reservationError.message}`);
  if (!reservation) return notFound("The reservation connected to this QR pass no longer exists.");
  const checkedOutAt = new Date().toISOString();
  const { data: updated, error: updateError } = await db.from("reservation_invitees")
    .update({ check_in_status: false, checked_in_at: null }).eq("id", invitee.id).eq("check_in_status", true)
    .select("id, email, check_in_status").maybeSingle();
  if (updateError) throw new Error(`reservation pass check-out failed: ${updateError.message}`);
  if (!updated) return conflict("This QR pass is no longer checked in.");
  const facility = Array.isArray(reservation.facilities) ? reservation.facilities[0] : reservation.facilities;
  const { error: auditError } = await db.from("security_logs").insert({
    action: "RESERVATION_QR_CHECK_OUT", module: "FACILITIES_RESERVATION_PORTAL", full_name: invitee.email,
    role: ctx?.roles?.join(",") ?? "FACILITIES_OFFICER", risk_level: "LOW", status: "SUCCESS",
    reason: `QR pass checked out for reservation ${reservation.id} at ${checkedOutAt}`,
  });
  if (auditError) console.error(`reservation QR check-out audit failed: ${auditError.message}`);
  return jsonResponse(ok({
    inviteeId: updated.id, inviteeEmail: maskEmail(updated.email), checkedIn: false, checkedOutAt,
    reservationId: reservation.id, title: reservation.title, startTime: reservation.start_time,
    endTime: reservation.end_time, status: reservation.status,
    facilityName: facility?.facility_name ?? facility?.name ?? "Meeting space",
  }, "QR pass checked out successfully"), 200);
}

async function handleCreateReservation(ctx: AuthContext | null, req: Request, body: unknown) {
  const domainError = team8Only(ctx);
  if (domainError) return domainError;
  const input = (body ?? {}) as Record<string, unknown>;
  const facilityId = String(input.facilityId ?? "").trim();
  const title = String(input.title ?? "").trim();
  const start = parseDate(input.startTime);
  const end = parseDate(input.endTime);
  const notes = input.notes == null ? null : String(input.notes).trim() || null;
  if (!facilityId || !title || !start || !end) return badRequest("Facility, title, start time, and end time are required.");
  if (end <= start) return badRequest("End time must be after start time.", "INVALID_TIME_RANGE");
  if (start.getTime() < Date.now()) return badRequest("A reservation cannot start in the past.", "PAST_RESERVATION");

  const { data: facility, error: facilityError } = await db
    .from("facilities")
    .select("id, name, facility_name, active, status")
    .eq("id", facilityId)
    .maybeSingle();
  if (facilityError) throw new Error(`reservation portal facility lookup failed: ${facilityError.message}`);
  if (!facility) return notFound("Meeting facility was not found.");
  if (facility.active !== true || facility.status === "INACTIVE") return badRequest("This meeting facility is unavailable.", "FACILITY_UNAVAILABLE");

  const { data: reservation, error: reservationError } = await db
    .from("facility_reservations")
    .insert({
      facility_id: facilityId,
      host_user_id: ctx!.userId,
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      notes,
      status: "CONFIRMED",
    })
    .select("id, facility_id, host_user_id, title, start_time, end_time, notes, status, created_at")
    .single();
  if (reservationError) {
    if (reservationError.code === "23P01") return conflict("The selected meeting space is already reserved for this time.");
    throw new Error(`reservation portal reservation insert failed: ${reservationError.message}`);
  }

  const rawInvitees = Array.isArray(input.inviteeEmails) ? input.inviteeEmails : [];
  const inviteeEmails = [...new Set(rawInvitees
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
  const invitations: Record<string, unknown>[] = [];
  const publicUrl = Deno.env.get("PORTAL_PUBLIC_URL") ?? "https://photonicomega.com/reservation-portal";
  const hostName = `${ctx!.user.row.first_name} ${ctx!.user.row.last_name}`.trim();

  for (const email of inviteeEmails) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = base64Url(bytes);
    const tokenHash = await hashToken(token);
    const name = splitInviteeName(email);
    const { data: invitee, error: inviteeError } = await db
      .from("reservation_invitees")
      .insert({
        reservation_id: reservation.id,
        email,
        first_name: name.firstName,
        last_name: name.lastName,
        qr_token_hash: tokenHash,
      })
      .select("id, email, first_name, last_name, check_in_status")
      .single();
    if (inviteeError) throw new Error(`reservation invitee insert failed: ${inviteeError.message}`);

    const qrPayload = `${publicUrl}/pass?token=${encodeURIComponent(token)}`;
    const bodyText = [
      `You are invited to ${title}.`,
      `Location: ${facility.facility_name ?? facility.name}`,
      `Time: ${start.toISOString()} - ${end.toISOString()}`,
      `Host: ${hostName} (${ctx!.email})`,
      "Digital QR Pass: generated; external email delivery is not configured and must be handled separately.",
    ].join("\n");
    const { error: outboxError } = await db.from("reservation_email_outbox").insert({
      reservation_id: reservation.id,
      invitee_id: invitee.id,
      recipient_email: email,
      subject: `Invitation: ${title}`,
      body: bodyText,
      delivery_status: "SIMULATED",
      sent_at: null,
    });
    if (outboxError) throw new Error(`reservation email outbox insert failed: ${outboxError.message}`);
    invitations.push({ ...invitee, qrPayload });
  }

  return jsonResponse(ok({
    reservation: {
      id: reservation.id,
      facilityId: reservation.facility_id,
      facilityName: facility.facility_name ?? facility.name,
      hostName,
      title: reservation.title,
      startTime: reservation.start_time,
      endTime: reservation.end_time,
      notes: reservation.notes,
      status: reservation.status,
    },
    invitations,
    emailDelivery: inviteeEmails.length ? "NOT_DELIVERED" : "NO_INVITEES",
  }, inviteeEmails.length
    ? "Reservation confirmed; QR passes were generated, but external email delivery is not configured"
    : "Reservation confirmed"), 201);
}

const routes = [
  { method: "GET", path: "/facilities", guard: { kind: "auth" }, handler: (ctx: AuthContext | null) => handleFacilities(ctx) },
  { method: "GET", path: "/reservations", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request) => handleReservations(ctx, req) },
  { method: "POST", path: "/reservations", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request, _body: unknown) => handleCreateReservation(ctx, req, _body) },
  { method: "GET", path: "/passes", guard: { kind: "public" }, handler: (_ctx: AuthContext | null, req: Request) => handleVerifyPass(req) },
  { method: "POST", path: "/passes/check-in", guard: { kind: "roles", roles: ["FACILITIES_OFFICER", "FACILITIES_MANAGER"] }, handler: (ctx: AuthContext | null, req: Request) => handleCheckInPass(ctx, req) },
  { method: "POST", path: "/passes/check-out", guard: { kind: "roles", roles: ["FACILITIES_OFFICER", "FACILITIES_MANAGER"] }, handler: (ctx: AuthContext | null, req: Request) => handleCheckOutPass(ctx, req) },
] as const;

Deno.serve(createHandler(routes as never, { name: "reservation-portal" }));
