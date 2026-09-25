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

function portalSiteUrl(): string {
  return (Deno.env.get("PORTAL_PUBLIC_URL") ?? "https://photonicomega.com")
    .replace(/\/+$/, "")
    .replace(/\/reservation-portal$/i, "");
}

function magicLinkTtlHours(): number {
  const configured = Number(Deno.env.get("MAGIC_LINK_TTL_HOURS") ?? "72");
  return Number.isFinite(configured) && configured > 0 && configured <= 720 ? configured : 72;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character] ?? character));
}

type EmailDelivery = "SENT" | "SIMULATED" | "FAILED";

async function deliverInvitationEmail(input: {
  recipient: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ status: EmailDelivery; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  if (!apiKey || !from) return { status: "SIMULATED" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.recipient],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!response.ok) {
      const responseText = await response.text();
      return { status: "FAILED", error: `Resend returned HTTP ${response.status}: ${responseText.slice(0, 240)}` };
    }
    return { status: "SENT" };
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message : "Resend request failed" };
  }
}

async function findInviteeByToken(token: string) {
  const tokenHash = await hashToken(token);
  const { data, error } = await db
    .from("reservation_invitees")
    .select("id, email, check_in_status, checked_in_at, reservation_id, qr_token_hash, magic_link_token_hash, magic_link_expires_at")
    .or(`qr_token_hash.eq.${tokenHash},magic_link_token_hash.eq.${tokenHash}`)
    .maybeSingle();
  if (error) throw new Error(`reservation pass lookup failed: ${error.message}`);
  if (!data) return null;
  const isMagicLink = data.magic_link_token_hash === tokenHash;
  if (isMagicLink && data.magic_link_expires_at && new Date(data.magic_link_expires_at).getTime() <= Date.now()) {
    return { ...data, expired: true, isMagicLink };
  }
  return { ...data, expired: false, isMagicLink };
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
    .select("id, name, facility_name, code, capacity, total_capacity, amenities_json, status, active, floor_plan_url")
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
    floorPlanUrl: facility.floor_plan_url ?? null,
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
    .order("start_time");
  if (url.searchParams.get("mine") === "true") query = query.eq("host_user_id", ctx!.userId);
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
  const hostMap = new Map((hosts ?? []).map((host) => [host.id, {
    name: `${host.first_name ?? ""} ${host.last_name ?? ""}`.trim() || host.email,
    email: host.email,
  }]));
  return jsonResponse(ok(rows.map((row) => ({
    id: row.id,
    facilityId: row.facility_id,
    facilityName: facilityMap.get(row.facility_id) ?? "Meeting space",
    hostUserId: row.host_user_id,
    hostName: hostMap.get(row.host_user_id)?.name ?? "Team 8 member",
    hostEmail: hostMap.get(row.host_user_id)?.email ?? null,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
  })), "Reservations loaded"), 200);
}

async function handleReservationDetails(ctx: AuthContext | null, _req: Request, _body: unknown, params: Record<string, string>) {
  const domainError = team8Only(ctx);
  if (domainError) return domainError;
  const reservationId = params.id?.trim();
  if (!reservationId) return badRequest("A reservation id is required.");

  const { data: reservation, error: reservationError } = await db
    .from("facility_reservations")
    .select("id, facility_id, host_user_id, title, start_time, end_time, notes, status, created_at")
    .eq("id", reservationId)
    .maybeSingle();
  if (reservationError) throw new Error(`reservation details lookup failed: ${reservationError.message}`);
  if (!reservation) return notFound("Reservation not found.");

  const [{ data: facility, error: facilityError }, { data: invitees, error: inviteesError }] = await Promise.all([
    db.from("facilities").select("id, name, facility_name, code, capacity").eq("id", reservation.facility_id).maybeSingle(),
    db.from("reservation_invitees").select("id, email, first_name, last_name, check_in_status, checked_in_at, created_at").eq("reservation_id", reservation.id).order("created_at"),
  ]);
  if (facilityError) throw new Error(`reservation facility details lookup failed: ${facilityError.message}`);
  if (inviteesError) throw new Error(`reservation invitees lookup failed: ${inviteesError.message}`);

  return jsonResponse(ok({
    id: reservation.id,
    facilityId: reservation.facility_id,
    facilityName: facility?.facility_name ?? facility?.name ?? "Meeting space",
    hostUserId: reservation.host_user_id,
    hostName: reservation.host_user_id === ctx!.userId ? `${ctx!.user.row.first_name} ${ctx!.user.row.last_name}`.trim() || ctx!.email : "Team 8 member",
    hostEmail: reservation.host_user_id === ctx!.userId ? ctx!.email : null,
    title: reservation.title,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    notes: reservation.notes,
    status: reservation.status,
    createdAt: reservation.created_at,
    invitees: (invitees ?? []).map((invitee) => ({
      id: invitee.id,
      email: invitee.email,
      firstName: invitee.first_name,
      lastName: invitee.last_name,
      checkedIn: invitee.check_in_status,
      checkedInAt: invitee.checked_in_at,
    })),
  }, "Reservation details loaded"), 200);
}

async function handleUpdateReservation(ctx: AuthContext | null, _req: Request, body: unknown, params: Record<string, string>) {
  const domainError = team8Only(ctx);
  if (domainError) return domainError;
  const reservationId = params.id?.trim();
  const input = (body ?? {}) as Record<string, unknown>;
  const title = String(input.title ?? "").trim();
  const start = parseDate(input.startTime);
  const end = parseDate(input.endTime);
  const notes = input.notes == null ? null : String(input.notes).trim() || null;
  if (!reservationId || !title || !start || !end) return badRequest("Reservation, title, start time, and end time are required.");
  if (end <= start) return badRequest("End time must be after start time.", "INVALID_TIME_RANGE");
  if (start.getTime() < Date.now()) return badRequest("A reservation cannot start in the past.", "PAST_RESERVATION");

  const { data: updated, error } = await db
    .from("facility_reservations")
    .update({ title, start_time: start.toISOString(), end_time: end.toISOString(), notes })
    .eq("id", reservationId)
    .eq("host_user_id", ctx!.userId)
    .neq("status", "CANCELLED")
    .select("id, facility_id, host_user_id, title, start_time, end_time, notes, status, created_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23P01") return conflict("The selected meeting space is already reserved for this time.");
    throw new Error(`reservation update failed: ${error.message}`);
  }
  if (!updated) return notFound("Reservation not found or it is not owned by the current user.");

  const { data: facility, error: facilityError } = await db.from("facilities").select("name, facility_name").eq("id", updated.facility_id).maybeSingle();
  if (facilityError) throw new Error(`updated reservation facility lookup failed: ${facilityError.message}`);
  return jsonResponse(ok({
    id: updated.id,
    facilityId: updated.facility_id,
    facilityName: facility?.facility_name ?? facility?.name ?? "Meeting space",
    hostUserId: updated.host_user_id,
    hostName: `${ctx!.user.row.first_name} ${ctx!.user.row.last_name}`.trim() || ctx!.email,
    hostEmail: ctx!.email,
    title: updated.title,
    startTime: updated.start_time,
    endTime: updated.end_time,
    notes: updated.notes,
    status: updated.status,
    createdAt: updated.created_at,
  }, "Reservation updated"), 200);
}

async function handleCancelReservation(ctx: AuthContext | null, _req: Request, _body: unknown, params: Record<string, string>) {
  const domainError = team8Only(ctx);
  if (domainError) return domainError;
  const reservationId = params.id?.trim();
  if (!reservationId) return badRequest("A reservation id is required.");

  const { data: deleted, error } = await db
    .from("facility_reservations")
    .delete()
    .eq("id", reservationId)
    .eq("host_user_id", ctx!.userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`reservation cancellation failed: ${error.message}`);
  if (!deleted) return notFound("Reservation not found or it is not owned by the current user.");
  return jsonResponse(ok({ id: deleted.id }, "Reservation cancelled and its time slot released"), 200);
}

async function handleVerifyPass(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return badRequest("A QR pass token is required.", "PASS_TOKEN_REQUIRED");
  const invitee = await findInviteeByToken(token);
  if (!invitee) return notFound("This QR pass is invalid or has expired.");
  if (invitee.expired) return notFound("This guest link has expired.");

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
    inviteeEmail: invitee.email,
    checkedIn: invitee.check_in_status,
    reservationId: reservation.id,
    title: reservation.title,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    status: reservation.status,
    facilityName: facility?.facility_name ?? facility?.name ?? "Meeting space",
    credentialType: invitee.isMagicLink ? "MAGIC_LINK" : "QR_PASS",
    magicLinkExpiresAt: invitee.isMagicLink ? invitee.magic_link_expires_at : null,
  }, "QR pass verified"), 200);
}

async function handleGuestPass(_ctx: AuthContext | null, _req: Request, _body: unknown, params: Record<string, string>) {
  const token = params.token ? decodeURIComponent(params.token).trim() : "";
  if (!token) return badRequest("A guest link token is required.", "PASS_TOKEN_REQUIRED");
  const invitee = await findInviteeByToken(token);
  if (!invitee || !invitee.isMagicLink) return notFound("This guest link is invalid or has expired.");
  if (invitee.expired) return notFound("This guest link has expired.");

  const { data: reservation, error: reservationError } = await db
    .from("facility_reservations")
    .select("id, title, start_time, end_time, notes, status, facility_id, host_user_id")
    .eq("id", invitee.reservation_id)
    .maybeSingle();
  if (reservationError) throw new Error(`guest pass reservation lookup failed: ${reservationError.message}`);
  if (!reservation) return notFound("The reservation connected to this guest link no longer exists.");

  const [{ data: facility, error: facilityError }, { data: host, error: hostError }] = await Promise.all([
    db.from("facilities").select("name, facility_name, floor_plan_url").eq("id", reservation.facility_id).maybeSingle(),
    db.from("users").select("first_name, last_name, email").eq("id", reservation.host_user_id).maybeSingle(),
  ]);
  if (facilityError) throw new Error(`guest pass facility lookup failed: ${facilityError.message}`);
  if (hostError) throw new Error(`guest pass host lookup failed: ${hostError.message}`);

  return jsonResponse(ok({
    inviteeId: invitee.id,
    inviteeEmail: invitee.email,
    checkedIn: invitee.check_in_status,
    checkedInAt: invitee.checked_in_at,
    reservationId: reservation.id,
    title: reservation.title,
    startTime: reservation.start_time,
    endTime: reservation.end_time,
    notes: reservation.notes,
    status: reservation.status,
    facilityName: facility?.facility_name ?? facility?.name ?? "Meeting space",
    floorPlanUrl: facility?.floor_plan_url ?? null,
    hostName: `${host?.first_name ?? ""} ${host?.last_name ?? ""}`.trim() || host?.email || "Team 8 member",
    magicLinkExpiresAt: invitee.magic_link_expires_at,
  }, "Guest pass loaded"), 200);
}

async function handleCheckInPass(ctx: AuthContext | null, req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return badRequest("A QR pass token is required.", "PASS_TOKEN_REQUIRED");
  const invitee = await findInviteeByToken(token);
  if (!invitee) return notFound("This QR pass is invalid or has expired.");
  if (invitee.expired) return notFound("This guest link has expired.");
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
    inviteeEmail: checkedIn.email,
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
  const invitee = await findInviteeByToken(token);
  if (!invitee) return notFound("This QR pass is invalid or has expired.");
  if (invitee.expired) return notFound("This guest link has expired.");
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
    inviteeId: updated.id, inviteeEmail: updated.email, checkedIn: false, checkedOutAt,
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
  const rawInvitees = Array.isArray(input.inviteeEmails) ? input.inviteeEmails : [];
  const inviteeEmails = [...new Set(rawInvitees
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
  if (!facilityId || !title || !start || !end) return badRequest("Facility, title, start time, and end time are required.");
  if (end <= start) return badRequest("End time must be after start time.", "INVALID_TIME_RANGE");
  if (start.getTime() < Date.now()) return badRequest("A reservation cannot start in the past.", "PAST_RESERVATION");

  const { data: facility, error: facilityError } = await db
    .from("facilities")
    .select("id, name, facility_name, capacity, total_capacity, active, status")
    .eq("id", facilityId)
    .maybeSingle();
  if (facilityError) throw new Error(`reservation portal facility lookup failed: ${facilityError.message}`);
  if (!facility) return notFound("Meeting facility was not found.");
  if (facility.active !== true || facility.status === "INACTIVE") return badRequest("This meeting facility is unavailable.", "FACILITY_UNAVAILABLE");
  const capacity = Number(facility.capacity ?? facility.total_capacity ?? 0);
  if (inviteeEmails.length > capacity) {
    return badRequest(`This facility allows at most ${capacity} invitees.`, "FACILITY_CAPACITY_EXCEEDED");
  }

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

  const invitations: Record<string, unknown>[] = [];
  const deliveryStatuses: EmailDelivery[] = [];
  const publicUrl = portalSiteUrl();
  const hostName = `${ctx!.user.row.first_name} ${ctx!.user.row.last_name}`.trim();

  for (const email of inviteeEmails) {
    const qrBytes = new Uint8Array(32);
    const magicLinkBytes = new Uint8Array(32);
    crypto.getRandomValues(qrBytes);
    crypto.getRandomValues(magicLinkBytes);
    const qrToken = base64Url(qrBytes);
    const magicLinkToken = base64Url(magicLinkBytes);
    const qrTokenHash = await hashToken(qrToken);
    const magicLinkTokenHash = await hashToken(magicLinkToken);
    const magicLinkExpiresAt = new Date(Date.now() + (magicLinkTtlHours() * 60 * 60 * 1000)).toISOString();
    const name = splitInviteeName(email);
    const { data: invitee, error: inviteeError } = await db
      .from("reservation_invitees")
      .insert({
        reservation_id: reservation.id,
        email,
        first_name: name.firstName,
        last_name: name.lastName,
        qr_token_hash: qrTokenHash,
        magic_link_token_hash: magicLinkTokenHash,
        magic_link_expires_at: magicLinkExpiresAt,
      })
      .select("id, email, first_name, last_name, check_in_status")
      .single();
    if (inviteeError) throw new Error(`reservation invitee insert failed: ${inviteeError.message}`);

    const qrPayload = `${publicUrl}/reservation-portal/pass?token=${encodeURIComponent(qrToken)}`;
    const magicLinkUrl = `${publicUrl}/guest-pass/${encodeURIComponent(magicLinkToken)}`;
    const subject = `Invitation: ${title}`;
    const bodyText = [
      `You are invited to ${title}.`,
      `Location: ${facility.facility_name ?? facility.name}`,
      `Time: ${start.toISOString()} - ${end.toISOString()}`,
      `Host: ${hostName} (${ctx!.email})`,
      `Guest pass: ${magicLinkUrl}`,
      `This guest link expires at ${magicLinkExpiresAt}.`,
    ].join("\n");
    const emailHtml = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h2>${escapeHtml(title)}</h2><p>You are invited to a Team 8 facilities reservation.</p><p><strong>Location:</strong> ${escapeHtml(facility.facility_name ?? facility.name)}<br><strong>Time:</strong> ${escapeHtml(start.toISOString())} - ${escapeHtml(end.toISOString())}<br><strong>Host:</strong> ${escapeHtml(hostName)} (${escapeHtml(ctx!.email)})</p><p><a href="${escapeHtml(magicLinkUrl)}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Open Guest Pass</a></p><p style="font-size:12px;color:#64748b">The guest pass expires at ${escapeHtml(magicLinkExpiresAt)}. Present the QR pass from the guest page at check-in.</p></body></html>`;
    const { data: outbox, error: outboxError } = await db.from("reservation_email_outbox").insert({
      reservation_id: reservation.id,
      invitee_id: invitee.id,
      recipient_email: email,
      subject,
      body: bodyText,
      delivery_status: "QUEUED",
      sent_at: null,
    }).select("id").single();
    if (outboxError) throw new Error(`reservation email outbox insert failed: ${outboxError.message}`);

    const delivery = await deliverInvitationEmail({ recipient: email, subject, text: bodyText, html: emailHtml });
    deliveryStatuses.push(delivery.status);
    const { error: deliveryUpdateError } = await db.from("reservation_email_outbox").update({
      delivery_status: delivery.status,
      sent_at: delivery.status === "SENT" ? new Date().toISOString() : null,
    }).eq("id", outbox.id);
    if (deliveryUpdateError) console.error(`reservation email delivery status update failed: ${deliveryUpdateError.message}`);
    if (delivery.status === "FAILED") console.error(`reservation invitation delivery failed for ${email}: ${delivery.error ?? "unknown error"}`);
    invitations.push({ ...invitee, qrPayload, magicLinkUrl, magicLinkExpiresAt, emailDelivery: delivery.status });
  }

  const emailDelivery = inviteeEmails.length === 0
    ? "NO_INVITEES"
    : deliveryStatuses.every((status) => status === "SENT")
      ? "SENT"
      : deliveryStatuses.every((status) => status === "SIMULATED")
        ? "SIMULATED"
        : deliveryStatuses.every((status) => status === "FAILED")
          ? "FAILED"
          : "PARTIAL";

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
    emailDelivery,
  }, "Reservation confirmed and invitation pipeline completed"), 201);
}

const routes = [
  { method: "GET", path: "/facilities", guard: { kind: "auth" }, handler: (ctx: AuthContext | null) => handleFacilities(ctx) },
  { method: "GET", path: "/reservations/mine", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request) => handleReservations(ctx, req) },
  { method: "GET", path: "/reservations/:id", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request, body: unknown, params: Record<string, string>) => handleReservationDetails(ctx, req, body, params) },
  { method: "GET", path: "/reservations", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request) => handleReservations(ctx, req) },
  { method: "POST", path: "/reservations", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request, _body: unknown) => handleCreateReservation(ctx, req, _body) },
  { method: "PATCH", path: "/reservations/:id", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request, body: unknown, params: Record<string, string>) => handleUpdateReservation(ctx, req, body, params) },
  { method: "POST", path: "/reservations/:id/cancel", guard: { kind: "auth" }, handler: (ctx: AuthContext | null, req: Request, body: unknown, params: Record<string, string>) => handleCancelReservation(ctx, req, body, params) },
  { method: "GET", path: "/guest-pass/:token", guard: { kind: "public" }, handler: handleGuestPass },
  { method: "GET", path: "/passes", guard: { kind: "public" }, handler: (_ctx: AuthContext | null, req: Request) => handleVerifyPass(req) },
  { method: "POST", path: "/passes/check-in", guard: { kind: "roles", roles: ["FACILITIES_OFFICER", "FACILITIES_MANAGER", "SUPER_ADMIN"] }, handler: (ctx: AuthContext | null, req: Request) => handleCheckInPass(ctx, req) },
  { method: "POST", path: "/passes/check-out", guard: { kind: "roles", roles: ["FACILITIES_OFFICER", "FACILITIES_MANAGER", "SUPER_ADMIN"] }, handler: (ctx: AuthContext | null, req: Request) => handleCheckOutPass(ctx, req) },
] as const;

Deno.serve(createHandler(routes as never, { name: "reservation-portal" }));
