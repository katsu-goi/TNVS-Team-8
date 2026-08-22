import { assertEnv, config } from "../_shared/config.ts";
import { corsHeaders, isPreflight, jsonResponse, preflightResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { resolveClientIp } from "../_shared/ip.ts";
import { signAccessToken, verifyAccessToken } from "../_shared/jwt.ts";
import { adminDb } from "../_shared/db.ts";

Deno.serve(async (req: Request) => {
  if (isPreflight(req)) return preflightResponse(req);

  try {
    assertEnv();
  } catch (e) {
    return jsonResponse(
      fail("Environment not configured", "ENV_MISSING", [(e as Error).message]),
      500,
      corsHeaders(),
    );
  }

  const url = new URL(req.url);
  const ipInfo = resolveClientIp(req);

  if (url.pathname.endsWith("/health/ping")) {
    return jsonResponse(
      ok({ pong: true, time: new Date().toISOString(), ip: ipInfo.ip }, "pong"),
      200,
      corsHeaders(),
    );
  }

  if (url.pathname.endsWith("/health/imports")) {
    try {
      const token = await signAccessToken("spike@photonicomega.com", ["SUPER_ADMIN"]);
      const verified = await verifyAccessToken(token);
      const { count } = await adminDb()
        .from("roles")
        .select("id", { count: "exact", head: true });
      return jsonResponse(
        ok(
          {
            imports: ["@supabase/supabase-js", "jose", "bcryptjs"],
            jwtSign: token.split(".").length === 3,
            jwtVerify: verified !== null && verified.sub === "spike@photonicomega.com",
            db: { rolesCount: count ?? null },
            env: { url: config.url },
          },
          "all imports OK",
        ),
        200,
        corsHeaders(),
      );
    } catch (e) {
      return jsonResponse(
        fail("Import/spike verification failed", "SPIKE_FAILED", [(e as Error).message]),
        500,
        corsHeaders(),
      );
    }
  }

  return jsonResponse(
    fail(`No route for ${url.pathname}`, "NOT_FOUND"),
    404,
    corsHeaders(),
  );
});