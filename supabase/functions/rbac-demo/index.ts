import { createHandler, AuthContext, mePayload } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok } from "../_shared/envelope.ts";

async function handleWhoAmI(ctx: AuthContext | null, _req: Request, _body: unknown) {
  return jsonResponse(ok({
    email: ctx!.email,
    roles: ctx!.roles,
    permissions: ctx!.permissions,
    authorities: ctx!.authorities,
    summary: mePayload(ctx!),
  }), 200);
}

async function handleAdminOnly(_ctx: AuthContext | null, _req: Request, _body: unknown) {
  return jsonResponse(ok({ secret: "admin-area" }), 200);
}

async function handleManagerOrOfficer(ctx: AuthContext | null, _req: Request, _body: unknown) {
  return jsonResponse(ok({ role: ctx!.roles[0] }), 200);
}

async function handlePermissionGate(_ctx: AuthContext | null, _req: Request, _body: unknown) {
  return jsonResponse(ok({ permitted: true }), 200);
}

const routes = [
  { method: "GET", path: "/rbac-demo/whoami", guard: { kind: "auth" }, handler: handleWhoAmI },
  { method: "GET", path: "/rbac-demo/admin", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleAdminOnly },
  { method: "GET", path: "/rbac-demo/facilities", guard: { kind: "roles", roles: ["FACILITIES_MANAGER", "FACILITIES_OFFICER"] }, handler: handleManagerOrOfficer },
  { method: "GET", path: "/rbac-demo/permission", guard: { kind: "permissions", permissions: ["FACILITIES_MANAGE"] }, handler: handlePermissionGate },
] as const;

Deno.serve(createHandler(routes as never, { name: "rbac-demo" }));