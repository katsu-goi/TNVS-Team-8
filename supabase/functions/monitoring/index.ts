import { createHandler } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok } from "../_shared/envelope.ts";
import { buildHealthSnapshot } from "../_shared/subsystem-health.ts";

async function handleSubsystems() {
  const snapshot = await buildHealthSnapshot();
  return jsonResponse(ok(snapshot), 200);
}

async function handleSubsystemDetail(_ctx: unknown, _req: Request, _body: unknown, p: Record<string, string>) {
  const snapshot = await buildHealthSnapshot();
  const id = p.id;
  const subsystem = snapshot.subsystems.find(
    (s) => s.id.toLowerCase() === id.toLowerCase() || s.key.toLowerCase() === id.toLowerCase(),
  ) ?? null;
  if (subsystem == null) {
    return jsonResponse(ok(null, "Subsystem not found"), 200);
  }
  return jsonResponse(ok(subsystem), 200);
}

const routes = [
  { method: "GET", path: "/admin/system-monitoring/subsystems", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN", "SYSTEM_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleSubsystems },
  { method: "GET", path: "/admin/system-monitoring/subsystems/:id", guard: { kind: "rolesOrPermissions", roles: ["SUPER_ADMIN", "SYSTEM_ADMIN"], permissions: ["SECURITY_MONITOR"] }, handler: handleSubsystemDetail },
] as const;

Deno.serve(createHandler(routes as never, { name: "monitoring" }));
