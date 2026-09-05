import { verifyAccessToken } from "./jwt.ts";
import { findUserByEmail, findUserById, AuthUser, isAccountActive, userSummary } from "./auth-users.ts";
import { corsHeaders, isPreflight, jsonResponse, preflightResponse } from "./cors.ts";
import { fail } from "./envelope.ts";
import { assertEnv } from "./config.ts";
import { adminDb } from "./db.ts";
import { resolveClientIp } from "./ip.ts";

export type AuthContext = {
  user: AuthUser;
  email: string;
  userId: string;
  roles: string[]; // plain names, e.g. ["SUPER_ADMIN"]
  permissions: string[];
  authorities: string[]; // ROLE_* + permission names
  ip: string;
  userAgent: string | null;
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

type ActiveOversightSession = { id: string; target_user_id: string };

async function activeOversightSession(ctx: AuthContext): Promise<ActiveOversightSession | null> {
  const { data, error } = await adminDb()
    .from("oversight_sessions")
    .select("id, target_user_id")
    .eq("actor_user_id", ctx.userId)
    .eq("read_only", true)
    .eq("status", "ACTIVE")
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`oversight session lookup failed: ${error.message}`);
  return data as ActiveOversightSession | null;
}

function isOversightControlPath(req: Request): boolean {
  return new URL(req.url).pathname.replace(/\/+$/, "").includes("/admin/oversight/");
}

async function activeReadOnlyOversightSession(ctx: AuthContext, req: Request): Promise<boolean> {
  if (!MUTATING_METHODS.has(req.method)) return false;
  if (new URL(req.url).pathname.replace(/\/+$/, "").endsWith("/admin/oversight/stop")) return false;

  const sessionId = req.headers.get(OVERSIGHT_SESSION_HEADER)?.trim();
  if (sessionId && !UUID_PATTERN.test(sessionId)) return true;
  return (await activeOversightSession(ctx)) !== null;
}

async function oversightTargetContext(ctx: AuthContext, req: Request): Promise<AuthContext> {
  if (isOversightControlPath(req)) return ctx;
  const session = await activeOversightSession(ctx);
  if (!session) return ctx;

  const target = await findUserById(session.target_user_id);
  if (!target || !isAccountActive(target)) {
    throw new Error("oversight target is unavailable");
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
  };
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

    try {
      assertEnv();
    } catch (e) {
      return envMissingResponse(e);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");
    const route = routes.find((r) => r.method === req.method && matchPath(path, r.path));
    if (!route) return notFoundResponse(req);
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
      return safeRun(route.handler, null, req, body, params);
    }

    const actorCtx = await extractAuthContext(req);
    if (!actorCtx) return unauthorizedResponse();

    try {
      if (await activeReadOnlyOversightSession(actorCtx, req)) {
        return oversightReadOnlyResponse();
      }
    } catch (e) {
      return internalErrorResponse(e);
    }

    let ctx = actorCtx;
    try {
      ctx = await oversightTargetContext(actorCtx, req);
    } catch (e) {
      return internalErrorResponse(e);
    }

    if (route.guard.kind === "roles" && !hasAnyRole(ctx, route.guard.roles)) {
      return forbiddenResponse();
    }
    if (route.guard.kind === "assignedRoles" && !hasAnyAssignedRole(ctx, route.guard.roles)) {
      return forbiddenResponse();
    }
    if (route.guard.kind === "permissions" && !hasAnyPermission(ctx, route.guard.permissions)) {
      return forbiddenResponse();
    }
    if (route.guard.kind === "rolesOrPermissions"
      && !hasAnyRole(ctx, route.guard.roles)
      && !hasAnyPermission(ctx, route.guard.permissions)) {
      return forbiddenResponse();
    }

    return safeRun(route.handler, ctx, req, body, params);
  };
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
