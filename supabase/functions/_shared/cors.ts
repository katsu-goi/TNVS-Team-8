export type CorsOptions = {
  allowOrigin?: string;
  allowMethods?: string;
  allowHeaders?: string;
  exposeHeaders?: string;
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://tnvs-team-8-rho.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function isAllowedOrigin(origin: string | null): boolean {
  return origin === null || allowedOrigins().has(origin);
}

export const DEFAULT_CORS: CorsOptions = {
  allowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  allowHeaders:
    "Authorization,Content-Type,X-Requested-With,X-Oversight-Session,Accept,Origin,User-Agent,Accept-Language,apikey,x-client-info",
  exposeHeaders: "Content-Disposition, Retry-After",
};

export function corsHeaders(options: CorsOptions = DEFAULT_CORS): Headers {
  const headers = new Headers();
  if (options.allowOrigin) headers.set("Access-Control-Allow-Origin", options.allowOrigin);
  headers.set("Access-Control-Allow-Methods", options.allowMethods ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    options.allowHeaders ??
      "Authorization,Content-Type,X-Requested-With,X-Oversight-Session,Accept,Origin,User-Agent,Accept-Language,apikey,x-client-info",
  );
  headers.set("Access-Control-Max-Age", "86400");
  if (options.exposeHeaders) headers.set("Access-Control-Expose-Headers", options.exposeHeaders);
  return headers;
}

export function isPreflight(req: Request): boolean {
  return req.method === "OPTIONS";
}

export function preflightResponse(req: Request): Response {
  const origin = req.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  const headers = corsHeaders(origin ? { ...DEFAULT_CORS, allowOrigin: origin } : DEFAULT_CORS);
  headers.set("Vary", "Origin");
  return new Response(null, { status: 204, headers });
}

/** Adds request-specific CORS without reflecting untrusted origins. */
export function applyCors(req: Request, response: Response): Response {
  const origin = req.headers.get("Origin");
  const headers = new Headers(response.headers);
  headers.append("Vary", "Origin");
  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", DEFAULT_CORS.exposeHeaders ?? "Content-Disposition");
  } else {
    headers.delete("Access-Control-Allow-Origin");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function jsonResponse(body: unknown, status = 200, extra?: Headers): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (extra) {
    for (const [k, v] of extra.entries()) headers.set(k, v);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
