import { workflowActorRole } from "../_shared/workflow-actor.ts";
import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";
import { writeAudit } from "../_shared/lockout.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import QRCode from "npm:qrcode@1.5.4";

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

const KIOSK_PURPOSES = [
  { value: "MEETING_EMPLOYEE", label: "Meeting an Employee" },
  { value: "DRIVER_PARTNER_ASSISTANCE", label: "Driver-Partner Inquiry or Assistance" },
  { value: "DRIVER_PARTNER_ONBOARDING", label: "Driver-Partner Onboarding or Requirements" },
  { value: "HR_RECRUITMENT", label: "Human Resources or Recruitment" },
  { value: "BUSINESS_MEETING", label: "Business Meeting or Partnership" },
  { value: "DOCUMENT_TRANSACTION", label: "Document Submission or Collection" },
  { value: "DELIVERY_PICKUP", label: "Delivery or Pickup" },
  { value: "FLEET_OPERATIONS", label: "Vehicle, Fleet, or Operations Concern" },
  { value: "MAINTENANCE_SERVICE", label: "Maintenance or Service Visit" },
  { value: "GOVERNMENT_REGULATORY", label: "Government or Regulatory Transaction" },
  { value: "OTHER", label: "Other Purpose" },
] as const;

const PURPOSE_VALUES = new Set(KIOSK_PURPOSES.map((purpose) => purpose.value));
const FIXED_DEPARTMENT_PURPOSES = new Set([
  "DRIVER_PARTNER_ASSISTANCE", "DRIVER_PARTNER_ONBOARDING", "HR_RECRUITMENT",
  "DOCUMENT_TRANSACTION", "DELIVERY_PICKUP", "FLEET_OPERATIONS",
  "MAINTENANCE_SERVICE", "GOVERNMENT_REGULATORY",
]);
const IMAGE_BUCKET = "visitor-identity-private";
const MAX_ID_IMAGE_BYTES = 5 * 1024 * 1024;

function envText(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function splitConfig(value: string): string[] {
  return value.split("|").map((item) => item.trim()).filter(Boolean);
}

function purposeDepartmentRoutes(): Record<string, string> {
  const raw = envText("VISITOR_PURPOSE_DEPARTMENT_ROUTES");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed)
      .map(([key, value]) => [key.trim().toUpperCase(), String(value ?? "").trim()])
      .filter(([, value]) => Boolean(value)));
  } catch {
    return {};
  }
}

function kioskPrivacyConfig() {
  const values = {
    controllerName: envText("VISITOR_PRIVACY_CONTROLLER_NAME"),
    controllerContact: envText("VISITOR_PRIVACY_CONTROLLER_CONTACT"),
    dpoContact: envText("VISITOR_PRIVACY_DPO_CONTACT"),
    lawfulBasis: envText("VISITOR_PRIVACY_LAWFUL_BASIS"),
    retentionPolicy: envText("VISITOR_IDENTITY_RETENTION_POLICY"),
    rightsProcess: envText("VISITOR_PRIVACY_RIGHTS_PROCESS"),
    processors: envText("VISITOR_PRIVACY_PROCESSORS"),
    safeguards: envText("VISITOR_PRIVACY_SAFEGUARDS"),
    alternativeVerification: envText("VISITOR_ALTERNATIVE_VERIFICATION_PROCEDURE"),
    noticeVersion: envText("VISITOR_PRIVACY_NOTICE_VERSION"),
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  const acceptedIdTypes = splitConfig(envText("VISITOR_ACCEPTED_ID_TYPES"));
  if (acceptedIdTypes.length === 0) missing.push("acceptedIdTypes");
  const retentionDays = Number(envText("VISITOR_IDENTITY_RETENTION_DAYS"));
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) missing.push("identityRetentionDays");
  const routes = purposeDepartmentRoutes();
  if ([...FIXED_DEPARTMENT_PURPOSES].some((purpose) => !routes[purpose])) missing.push("purposeDepartmentRoutes");
  return {
    ...values,
    acceptedIdTypes,
    ready: missing.length === 0,
    missing,
    ocr: { status: "NOT_CONFIGURED" as const, message: "OCR is not configured. Visitors confirm their entered details and authorized staff review the ID image." },
    identityVerification: {
      status: "NOT_CONFIGURED" as const,
      livenessSupported: false,
      message: "A biometric identity-verification provider is not configured. No face-match or liveness result will be fabricated; authorized staff must use the approved alternative procedure.",
    },
  };
}

function emailLooksValid(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function referenceNumber(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `HV-${date}-${base64Url(bytes).toUpperCase()}`;
}

type ParsedImage = { bytes: Uint8Array; mime: "image/jpeg" | "image/png" | "image/webp"; extension: string };

function parseImageDataUrl(raw: unknown): ParsedImage | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  let decoded: string;
  try { decoded = atob(match[2]); } catch { return null; }
  if (decoded.length === 0 || decoded.length > MAX_ID_IMAGE_BYTES) return null;
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  const mime = match[1] as ParsedImage["mime"];
  const signatureValid = mime === "image/jpeg"
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
    : mime === "image/png"
      ? bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])
      : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!signatureValid) return null;
  return { bytes, mime, extension: mime === "image/jpeg" ? "jpg" : mime.split("/")[1] };
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
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
  denial_reason: string | null;
  qr_code_token: string | null;
  badge_number: string | null;
  host_id: string | null;
  current_verification_id: string | null;
  reference_number?: string | null;
  registration_source?: string | null;
  purpose_category?: string | null;
  other_purpose?: string | null;
  receiving_department?: string | null;
  id_type?: string | null;
  id_number_last4?: string | null;
  privacy_notice_version?: string | null;
  privacy_acknowledged_at?: string | null;
  identity_verification_status?: string | null;
  identity_verification_provider?: string | null;
  approval_status?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  declined_by?: string | null;
  declined_at?: string | null;
  approval_reason?: string | null;
  access_status?: string | null;
  qr_token_hash?: string | null;
  qr_issued_at?: string | null;
  qr_expires_at?: string | null;
  qr_revoked_at?: string | null;
  email_delivery_status?: string | null;
  email_provider_id?: string | null;
  email_delivery_error?: string | null;
  email_attempted_at?: string | null;
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

function maskIdentifier(value: string | null): string | null {
  if (!value) return null;
  const suffix = value.replace(/\s+/g, "").slice(-4);
  return suffix ? `****${suffix}` : "****";
}

function toVisitorDto(v: VisitorRow, verification?: VerificationRow | null, includeSensitiveId = true) {
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
    idNumber: includeSensitiveId ? v.id_number : maskIdentifier(v.id_number),
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
    denialReason: v.denial_reason,
    // Raw pass credentials must never be returned by staff list APIs.
    qrCodeToken: null,
    badgeNumber: v.badge_number,
    currentVerificationId: v.current_verification_id,
    clearanceState: verification?.clearance_state ?? null,
    automatedClearance: verification?.automated_clearance ?? null,
    verificationStatus: verification?.verification_status ?? null,
    verificationReviewedAt: verification?.reviewed_at ?? null,
    referenceNumber: v.reference_number ?? null,
    registrationSource: v.registration_source ?? "STAFF",
    purposeCategory: v.purpose_category ?? null,
    otherPurpose: v.other_purpose ?? null,
    receivingDepartment: v.receiving_department ?? h?.department ?? null,
    idType: v.id_type ?? verification?.id_type ?? null,
    idNumberLast4: v.id_number_last4 ?? null,
    privacyNoticeVersion: v.privacy_notice_version ?? null,
    identityVerificationStatus: v.identity_verification_status ?? null,
    identityVerificationProvider: v.identity_verification_provider ?? null,
    approvalStatus: v.approval_status ?? "NOT_REQUIRED",
    approvedAt: v.approved_at ?? null,
    declinedAt: v.declined_at ?? null,
    approvalReason: v.approval_reason ?? null,
    accessStatus: v.access_status ?? "NOT_AUTHORIZED",
    qrIssuedAt: v.qr_issued_at ?? null,
    qrExpiresAt: v.qr_expires_at ?? null,
    qrRevokedAt: v.qr_revoked_at ?? null,
    emailDeliveryStatus: v.email_delivery_status ?? "NOT_REQUESTED",
    emailProviderId: v.email_provider_id ?? null,
    emailDeliveryError: v.email_delivery_error ?? null,
    emailAttemptedAt: v.email_attempted_at ?? null,
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

async function handleKioskConfig() {
  const privacy = kioskPrivacyConfig();
  const departmentRoutes = purposeDepartmentRoutes();
  const { data: users, error } = await db.from("users")
    .select("id, first_name, last_name, department, position")
    .eq("status", "ACTIVE")
    .eq("is_deleted", false)
    .not("department", "is", null)
    .order("last_name")
    .limit(500);
  if (error) throw new Error(`kiosk destination load failed: ${error.message}`);
  const hosts = (users ?? []).map((user) => ({
    id: user.id,
    name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
    department: user.department,
    position: user.position,
  })).filter((user) => user.name);
  const departments = [...new Set(hosts.map((host) => String(host.department ?? "").trim()).filter(Boolean))].sort();
  const invalidRoutes = Object.entries(departmentRoutes)
    .filter(([purpose, department]) => FIXED_DEPARTMENT_PURPOSES.has(purpose) && !departments.includes(department));
  if (invalidRoutes.length > 0) {
    privacy.ready = false;
    privacy.missing.push("purposeDepartmentRoutesReferenceInactiveDepartments");
  }
  return jsonResponse(ok({
    privacy,
    purposes: KIOSK_PURPOSES.map((purpose) => ({ ...purpose, department: departmentRoutes[purpose.value] ?? null })),
    hosts,
    departments,
  }, privacy.ready ? "Visitor kiosk configuration loaded" : "Visitor kiosk requires privacy configuration before collecting personal information"), 200);
}

async function handleKioskRegister(_ctx: AuthContext | null, req: Request, body: unknown) {
  const privacy = kioskPrivacyConfig();
  if (!privacy.ready) {
    return jsonResponse(fail(
      "Visitor registration is unavailable until the organization configures the required privacy notice and approved ID policy.",
      "KIOSK_PRIVACY_CONFIGURATION_REQUIRED",
      privacy.missing,
    ), 503);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const fullName = String(b.fullName ?? "").trim().replace(/\s+/g, " ");
  const email = String(b.email ?? "").trim().toLowerCase();
  const phoneNumber = String(b.phoneNumber ?? "").trim() || null;
  const company = String(b.company ?? "").trim() || null;
  const purposeCategory = String(b.purposeCategory ?? "").trim().toUpperCase();
  const otherPurpose = String(b.otherPurpose ?? "").trim() || null;
  const expectedRaw = String(b.expectedArrival ?? "").trim();
  const hostId = String(b.hostId ?? "").trim() || null;
  let receivingDepartment = String(b.receivingDepartment ?? "").trim() || null;
  const routedDepartment = purposeDepartmentRoutes()[purposeCategory] ?? null;
  if (FIXED_DEPARTMENT_PURPOSES.has(purposeCategory)) receivingDepartment = routedDepartment;
  const idType = String(b.idType ?? "").trim();
  const idNumberLast4 = String(b.idNumberLast4 ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase() || null;
  const idempotencyKey = String(b.idempotencyKey ?? "").trim();
  const privacyVersion = String(b.privacyNoticeVersion ?? "").trim();
  const image = parseImageDataUrl((b.idImage as Record<string, unknown> | undefined)?.dataUrl);
  const readabilityConfirmed = (b.idImage as Record<string, unknown> | undefined)?.confirmedReadable === true;

  if (fullName.length < 2 || fullName.length > 150) return badRequest("Enter a valid visitor name (2–150 characters).", "VALIDATION_ERROR");
  if (!emailLooksValid(email)) return badRequest("Enter a valid email address for visit updates and the QR pass.", "VALIDATION_ERROR");
  if (phoneNumber && phoneNumber.length > 30) return badRequest("Phone number is too long.", "VALIDATION_ERROR");
  if (company && company.length > 150) return badRequest("Organization name is too long.", "VALIDATION_ERROR");
  if (purposeCategory === "GOVERNMENT_REGULATORY" && !company) return badRequest("Government or regulatory visits require the organization name.", "ORGANIZATION_REQUIRED");
  if (!PURPOSE_VALUES.has(purposeCategory as never)) return badRequest("Select an approved purpose of visit.", "VALIDATION_ERROR");
  if (purposeCategory === "OTHER" && (!otherPurpose || otherPurpose.length < 3 || otherPurpose.length > 500)) {
    return badRequest("Other Purpose requires an explanation of 3–500 characters.", "OTHER_PURPOSE_REQUIRED");
  }
  if (purposeCategory !== "OTHER" && otherPurpose) return badRequest("An Other Purpose explanation is only accepted for Other Purpose.", "VALIDATION_ERROR");
  if (!privacy.acceptedIdTypes.includes(idType)) return badRequest("Select an ID type approved by company policy.", "ID_TYPE_NOT_ACCEPTED");
  if (!image || !readabilityConfirmed) return badRequest("A valid, readable JPEG, PNG, or WebP ID image up to 5 MB is required.", "ID_IMAGE_INVALID");
  if (privacyVersion !== privacy.noticeVersion || b.privacyAcknowledged !== true) {
    return badRequest("Acknowledge the current privacy notice before submitting.", "PRIVACY_NOTICE_REQUIRED");
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return badRequest("The submission key is invalid. Reset the kiosk and try again.", "IDEMPOTENCY_KEY_INVALID");

  const expectedArrival = new Date(expectedRaw);
  if (Number.isNaN(expectedArrival.getTime()) || expectedArrival.getTime() <= Date.now() - 5 * 60_000
    || expectedArrival.getTime() > Date.now() + 366 * 24 * 60 * 60_000) {
    return badRequest("Choose a valid expected arrival within the next year.", "VISIT_TIME_INVALID");
  }

  let host: { id: string; department: string | null } | null = null;
  if (hostId) {
    const { data, error } = await db.from("users").select("id, department")
      .eq("id", hostId).eq("status", "ACTIVE").eq("is_deleted", false).maybeSingle();
    if (error) throw new Error(`kiosk host lookup failed: ${error.message}`);
    if (!data) return badRequest("The selected host is no longer available.", "VISITOR_HOST_REQUIRED");
    host = data;
    receivingDepartment = data.department ?? receivingDepartment;
  }
  if (purposeCategory === "MEETING_EMPLOYEE" && !host) return badRequest("Select an active employee host.", "VISITOR_HOST_REQUIRED");
  if (FIXED_DEPARTMENT_PURPOSES.has(purposeCategory) && !routedDepartment) return badRequest("The selected purpose has no configured receiving department.", "VISITOR_DESTINATION_REQUIRED");
  if (!host && !receivingDepartment) return badRequest("Select a receiving department or employee host.", "VISITOR_DESTINATION_REQUIRED");
  if (receivingDepartment) {
    const { count, error } = await db.from("users").select("id", { count: "exact", head: true })
      .eq("department", receivingDepartment).eq("status", "ACTIVE").eq("is_deleted", false);
    if (error) throw new Error(`kiosk department validation failed: ${error.message}`);
    if (!count) return badRequest("The selected receiving department is unavailable.", "VISITOR_DESTINATION_REQUIRED");
  }

  const submissionKeyHash = await sha256(idempotencyKey);
  const { data: existing, error: duplicateError } = await db.from("visitors")
    .select("reference_number, approval_status").eq("submission_key_hash", submissionKeyHash).maybeSingle();
  if (duplicateError) throw new Error(`kiosk duplicate lookup failed: ${duplicateError.message}`);
  if (existing) return jsonResponse(ok({
    referenceNumber: existing.reference_number,
    approvalStatus: existing.approval_status,
    duplicate: true,
  }, "This registration was already received"), 200);

  const visitorId = crypto.randomUUID();
  const storagePath = `${visitorId}/id-front-${crypto.randomUUID()}.${image.extension}`;
  const { error: uploadError } = await db.storage.from(IMAGE_BUCKET).upload(storagePath, image.bytes, {
    contentType: image.mime,
    upsert: false,
  });
  if (uploadError) throw new Error(`secure ID image upload failed: ${uploadError.message}`);

  const retentionDays = Number(envText("VISITOR_IDENTITY_RETENTION_DAYS"));
  const deleteAfter = Number.isInteger(retentionDays) && retentionDays > 0
    ? new Date(Date.now() + retentionDays * 24 * 60 * 60_000).toISOString()
    : null;
  const reference = referenceNumber();
  const purposeLabel = KIOSK_PURPOSES.find((item) => item.value === purposeCategory)?.label ?? purposeCategory;
  const { data: saved, error: insertError } = await db.from("visitors").insert({
    id: visitorId,
    full_name: fullName,
    email,
    phone_number: phoneNumber,
    company,
    id_number: null,
    id_type: idType,
    id_number_last4: idNumberLast4,
    host_id: host?.id ?? null,
    receiving_department: receivingDepartment,
    purpose_category: purposeCategory,
    purpose_of_visit: otherPurpose ? `${purposeLabel}: ${otherPurpose}` : purposeLabel,
    other_purpose: otherPurpose,
    expected_arrival: expectedArrival.toISOString(),
    status: "REGISTERED",
    registration_source: "KIOSK",
    reference_number: reference,
    privacy_notice_version: privacy.noticeVersion,
    privacy_acknowledged_at: new Date().toISOString(),
    identity_verification_status: "PROVIDER_NOT_CONFIGURED",
    identity_verification_provider: null,
    approval_status: "PENDING",
    access_status: "NOT_AUTHORIZED",
    email_delivery_status: "NOT_REQUESTED",
    submission_key_hash: submissionKeyHash,
    qr_code_token: null,
    created_by: "visitor-kiosk",
    updated_at: naiveIso(),
  }).select("id, reference_number, approval_status").single();
  if (insertError) {
    await db.storage.from(IMAGE_BUCKET).remove([storagePath]);
    if (insertError.code === "23505") {
      const { data: retry } = await db.from("visitors").select("reference_number, approval_status")
        .eq("submission_key_hash", submissionKeyHash).maybeSingle();
      if (retry) return jsonResponse(ok({ referenceNumber: retry.reference_number, approvalStatus: retry.approval_status, duplicate: true }, "This registration was already received"), 200);
    }
    throw new Error(`kiosk visitor registration failed: ${insertError.message}`);
  }

  const { error: artifactError } = await db.from("visitor_identity_artifacts").insert({
    visitor_id: visitorId,
    artifact_type: "ID_FRONT",
    storage_path: storagePath,
    mime_type: image.mime,
    byte_size: image.bytes.length,
    delete_after: deleteAfter,
  });
  if (artifactError) console.error(`visitor identity artifact metadata failed for ${visitorId}: ${artifactError.message}`);

  if (host?.id) {
    const { error: notificationError } = await db.from("employee_notifications").insert({
      recipient_id: host.id,
      title: `Visitor approval requested: ${reference}`,
      message: `${fullName} submitted a ${purposeLabel.toLowerCase()} request for ${expectedArrival.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}. Identity requires authorized manual review.`,
      type: "VISITOR_APPROVAL_REQUIRED",
      related_entity_type: "Visitor",
      related_entity_id: visitorId,
      dedup_key: `visitor-kiosk:${visitorId}:approval-required`,
      is_read: false,
      created_at: naiveIso(),
      updated_at: naiveIso(),
    });
    if (notificationError && notificationError.code !== "23505") console.error(`visitor host notification failed: ${notificationError.message}`);
  }
  await writeAudit(null, "KIOSK_VISITOR_SUBMITTED", MODULE, "Visitor", visitorId,
    `Kiosk request ${reference} submitted pending identity review and approval.`, resolveClientIp(req).ip, "INFO");
  return jsonResponse(ok({
    id: saved.id,
    referenceNumber: saved.reference_number,
    approvalStatus: saved.approval_status,
    identityVerificationStatus: "PROVIDER_NOT_CONFIGURED",
  }, "Visitor request submitted for approval"), 201);
}

async function handleIdentityArtifacts(_ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db.from("visitor_identity_artifacts")
    .select("id, artifact_type, storage_path, mime_type, byte_size, captured_at, delete_after")
    .eq("visitor_id", p.id).is("deleted_at", null).order("captured_at");
  if (error) throw new Error(`visitor identity artifact load failed: ${error.message}`);
  const signed = await Promise.all((data ?? []).map(async (artifact) => {
    const { data: signedData, error: signedError } = await db.storage.from(IMAGE_BUCKET)
      .createSignedUrl(artifact.storage_path, 300);
    if (signedError) throw new Error(`visitor identity artifact signing failed: ${signedError.message}`);
    return {
      id: artifact.id,
      type: artifact.artifact_type,
      mimeType: artifact.mime_type,
      byteSize: artifact.byte_size,
      capturedAt: artifact.captured_at,
      deleteAfter: artifact.delete_after,
      signedUrl: signedData.signedUrl,
      expiresInSeconds: 300,
    };
  }));
  return jsonResponse(ok(signed, "Temporary identity-artifact links created"), 200);
}

async function handleManualIdentityReview(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  const visitor = await loadVisitor(p.id);
  if (!visitor || visitor.registration_source !== "KIOSK") return emptyNotFound();
  const b = (body ?? {}) as Record<string, unknown>;
  const decision = String(b.decision ?? "").trim().toUpperCase();
  const notes = String(b.notes ?? "").trim();
  if (!['APPROVE', 'REJECT'].includes(decision) || notes.length < 5 || notes.length > 1000) {
    return badRequest("A manual-review decision and notes of 5–1000 characters are required.", "MANUAL_REVIEW_DETAILS_REQUIRED");
  }
  const { count, error: artifactError } = await db.from("visitor_identity_artifacts")
    .select("id", { count: "exact", head: true }).eq("visitor_id", visitor.id).eq("artifact_type", "ID_FRONT").is("deleted_at", null);
  if (artifactError) throw new Error(`identity artifact validation failed: ${artifactError.message}`);
  if (!count) return badRequest("The visitor has no available ID image for manual review.", "IDENTITY_ARTIFACT_REQUIRED");

  const approved = decision === "APPROVE";
  const now = new Date().toISOString();
  const { data: verification, error: verificationError } = await db.from("visitor_verifications").insert({
    visitor_id: visitor.id,
    id_type: visitor.id_type ?? "OTHER",
    id_number: null,
    extracted_fields: { source: "AUTHORIZED_MANUAL_REVIEW", retainedIdentifier: visitor.id_number_last4 ? "LAST_FOUR_ONLY" : "NONE" },
    match_score: null,
    watchlist_status: "NOT_AUTOMATED",
    verification_status: approved ? "VERIFIED" : "FAILED",
    verified_at: now,
    verified_by: ctx!.email,
    notes,
    automated_clearance: "REVIEW_REQUIRED",
    clearance_state: approved ? "CLEAR" : "BLOCKED",
    reviewed_by: ctx!.userId,
    reviewed_at: now,
    review_notes: notes,
    created_by: ctx!.email,
  }).select("*").single();
  if (verificationError) throw new Error(`manual visitor verification failed: ${verificationError.message}`);
  const { error: updateError } = await db.from("visitors").update({
    current_verification_id: verification.id,
    identity_verification_status: approved ? "MANUAL_REVIEW_APPROVED" : "FAILED",
    access_status: approved ? "NOT_AUTHORIZED" : "REVOKED",
    updated_by: ctx!.email,
    updated_at: naiveIso(),
  }).eq("id", visitor.id);
  if (updateError) throw new Error(`manual visitor verification update failed: ${updateError.message}`);
  await db.from("visitor_workflow_events").insert({
    visitor_id: visitor.id,
    verification_id: verification.id,
    event_type: approved ? "MANUAL_IDENTITY_APPROVED" : "MANUAL_IDENTITY_REJECTED",
    actor_id: ctx!.userId,
    actor_email: ctx!.email,
    actor_role: "FACILITIES_OFFICER",
    details: { notes },
  });
  await writeAudit(ctx!.user, approved ? "MANUAL_IDENTITY_APPROVED" : "MANUAL_IDENTITY_REJECTED", MODULE,
    "Visitor", visitor.id, `Manual identity review recorded for request ${visitor.reference_number ?? visitor.id}.`, resolveClientIp(req).ip, approved ? "INFO" : "HIGH");
  return jsonResponse(ok(toVerificationDto(verification as unknown as VerificationRow), "Manual identity review recorded"), 200);
}

type PassEmailResult = { status: "ACCEPTED" | "FAILED" | "NOT_CONFIGURED"; providerId?: string; error?: string };

function visitorSiteUrl(): string {
  return (envText("PORTAL_PUBLIC_URL") || envText("VISITOR_KIOSK_PUBLIC_URL")).replace(/\/+$/, "");
}

async function sendVisitorPassEmail(visitor: VisitorRow, token: string): Promise<PassEmailResult> {
  const apiKey = envText("RESEND_API_KEY");
  const from = envText("RESEND_FROM_EMAIL");
  const publicUrl = visitorSiteUrl();
  if (!apiKey || !from || !publicUrl) return { status: "NOT_CONFIGURED", error: "Resend sender credentials or public application URL are not configured." };
  const passUrl = `${publicUrl}/visitor-pass/${encodeURIComponent(token)}`;
  let qrDataUrl: string;
  try {
    qrDataUrl = await QRCode.toDataURL(passUrl, { errorCorrectionLevel: "M", width: 480, margin: 2 });
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message : "QR generation failed" };
  }
  const qrBase64 = qrDataUrl.split(",", 2)[1] ?? "";
  const host = hostOf(visitor);
  const destination = host
    ? `${host.first_name ?? ""} ${host.last_name ?? ""}`.trim()
    : visitor.receiving_department ?? "Receiving department";
  const subject = `Approved visitor pass ${visitor.reference_number ?? ""}`.trim();
  const text = [
    `Your Hirna TNVS visitor request ${visitor.reference_number ?? ""} is approved.`,
    `Visit: ${visitor.purpose_of_visit}`,
    `Destination: ${destination}`,
    `Expected arrival: ${visitor.expected_arrival ?? "See approved schedule"}`,
    `Pass valid until: ${visitor.qr_expires_at ?? "See approved schedule"}`,
    "Present the attached QR pass to authorized security staff. Approval does not waive on-site security checks.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#172033"><h2>Visitor pass approved</h2><p>Your request <strong>${htmlEscape(visitor.reference_number ?? "")}</strong> is approved.</p><p><strong>Visit:</strong> ${htmlEscape(visitor.purpose_of_visit ?? "")}</p><p><strong>Destination:</strong> ${htmlEscape(destination)}</p><p><strong>Expected arrival:</strong> ${htmlEscape(visitor.expected_arrival ?? "See approved schedule")}</p><p><strong>Valid until:</strong> ${htmlEscape(visitor.qr_expires_at ?? "See approved schedule")}</p><p>The QR pass is attached. Present it to authorized security staff. Approval does not waive on-site security checks.</p></div>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [visitor.email],
        subject,
        text,
        html,
        attachments: [{ filename: `${visitor.reference_number ?? "visitor-pass"}.png`, content: qrBase64 }],
      }),
    });
    const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) return { status: "FAILED", error: responseBody.message || `Resend returned HTTP ${response.status}` };
    return { status: "ACCEPTED", providerId: responseBody.id };
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message : "Email provider request failed" };
  }
}

async function issueAndEmailVisitorPass(visitor: VisitorRow, actorEmail: string): Promise<VisitorRow> {
  const ttlHours = Number(envText("VISITOR_PASS_TTL_HOURS"));
  const earlyMinutes = Number(envText("VISITOR_PASS_EARLY_MINUTES"));
  if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 168 || !Number.isFinite(earlyMinutes) || earlyMinutes < 0 || earlyMinutes > 1440) {
    throw new Error("VISITOR_PASS_POLICY_NOT_CONFIGURED");
  }
  const arrival = new Date(visitor.expected_arrival ?? "");
  if (Number.isNaN(arrival.getTime())) throw new Error("VISITOR_EXPECTED_ARRIVAL_INVALID");
  const expiresAt = new Date(arrival.getTime() + ttlHours * 60 * 60_000);
  if (expiresAt.getTime() <= Date.now()) throw new Error("VISITOR_PASS_WINDOW_EXPIRED");
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = `vst_${base64Url(tokenBytes)}`;
  const tokenHash = await sha256(token);
  const issuedAt = new Date().toISOString();
  const { data: issued, error: issueError } = await db.from("visitors").update({
    qr_token_hash: tokenHash,
    qr_code_token: null,
    qr_issued_at: issuedAt,
    qr_expires_at: expiresAt.toISOString(),
    qr_revoked_at: null,
    access_status: "AUTHORIZED",
    email_delivery_status: "PENDING",
    email_provider_id: null,
    email_delivery_error: null,
    email_attempted_at: issuedAt,
    updated_by: actorEmail,
    updated_at: naiveIso(),
  }).eq("id", visitor.id).select("*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)").single();
  if (issueError) throw new Error(`visitor pass issue failed: ${issueError.message}`);
  const delivery = await sendVisitorPassEmail(issued as unknown as VisitorRow, token);
  const { data: saved, error: deliveryError } = await db.from("visitors").update({
    email_delivery_status: delivery.status,
    email_provider_id: delivery.providerId ?? null,
    email_delivery_error: delivery.error?.slice(0, 500) ?? null,
    email_attempted_at: new Date().toISOString(),
    updated_at: naiveIso(),
  }).eq("id", visitor.id).select("*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)").single();
  if (deliveryError) throw new Error(`visitor pass delivery status failed: ${deliveryError.message}`);
  return saved as unknown as VisitorRow;
}

async function handleApprovalDecision(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  const visitor = await loadVisitor(p.id);
  if (!visitor || visitor.registration_source !== "KIOSK") return emptyNotFound();
  const b = (body ?? {}) as Record<string, unknown>;
  const decision = String(b.decision ?? "").trim().toUpperCase();
  const reason = String(b.reason ?? "").trim();
  if (!['APPROVE', 'DECLINE'].includes(decision)) return badRequest("Decision must be APPROVE or DECLINE.", "VALIDATION_ERROR");
  if (visitor.approval_status !== "PENDING") return jsonResponse(fail("This request already has a final approval decision.", "VISITOR_APPROVAL_ALREADY_DECIDED"), 409);
  if (decision === "DECLINE") {
    if (reason.length < 5 || reason.length > 1000) return badRequest("A decline reason of 5–1000 characters is required.", "DECLINE_REASON_REQUIRED");
    const now = new Date().toISOString();
    const { data, error } = await db.from("visitors").update({
      approval_status: "DECLINED",
      declined_by: ctx!.userId,
      declined_at: now,
      approval_reason: reason,
      access_status: "REVOKED",
      qr_revoked_at: now,
      email_delivery_status: "NOT_REQUESTED",
      updated_by: ctx!.email,
      updated_at: naiveIso(),
    }).eq("id", visitor.id).eq("approval_status", "PENDING")
      .select("*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)").maybeSingle();
    if (error) throw new Error(`visitor decline failed: ${error.message}`);
    if (!data) return jsonResponse(fail("This request was already decided.", "VISITOR_APPROVAL_ALREADY_DECIDED"), 409);
    await writeAudit(ctx!.user, "DECLINE_KIOSK_VISITOR", MODULE, "Visitor", visitor.id,
      `Visitor request ${visitor.reference_number ?? visitor.id} declined.`, resolveClientIp(req).ip, "INFO");
    return jsonResponse(ok(toVisitorDto(data as unknown as VisitorRow), "Visitor request declined"), 200);
  }

  if (!['VERIFIED', 'MANUAL_REVIEW_APPROVED'].includes(visitor.identity_verification_status ?? "")) {
    return jsonResponse(fail("Identity verification or an authorized manual identity review must be completed before approval.", "VISITOR_IDENTITY_REVIEW_REQUIRED"), 409);
  }
  const now = new Date().toISOString();
  const { data: approved, error: approvalError } = await db.from("visitors").update({
    approval_status: "APPROVED",
    approved_by: ctx!.userId,
    approved_at: now,
    approval_reason: reason || null,
    updated_by: ctx!.email,
    updated_at: naiveIso(),
  }).eq("id", visitor.id).eq("approval_status", "PENDING")
    .select("*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)").maybeSingle();
  if (approvalError) throw new Error(`visitor approval failed: ${approvalError.message}`);
  if (!approved) return jsonResponse(fail("This request was already decided.", "VISITOR_APPROVAL_ALREADY_DECIDED"), 409);
  let delivered: VisitorRow;
  try {
    delivered = await issueAndEmailVisitorPass(approved as unknown as VisitorRow, ctx!.email);
  } catch (error) {
    const code = error instanceof Error ? error.message : "VISITOR_PASS_ISSUE_FAILED";
    if (code === "VISITOR_PASS_POLICY_NOT_CONFIGURED" || code === "VISITOR_PASS_WINDOW_EXPIRED") {
      await db.from("visitors").update({
        access_status: "NOT_AUTHORIZED",
        email_delivery_status: "NOT_CONFIGURED",
        email_delivery_error: code,
        updated_at: naiveIso(),
      }).eq("id", visitor.id);
      return jsonResponse(fail("The visit was approved, but no pass was issued because the approved pass-validity policy is missing or the visit window has elapsed.", code), 503);
    }
    throw error;
  }
  await writeAudit(ctx!.user, "APPROVE_KIOSK_VISITOR", MODULE, "Visitor", visitor.id,
    `Visitor request ${visitor.reference_number ?? visitor.id} approved; pass email status ${delivered.email_delivery_status}.`, resolveClientIp(req).ip, "INFO");
  return jsonResponse(ok(toVisitorDto(delivered), delivered.email_delivery_status === "ACCEPTED"
    ? "Visitor approved and pass accepted by the email provider"
    : "Visitor approved; pass delivery requires staff attention"), 200);
}

async function handleRetryPassEmail(ctx: AuthContext | null, req: Request, _body: unknown, p: RouteParams) {
  const visitor = await loadVisitor(p.id);
  if (!visitor || visitor.registration_source !== "KIOSK") return emptyNotFound();
  if (visitor.approval_status !== "APPROVED" || !['VERIFIED', 'MANUAL_REVIEW_APPROVED'].includes(visitor.identity_verification_status ?? "")) {
    return jsonResponse(fail("Only an approved, identity-cleared visit can receive a pass.", "VISITOR_NOT_CLEARED"), 409);
  }
  if (visitor.email_delivery_status === "ACCEPTED") return jsonResponse(fail("The provider already accepted this pass email. A retry was not sent.", "VISITOR_EMAIL_ALREADY_ACCEPTED"), 409);
  const saved = await issueAndEmailVisitorPass(visitor, ctx!.email);
  await writeAudit(ctx!.user, "RETRY_VISITOR_PASS_EMAIL", MODULE, "Visitor", visitor.id,
    `Visitor pass replaced and email retried; provider status ${saved.email_delivery_status}.`, resolveClientIp(req).ip, "INFO");
  return jsonResponse(ok(toVisitorDto(saved), saved.email_delivery_status === "ACCEPTED"
    ? "Replacement pass accepted by the email provider"
    : "Replacement pass created, but email delivery was not accepted"), 200);
}

async function visitorByPassToken(token: string): Promise<VisitorRow | null> {
  if (!/^vst_[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await db.from("visitors")
    .select("*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)")
    .eq("qr_token_hash", tokenHash).eq("registration_source", "KIOSK").eq("is_deleted", false).maybeSingle();
  if (error) throw new Error(`visitor pass lookup failed: ${error.message}`);
  return data as unknown as VisitorRow | null;
}

function validateVisitorPass(visitor: VisitorRow): { code: string; message: string } | null {
  if (visitor.approval_status !== "APPROVED") return { code: "VISITOR_NOT_APPROVED", message: "This visitor request is not approved." };
  if (!['VERIFIED', 'MANUAL_REVIEW_APPROVED'].includes(visitor.identity_verification_status ?? "")) return { code: "VISITOR_IDENTITY_NOT_CLEARED", message: "Identity clearance is incomplete." };
  if (visitor.access_status !== "AUTHORIZED" || visitor.qr_revoked_at) return { code: "VISITOR_PASS_REVOKED", message: "This visitor pass is not active." };
  if (!visitor.qr_expires_at || new Date(visitor.qr_expires_at).getTime() <= Date.now()) return { code: "VISITOR_PASS_EXPIRED", message: "This visitor pass has expired." };
  const earlyMinutes = Number(envText("VISITOR_PASS_EARLY_MINUTES"));
  const expected = new Date(visitor.expected_arrival ?? "").getTime();
  if (Number.isFinite(earlyMinutes) && Number.isFinite(expected) && Date.now() < expected - earlyMinutes * 60_000) {
    return { code: "VISITOR_PASS_TOO_EARLY", message: "This visitor pass is not valid yet." };
  }
  return null;
}

async function handleInspectVisitorPass(_ctx: AuthContext | null, _req: Request, body: unknown) {
  const token = String((body as Record<string, unknown> | null)?.token ?? "").trim();
  const visitor = await visitorByPassToken(token);
  if (!visitor) return jsonResponse(fail("This visitor pass is invalid.", "VISITOR_PASS_INVALID"), 404);
  const invalid = validateVisitorPass(visitor);
  if (invalid) return jsonResponse(fail(invalid.message, invalid.code), 409);
  const host = hostOf(visitor);
  return jsonResponse(ok({
    referenceNumber: visitor.reference_number,
    visitorName: visitor.full_name.split(/\s+/)[0],
    purpose: visitor.purpose_category,
    destination: host ? `${host.first_name ?? ""} ${host.last_name ?? ""}`.trim() : visitor.receiving_department,
    expectedArrival: visitor.expected_arrival,
    expiresAt: visitor.qr_expires_at,
    status: visitor.status,
  }, "Visitor pass is active"), 200);
}

async function handleVisitorPassScan(ctx: AuthContext | null, req: Request, body: unknown, checkOut: boolean) {
  const token = String((body as Record<string, unknown> | null)?.token ?? "").trim();
  const visitor = await visitorByPassToken(token);
  if (!visitor) return jsonResponse(fail("This visitor pass is invalid.", "VISITOR_PASS_INVALID"), 404);
  const invalid = validateVisitorPass(visitor);
  if (invalid) return jsonResponse(fail(invalid.message, invalid.code), 409);
  if (!checkOut && visitor.status !== "REGISTERED") {
    return jsonResponse(fail(visitor.status === "CHECKED_IN" ? "This pass has already been checked in." : "This pass cannot be checked in again.", "VISITOR_PASS_ALREADY_USED"), 409);
  }
  if (checkOut && visitor.status !== "CHECKED_IN") return jsonResponse(fail("This visitor is not currently checked in.", "VISITOR_NOT_CHECKED_IN"), 409);
  const response = checkOut
    ? await handleCheckOut(ctx, req, body, { id: visitor.id })
    : await handleCheckIn(ctx, req, body, { id: visitor.id });
  return response;
}

async function handleListVisitors(ctx: AuthContext | null) {
  const { data, error } = await db
    .from("visitors")
    .select(
      "*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)",
    )
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`visitors load failed: ${error.message}`);
  const rows = (data as unknown as VisitorRow[]) ?? [];
  const clearances = await currentClearanceMap(rows);
  const includeSensitiveId = ctx!.user.assignedRoles.includes("FACILITIES_OFFICER");
  return jsonResponse(ok(rows.map((row) => toVisitorDto(
    row,
    row.current_verification_id ? clearances.get(row.current_verification_id) ?? null : null,
    includeSensitiveId,
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
    qr_code_token: null,
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

  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor registered; no entry pass has been issued"), 200);
}

async function handleCheckIn(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  const { data, error } = await db.rpc("phase5_check_in_visitor", {
    p_visitor_id: p.id,
    p_actor_id: ctx!.userId,
    p_actor_email: ctx!.email,
    p_actor_role: workflowActorRole(ctx!, "FACILITIES_OFFICER"),
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
    p_actor_role: workflowActorRole(ctx!, "FACILITIES_OFFICER"),
  });
  if (error) throw new Error(`visitor check-out transaction failed: ${error.message}`);
  const result = data as WorkflowRpcResult;
  if (!result.ok) return workflowResponse(result, "Visitor checked out");
  const saved = await loadVisitor(p.id);
  return saved ? jsonResponse(ok(toVisitorDto(saved), "Visitor checked out"), 200) : emptyNotFound();
}

async function handleVerifyAndAllow(ctx: AuthContext | null, req: Request, body: unknown, p: RouteParams) {
  const verificationResponse = await handleVerify(ctx, req, body, p);
  if (!verificationResponse.ok) return verificationResponse;
  const verification = (await verificationResponse.json()).data;
  if (verification.clearanceState !== "CLEAR") {
    return jsonResponse(ok({ visitor: null, verification }, "Verification requires review before entry"), 200);
  }
  // The transaction enforces the latest clearance, watchlist, and visit state.
  const checkInResponse = await handleCheckIn(ctx, req, body, p);
  if (!checkInResponse.ok) return checkInResponse;
  const visitor = (await checkInResponse.json()).data;
  return jsonResponse(ok({ visitor, verification }, "Visitor verified and allowed"), 200);
}

async function handleDeny(ctx: AuthContext | null, _req: Request, body: unknown, p: RouteParams) {
  const reason = String((body as Record<string, unknown> | null)?.reason ?? "").trim();
  if (!reason) return badRequest("A denial reason is required.", "DENIAL_REASON_REQUIRED");
  const visitor = await loadVisitor(p.id);
  if (!visitor) return emptyNotFound();
  const { data: saved, error } = await db.from("visitors").update({
    status: "DENIED",
    denial_reason: reason,
    updated_by: ctx?.email ?? "system",
    updated_at: naiveIso(),
  }).eq("id", p.id).select("*, users(id, first_name, last_name, email, employee_id, department, position, avatar_url, phone_number, status)").single();
  if (error) throw new Error(`visitor denial failed: ${error.message}`);
  await writeAudit(ctx?.user ?? null, "DENY_VISITOR", MODULE, "Visitor", p.id,
    `Visitor '${visitor.full_name}' denied. Reason: ${reason}`, ctx?.ip ?? null, "HIGH");
  const { error: securityLogError } = await db.from("security_logs").insert({
    action: "DENY_VISITOR",
    module: MODULE,
    full_name: visitor.full_name,
    role: ctx?.roles.join(",") ?? "FACILITIES_OFFICER",
    ip_address: ctx?.ip ?? null,
    risk_level: "HIGH",
    status: "SUCCESS",
    reason,
  });
  if (securityLogError) console.error(`visitor denial security log failed: ${securityLogError.message}`);
  return jsonResponse(ok(toVisitorDto(saved as unknown as VisitorRow), "Visitor denied and flagged"), 200);
}

async function handleOccupancy() {
  const [{ count: visitorCount, error: visitorError }, { count: inviteeCount, error: inviteeError }, { data: facilities, error: facilityError }] = await Promise.all([
    db.from("visitors").select("id", { count: "exact", head: true }).eq("status", "CHECKED_IN").eq("is_deleted", false),
    db.from("reservation_invitees").select("id", { count: "exact", head: true }).eq("check_in_status", true),
    db.from("facilities").select("total_capacity").eq("active", true),
  ]);
  if (visitorError) throw new Error(`visitor occupancy load failed: ${visitorError.message}`);
  if (inviteeError) throw new Error(`reservation occupancy load failed: ${inviteeError.message}`);
  if (facilityError) throw new Error(`facility capacity load failed: ${facilityError.message}`);
  const maxCapacity = Math.max(1, ((facilities ?? []) as Array<{ total_capacity: number | null }>).reduce((sum, row) => sum + Number(row.total_capacity ?? 0), 0));
  const current = Number(visitorCount ?? 0) + Number(inviteeCount ?? 0);
  return jsonResponse(ok({ current, maxCapacity, rate: Math.round((current / maxCapacity) * 1000) / 10 }, "Live hub occupancy calculated"), 200);
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
    p_actor_role: workflowActorRole(ctx!, "FACILITIES_OFFICER"),
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
    p_actor_role: workflowActorRole(ctx!, "FACILITIES_OFFICER"),
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
    console.error("Failed to notify the visitor host:", (e as Error).message);
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
  { method: "GET", path: "/visitor-kiosk/config", guard: { kind: "public" }, handler: handleKioskConfig },
  { method: "POST", path: "/visitor-kiosk/register", guard: { kind: "public" }, handler: handleKioskRegister },
  { method: "POST", path: "/visitor-pass/inspect", guard: { kind: "public" }, handler: handleInspectVisitorPass },
  { method: "POST", path: "/visitor-passes/check-in", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: (ctx: AuthContext | null, req: Request, body: unknown) => handleVisitorPassScan(ctx, req, body, false) },
  { method: "POST", path: "/visitor-passes/check-out", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: (ctx: AuthContext | null, req: Request, body: unknown) => handleVisitorPassScan(ctx, req, body, true) },
  // Backward compatibility for clients that previously collapsed /visitors
  // to the deployed singular function path /visitor.
  { method: "GET", path: "/visitor", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleListVisitors },
  { method: "GET", path: "/visitors", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleListVisitors },
  { method: "POST", path: "/visitors/register", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleRegister },
  { method: "GET", path: "/visitors/:id/identity-artifacts", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleIdentityArtifacts },
  { method: "POST", path: "/visitors/:id/manual-identity-review", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleManualIdentityReview },
  { method: "POST", path: "/visitors/:id/approval", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleApprovalDecision },
  { method: "POST", path: "/visitors/:id/email-retry", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleRetryPassEmail },
  { method: "POST", path: "/visitors/:id/check-in", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleCheckIn },
  { method: "POST", path: "/visitors/:id/check-out", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleCheckOut },
  { method: "POST", path: "/visitors/:id/verify", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleVerify },
  { method: "POST", path: "/visitors/:id/verifications/:verificationId/review", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleReview },
  { method: "GET", path: "/visitors/:id/verifications", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleVerifications },
  { method: "GET", path: "/visitors/:id/history", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleVisitorHistory },
  { method: "GET", path: "/visitors/watchlist", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleListWatchlist },
  { method: "POST", path: "/visitors/watchlist", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleAddWatchlist },
  { method: "POST", path: "/visitors/watchlist/:id/status", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleWatchlistStatus },
  { method: "POST", path: "/visitors/:id/verify-allow", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleVerifyAndAllow },
  { method: "POST", path: "/visitors/:id/deny", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }, handler: handleDeny },
  { method: "GET", path: "/visitors/occupancy", guard: { kind: "roles", roles: VISITOR_VIEW_ROLES }, handler: handleOccupancy },
] as const;

Deno.serve(createHandler(routes as never, { name: "visitor" }));
