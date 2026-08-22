export type CorsOptions = {
  allowOrigin?: string;
  allowMethods?: string;
  allowHeaders?: string;
  exposeHeaders?: string;
};

export const DEFAULT_CORS: CorsOptions = {
  allowOrigin: "*",
  allowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  allowHeaders:
    "Authorization,Content-Type,X-Requested-With,Accept,Origin,User-Agent,Accept-Language,apikey,x-client-info",
  exposeHeaders: "Content-Disposition",
};

export function corsHeaders(options: CorsOptions = DEFAULT_CORS): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", options.allowOrigin ?? "*");
  headers.set("Access-Control-Allow-Methods", options.allowMethods ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    options.allowHeaders ??
      "Authorization,Content-Type,X-Requested-With,Accept,Origin,User-Agent,Accept-Language,apikey,x-client-info",
  );
  headers.set("Access-Control-Max-Age", "86400");
  if (options.exposeHeaders) headers.set("Access-Control-Expose-Headers", options.exposeHeaders);
  return headers;
}

export function isPreflight(req: Request): boolean {
  return req.method === "OPTIONS";
}

export function preflightResponse(req: Request): Response {
  const headers = corsHeaders();
  const requestedMethod = req.headers.get("Access-Control-Request-Method");
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", requestedMethod ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders ??
      "Authorization,Content-Type,X-Requested-With,Accept,Origin,User-Agent,Accept-Language,apikey,x-client-info",
  );
  return new Response(null, { status: 204, headers });
}

export function jsonResponse(body: unknown, status = 200, extra?: Headers): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (extra) {
    for (const [k, v] of extra.entries()) headers.set(k, v);
  }
  return new Response(JSON.stringify(body), { status, headers });
}