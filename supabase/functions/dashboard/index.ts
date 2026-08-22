import { createHandler } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";

const db = adminDb();

async function count(table: string): Promise<number> {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function handleSummary() {
  const [totalFacilities, totalReservations, totalVisitors, totalDocuments, totalContracts, totalLegalCases] =
    await Promise.all([
      count("facilities"),
      count("reservations"),
      count("visitors"),
      count("documents"),
      count("contracts"),
      count("legal_cases"),
    ]);
  const stats = { totalFacilities, totalReservations, totalVisitors, totalDocuments, totalContracts, totalLegalCases };
  return jsonResponse(ok(stats, "Dashboard metrics loaded successfully"), 200);
}

const routes = [
  { method: "GET", path: "/dashboard/summary", guard: { kind: "roles", roles: ["SUPER_ADMIN"] }, handler: handleSummary },
] as const;

Deno.serve(createHandler(routes as never, { name: "dashboard" }));