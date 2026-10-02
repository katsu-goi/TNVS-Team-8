import { verifyAccessToken } from "./jwt.ts";
import { findUserByEmail, findUserById, AuthUser, isAccountActive, userSummary } from "./auth-users.ts";
import { applyCors, corsHeaders, isPreflight, jsonResponse, preflightResponse } from "./cors.ts";
import { fail } from "./envelope.ts";
import { assertEnv } from "./config.ts";
import { adminDb } from "./db.ts";
import { resolveClientIp } from "./ip.ts";
import { consumeRateLimit, tierFor } from "./rate-limit.ts";

export type AuthContext = {
  user: AuthUser;
  email: string;
  userId: string;
  roles: string[]; // plain names, e.g. ["SUPER_ADMIN"]
  permissions: string[];
  authorities: string[]; // ROLE_* + permission names
  ip: string;
  userAgent: string | null;
  oversight?: {
    sessionId: string;
    mode: "IMPERSONATION" | "SHADOW";
    readOnly: boolean;
    justification: string;
    actorUserId: string;
    actorEmail: string;
    actorFullName: string;
    targetUserId: string;
    targetEmail: string;
    targetFullName: string;
    targetRoles: string[];
    startedAt: string;
    expiresAt: string | null;
    durationMinutes: number | null;
    manualTerminationRequired: boolean;
  };
};

export function unauthorizedResponse(): Response {
  // Mirrors JwtAuthenticationEntryPoint.
  return jsonResponse(
    fail("Authentication required. Please provide a valid token.", "UNAUTHORIZED"),
    401,
    corsHeaders(),
  );
}

export function forbiddenResponse(): Response {
  // Mirrors GlobalExceptionHandler.handleAccessDenied.
  return jsonResponse(
    fail("Access denied: insufficient permissions", "ACCESS_DENIED"),
    403,
    corsHeaders(),
  );
}

function oversightReadOnlyResponse(): Response {
  return jsonResponse(
    fail(
      "Oversight sessions are read-only. Exit oversight mode before making changes.",
      "OVERSIGHT_READ_ONLY",
    ),
    403,
    corsHeaders(),
  );
}

export function envMissingResponse(e: unknown): Response {
  return jsonResponse(
    fail("Environment not configured", "ENV_MISSING", [(e as Error).message]),
    500,
    corsHeaders(),
  );
}

export function internalErrorResponse(e: unknown): Response {
  console.error("handler error:", (e as Error).message);
  return jsonResponse(
    fail("An unexpected error occurred. Please contact system administrator.", "INTERNAL_SERVER_ERROR"),
    500,
    corsHeaders(),
  );
}

export function notFoundResponse(req: Request): Response {
  return jsonResponse(
    fail(`No route for ${req.method} ${new URL(req.url).pathname}`, "NOT_FOUND"),
    404,
    corsHeaders(),
  );
}

/** Extracts and validates the custom access token from the Authorization header. */
export async function extractAuthContext(req: Request): Promise<AuthContext | null> {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const user = await findUserByEmail(payload.sub);
  if (!user || !isAccountActive(user)) return null;
  if ((payload.sessionVersion ?? 1) !== user.row.auth_version) return null;

  const authorities = user.roles.map((r) => `ROLE_${r}`).concat(user.permissions);
  return {
    user,
    email: user.row.email,
    userId: user.row.id,
    roles: user.roles,
    permissions: user.permissions,
    authorities,
    ip: resolveClientIp(req).ip,
    userAgent: req.headers.get("User-Agent"),
  };
}

export function hasAnyRole(ctx: AuthContext, roles: string[]): boolean {
  const normalized = new Set(ctx.roles.map((r) => r.toUpperCase()));
  return roles.some((r) => normalized.has(r.toUpperCase()));
}

export function hasRole(ctx: AuthContext, role: string): boolean {
  return hasAnyRole(ctx, [role]);
}

export function hasAnyAssignedRole(ctx: AuthContext, roles: string[]): boolean {
  const normalized = new Set(ctx.user.assignedRoles.map((role) => role.toUpperCase()));
  return roles.some((role) => normalized.has(role.toUpperCase()));
}

export function isSuperAdmin(ctx: AuthContext): boolean {
  return hasRole(ctx, "SUPER_ADMIN");
}

export function hasAnyPermission(ctx: AuthContext, permissions: string[]): boolean {
  const set = new Set(ctx.permissions.map((p) => p.toUpperCase()));
  return permissions.some((p) => set.has(p.toUpperCase()));
}

export function hasPermission(ctx: AuthContext, permission: string): boolean {
  return hasAnyPermission(ctx, [permission]);
}

const OVERSIGHT_SESSION_HEADER = "X-Oversight-Session";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ActiveOversightSession = {
  id: string;
  actor_user_id: string;
  target_user_id: string;
  mode: "IMPERSONATION" | "SHADOW";
  target_role_names: string[];
  justification: string;
  read_only: boolean;
  started_at: string;
  expires_at: string | null;
  duration_minutes: number | null;
  manual_termination_required: boolean;
};

class OversightContextError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "OversightContextError";
  }
}

function oversightContextErrorResponse(error: OversightContextError): Response {
  return jsonResponse(fail(error.message, error.code), error.status, corsHeaders());
}

function fullName(user: AuthUser): string {
  return `${user.row.first_name ?? ""} ${user.row.last_name ?? ""}`.trim() || user.row.email;
}

async function recordOversightLifecycle(
  actor: AuthContext,
  session: ActiveOversightSession,
  action: string,
  resultStatus: string,
  endedAt: string | null = null,
): Promise<void> {
  const target = await findUserById(session.target_user_id);
  const { error } = await adminDb().from("admin_audit_logs").insert({
    actor_user_id: actor.userId,
    target_user_id: session.target_user_id,
    oversight_session_id: session.id,
    action,
    entity_type: "OversightSession",
    entity_id: session.id,
    details: {
      auditMarker: "Performed via Super Admin Oversight",
      actorEmail: actor.email,
      actorName: fullName(actor.user),
      targetEmail: target?.row.email ?? null,
      targetName: target ? fullName(target) : null,
      targetRoles: session.target_role_names,
      justification: session.justification,
      sessionType: session.mode,
      durationMinutes: session.duration_minutes,
      manualTerminationRequired: session.manual_termination_required,
      startedAt: session.started_at,
      expiresAt: session.expires_at,
      endedAt,
      resultStatus,
    },
    source_ip: actor.ip,
    user_agent: actor.userAgent,
    occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(`oversight lifecycle audit failed: ${error.message}`);
}

async function activeOversightSession(ctx: AuthContext, sessionId: string): Promise<ActiveOversightSession> {
  const { data, error } = await adminDb()
    .from("oversight_sessions")
    .select("id, actor_user_id, target_user_id, mode, target_role_names, justification, read_only, started_at, expires_at, duration_minutes, manual_termination_required")
    .eq("id", sessionId)
    .eq("actor_user_id", ctx.userId)
    .eq("status", "ACTIVE")
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw new Error(`oversight session lookup failed: ${error.message}`);
  if (!data) {
    throw new OversightContextError(403, "OVERSIGHT_SESSION_INVALID", "The oversight session is no longer active.");
  }
  const session = data as ActiveOversightSession;
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) {
    const endedAt = new Date().toISOString();
    const { data: expired, error: expiryError } = await adminDb().from("oversight_sessions").update({
      status: "EXPIRED",
      ended_at: endedAt,
      ended_by: ctx.userId,
      ended_reason: "EXPIRED",
    }).eq("id", session.id).eq("status", "ACTIVE").select("id").maybeSingle();
    if (expiryError) throw new Error(`oversight session expiry failed: ${expiryError.message}`);
    if (expired) await recordOversightLifecycle(ctx, session, "OVERSIGHT_SESSION_EXPIRED", "EXPIRED", endedAt);
    throw new OversightContextError(410, "OVERSIGHT_SESSION_EXPIRED", "The oversight session has expired.");
  }
  return session;
}

function isActorIdentityPath(req: Request): boolean {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  return path.includes("/admin/oversight/") || path.includes("/auth/");
}

async function oversightTargetContext(ctx: AuthContext, req: Request): Promise<AuthContext> {
  if (isActorIdentityPath(req)) return ctx;
  const sessionId = req.headers.get(OVERSIGHT_SESSION_HEADER)?.trim();
  if (!sessionId) return ctx;
  if (!UUID_PATTERN.test(sessionId)) {
    throw new OversightContextError(403, "OVERSIGHT_SESSION_INVALID", "The oversight session identifier is invalid.");
  }
  const session = await activeOversightSession(ctx, sessionId);

  const target = await findUserById(session.target_user_id);
  if (!target || !isAccountActive(target)) {
    const endedAt = new Date().toISOString();
    const { data: ended, error } = await adminDb().from("oversight_sessions").update({
      status: "ENDED",
      ended_at: endedAt,
      ended_by: ctx.userId,
      ended_reason: "TARGET_UNAVAILABLE",
    }).eq("id", session.id).eq("status", "ACTIVE").select("id").maybeSingle();
    if (error) throw new Error(`unavailable oversight target termination failed: ${error.message}`);
    if (ended) {
      await recordOversightLifecycle(ctx, session, "OVERSIGHT_TARGET_UNAVAILABLE", "ENDED", endedAt);
    }
    throw new OversightContextError(409, "OVERSIGHT_TARGET_UNAVAILABLE", "The oversight target account is unavailable.");
  }
  const authorities = target.roles.map((role) => `ROLE_${role}`).concat(target.permissions);
  return {
    ...ctx,
    user: target,
    email: target.row.email,
    userId: target.row.id,
    roles: target.roles,
    permissions: target.permissions,
    authorities,
    oversight: {
      sessionId: session.id,
      mode: session.mode,
      readOnly: session.read_only,
      justification: session.justification,
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      actorFullName: fullName(ctx.user),
      targetUserId: target.row.id,
      targetEmail: target.row.email,
      targetFullName: fullName(target),
      targetRoles: session.target_role_names,
      startedAt: session.started_at,
      expiresAt: session.expires_at,
      durationMinutes: session.duration_minutes,
      manualTerminationRequired: session.manual_termination_required,
    },
  };
}

async function writeOversightActionAudit(
  ctx: AuthContext,
  req: Request,
  route: Route,
  params: RouteParams,
  phase: "AUTHORIZED_ATTEMPT" | "COMPLETED",
  responseStatus?: number,
): Promise<void> {
  if (!ctx.oversight) return;
  const oversight = ctx.oversight;
  const normalizedPath = route.path.replace(/:[^/]+/g, "RESOURCE");
  const action = `OVERSIGHT_${req.method}_${normalizedPath}`.replace(/[^A-Z0-9_]+/gi, "_").slice(0, 100);
  const resourceId = params.id ?? Object.values(params)[0] ?? null;
  const resultStatus = phase === "AUTHORIZED_ATTEMPT"
    ? phase
    : responseStatus != null && responseStatus < 400 ? "SUCCESS" : "FAILED";
  const { error } = await adminDb().from("admin_audit_logs").insert({
    actor_user_id: oversight.actorUserId,
    target_user_id: oversight.targetUserId,
    oversight_session_id: oversight.sessionId,
    action,
    entity_type: route.path.split("/").filter(Boolean).at(-2) ?? "ApplicationResource",
    entity_id: resourceId,
    details: {
      auditMarker: "Performed via Super Admin Oversight",
      actorEmail: oversight.actorEmail,
      actorName: oversight.actorFullName,
      targetEmail: oversight.targetEmail,
      targetName: oversight.targetFullName,
      targetRoles: oversight.targetRoles,
      justification: oversight.justification,
      sessionType: oversight.mode,
      durationMinutes: oversight.durationMinutes,
      manualTerminationRequired: oversight.manualTerminationRequired,
      sessionStartedAt: oversight.startedAt,
      sessionExpiresAt: oversight.expiresAt,
      requestMethod: req.method,
      route: route.path,
      requestPath: new URL(req.url).pathname,
      resourceParams: params,
      resultStatus,
      responseStatus: responseStatus ?? null,
    },
    source_ip: ctx.ip,
    user_agent: ctx.userAgent,
    occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(`oversight action audit failed: ${error.message}`);
}

async function terminateOversightForLogout(ctx: AuthContext, req: Request, body: unknown): Promise<void> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (!path.endsWith("/auth/logout")) return;
  const reason = (body as Record<string, unknown> | null)?.reason;
  if (reason === "INACTIVITY" && hasAnyAssignedRole(ctx, ["SUPER_ADMIN"])) return;
  const { data, error } = await adminDb().from("oversight_sessions")
    .select("id, actor_user_id, target_user_id, mode, target_role_names, justification, read_only, started_at, expires_at, duration_minutes, manual_termination_required")
    .eq("actor_user_id", ctx.userId)
    .eq("status", "ACTIVE")
    .is("ended_at", null);
  if (error) throw new Error(`oversight logout lookup failed: ${error.message}`);
  for (const session of (data ?? []) as ActiveOversightSession[]) {
    const endedAt = new Date().toISOString();
    const { data: ended, error: updateError } = await adminDb().from("oversight_sessions").update({
      status: "ENDED", ended_at: endedAt, ended_by: ctx.userId, ended_reason: "LOGOUT",
    }).eq("id", session.id).eq("status", "ACTIVE").select("id").maybeSingle();
    if (updateError) throw new Error(`oversight logout termination failed: ${updateError.message}`);
    if (ended) {
      await recordOversightLifecycle(ctx, session, "OVERSIGHT_SESSION_ENDED_ON_LOGOUT", "ENDED", endedAt);
    }
  }
}

export type RouteGuard =
  | { kind: "public" }
  | { kind: "auth" }
  | { kind: "roles"; roles: string[] }
  | { kind: "assignedRoles"; roles: string[] }
  | { kind: "permissions"; permissions: string[] }
  | { kind: "rolesOrPermissions"; roles: string[]; permissions: string[] };

export type RouteParams = Record<string, string>;

export type Route = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * Path suffix matched against the request URL (e.g. "/facilities/rooms").
   * Segments may be parameters prefixed with ":" (e.g. "/admin/users/:id/unlock"),
   * matched one path segment each and exposed via `params`.
   */
  path: string;
  guard: RouteGuard;
  handler: (
    ctx: AuthContext | null,
    req: Request,
    body: unknown,
    params: RouteParams,
  ) => Promise<Response> | Response;
};

/** True if the actual path matches the route's path template (suffix match, segment-wise). */
function matchPath(actual: string, template: string): RouteParams | null {
  const actualSegs = actual.split("/").filter(Boolean);
  const templateSegs = template.split("/").filter(Boolean);
  if (templateSegs.length > actualSegs.length) return null;
  const offset = actualSegs.length - templateSegs.length;
  const params: RouteParams = {};
  for (let i = 0; i < templateSegs.length; i++) {
    const t = templateSegs[i];
    const a = actualSegs[offset + i];
    if (t.startsWith(":")) {
      params[t.slice(1)] = a;
    } else if (t !== a) {
      return null;
    }
  }
  return params;
}

export type RouterOptions = {
  /** Custom prefix used only for the 404 message; function name is appended by the platform. */
  name?: string;
};

/**
 * Builds a Deno.serve handler from a route table. Centralizes:
 * preflight/CORS, env check, token extraction, role/permission guards, and
 * the ApiResponse error envelope — so module functions only implement logic.
 */
export function createHandler(routes: Route[], options: RouterOptions = {}): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (isPreflight(req)) return preflightResponse(req);

    const finish = (response: Response) => applyCors(req, response);

    try {
      assertEnv();
    } catch (e) {
      return finish(envMissingResponse(e));
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");
    const route = routes.find((r) => r.method === req.method && matchPath(path, r.path));
    if (!route) return finish(notFoundResponse(req));
    const params = matchPath(path, route.path) ?? {};

    let body: unknown = null;
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      // Only consume the stream for JSON payloads; multipart bodies are parsed
      // by the handler via request.formData() and must not be read here.
      const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
      if (contentType.includes("application/json")) {
        try {
          body = await req.json();
        } catch {
          body = null;
        }
      }
    }

    if (route.guard.kind === "public") {
      const rate = tierFor("guest", route.path);
      const key = `${resolveClientIp(req).ip}:${rate.name}:${route.path}`;
      if (!(await consumeRateLimit(key, rate.spec))) return finish(rateLimitedResponse(rate.spec.windowSeconds));
      return finish(await safeRun(route.handler, null, req, body, params));
    }

    const actorCtx = await extractAuthContext(req);
    if (!actorCtx) return finish(unauthorizedResponse());

    try {
      await terminateOversightForLogout(actorCtx, req, body);
    } catch (e) {
      return finish(internalErrorResponse(e));
    }

    const rate = tierFor(
      hasAnyRole(actorCtx, ["SUPER_ADMIN", "SYSTEM_ADMIN"]) ? "admin" : "user",
      route.path,
    );
    const key = `${actorCtx.userId}:${rate.name}:${route.path}`;
    if (!(await consumeRateLimit(key, rate.spec))) return finish(rateLimitedResponse(rate.spec.windowSeconds));

    let ctx = actorCtx;
    try {
      ctx = await oversightTargetContext(actorCtx, req);
    } catch (e) {
      if (e instanceof OversightContextError) return finish(oversightContextErrorResponse(e));
      return finish(internalErrorResponse(e));
    }

    if (ctx.oversight) {
      try {
        await writeOversightActionAudit(ctx, req, route, params, "AUTHORIZED_ATTEMPT");
      } catch (e) {
        return finish(internalErrorResponse(e));
      }
    }

    if (ctx.oversight?.readOnly && MUTATING_METHODS.has(req.method)) {
      const response = oversightReadOnlyResponse();
      try { await writeOversightActionAudit(ctx, req, route, params, "COMPLETED", response.status); }
      catch (e) { console.error("oversight completion audit failed:", (e as Error).message); }
      return finish(response);
    }

    if (route.guard.kind === "roles" && !hasAnyRole(ctx, route.guard.roles)) {
      const response = forbiddenResponse();
      try { await writeOversightActionAudit(ctx, req, route, params, "COMPLETED", response.status); }
      catch (e) { console.error("oversight completion audit failed:", (e as Error).message); }
      return finish(response);
    }
    if (route.guard.kind === "assignedRoles" && !hasAnyAssignedRole(ctx, route.guard.roles)) {
      const response = forbiddenResponse();
      try { await writeOversightActionAudit(ctx, req, route, params, "COMPLETED", response.status); }
      catch (e) { console.error("oversight completion audit failed:", (e as Error).message); }
      return finish(response);
    }
    if (route.guard.kind === "permissions" && !hasAnyPermission(ctx, route.guard.permissions)) {
      const response = forbiddenResponse();
      try { await writeOversightActionAudit(ctx, req, route, params, "COMPLETED", response.status); }
      catch (e) { console.error("oversight completion audit failed:", (e as Error).message); }
      return finish(response);
    }
    if (route.guard.kind === "rolesOrPermissions"
      && !hasAnyRole(ctx, route.guard.roles)
      && !hasAnyPermission(ctx, route.guard.permissions)) {
      const response = forbiddenResponse();
      try { await writeOversightActionAudit(ctx, req, route, params, "COMPLETED", response.status); }
      catch (e) { console.error("oversight completion audit failed:", (e as Error).message); }
      return finish(response);
    }

    const response = await safeRun(route.handler, ctx, req, body, params);
    try { await writeOversightActionAudit(ctx, req, route, params, "COMPLETED", response.status); }
    catch (e) { console.error("oversight completion audit failed:", (e as Error).message); }
    return finish(response);
  };
}

function rateLimitedResponse(windowSeconds: number): Response {
  const headers = corsHeaders();
  headers.set("Retry-After", String(windowSeconds));
  return jsonResponse(
    fail("Too many requests. Please retry later.", "RATE_LIMITED"),
    429,
    headers,
  );
}

async function safeRun(
  handler: Route["handler"],
  ctx: AuthContext | null,
  req: Request,
  body: unknown,
  params: RouteParams,
): Promise<Response> {
  try {
    return await handler(ctx, req, body, params);
  } catch (e) {
    return internalErrorResponse(e);
  }
}

/** Convenience: JSON body parse that returns null on invalid input. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await req.json();
    return raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Convenience: current user summary for /me-style endpoints. */
export function mePayload(ctx: AuthContext) {
  return userSummary(ctx.user);
}
