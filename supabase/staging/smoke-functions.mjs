import { assertStagingEnvironment } from "./lib.mjs";

const { url } = assertStagingEnvironment({ requireServiceKey: false });
const anonKey = process.env.STAGING_SUPABASE_ANON_KEY?.trim();
if (!anonKey || anonKey.toLowerCase().includes("replace-in")) throw new Error("STAGING_SUPABASE_ANON_KEY is required");

const probes = [
  ["admin", "GET", "/admin/users"],
  ["ai", "GET", "/ai/providers"],
  ["analytics", "GET", "/analytics"],
  ["auth", "GET", "/auth/me"],
  ["compliance", "GET", "/compliance/dashboard/summary"],
  ["contracts", "GET", "/contracts"],
  ["dashboard", "GET", "/dashboard/summary"],
  ["document-title-suggest", "POST", "/suggest"],
  ["documents", "GET", "/documents"],
  ["employee", "GET", "/employee/dashboard/summary"],
  ["facilities", "GET", "/facilities-manager/dashboard/kpi"],
  ["governance", "GET", "/governance/workspace/privacy/dashboard"],
  ["legal", "GET", "/legal/dashboard/summary"],
  ["monitoring", "GET", "/admin/system-monitoring/subsystems"],
  ["notifications", "GET", "/notifications"],
  ["procurement", "GET", "/procurement/dashboard/summary"],
  ["reservation-portal", "GET", "/facilities"],
  ["security", "GET", "/security/admin/metrics"],
  ["visitor", "GET", "/visitors"],
];

for (const [name, method, path] of probes) {
  const response = await fetch(`${url}/functions/v1/${name}${path}`, {
    method,
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
  if (response.status !== 401) throw new Error(`${name} returned ${response.status}, expected unauthenticated 401`);
  console.log(`PASS | ${name} | unauthenticated 401`);
}

console.log("All 19 deployed Edge Function boundaries returned 401 without an application token.");
