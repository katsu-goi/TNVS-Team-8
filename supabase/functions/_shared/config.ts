export function env(name: string, fallback = ""): string {
  try {
    return Deno.env.get(name) ?? fallback;
  } catch {
    return fallback;
  }
}

function requiredEnv(name: string): string {
  const value = env(name).trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveIntegerEnv(name: string, fallback: string): number {
  const raw = env(name, fallback).trim();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function assertEnv(): void {
  const url = requiredEnv("SUPABASE_URL");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL must be a valid absolute URL");
  }
  const localHttp = parsedUrl.protocol === "http:"
    && ["localhost", "127.0.0.1", "host.docker.internal"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && !localHttp) {
    throw new Error("SUPABASE_URL must use HTTPS outside local development");
  }

  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = env("SUPABASE_ANON_KEY").trim();
  if (serviceRoleKey === anonKey || serviceRoleKey.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be a service-role secret, not a publishable/anon key");
  }

  const jwtSecret = requiredEnv("JWT_SECRET");
  const normalizedSecret = jwtSecret.toLowerCase();
  if (new TextEncoder().encode(jwtSecret).byteLength < 32
    || normalizedSecret.includes("change-me")
    || normalizedSecret.includes("placeholder")) {
    throw new Error("JWT_SECRET must be a non-placeholder secret of at least 32 bytes");
  }

  positiveIntegerEnv("JWT_ACCESS_TTL_SECONDS", "900");
  positiveIntegerEnv("JWT_REFRESH_TTL_SECONDS", "604800");
}

export const config = {
  get url() {
    return requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  },
  get serviceRoleKey() {
    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get jwtSecret() {
    return requiredEnv("JWT_SECRET");
  },
  get jwtIssuer() {
    return env("JWT_ISSUER", "photonic-omega-facilities");
  },
  get accessTokenTtlSeconds() {
    return positiveIntegerEnv("JWT_ACCESS_TTL_SECONDS", "900");
  },
  get refreshTokenTtlSeconds() {
    return positiveIntegerEnv("JWT_REFRESH_TTL_SECONDS", "604800");
  },
  get dbConnectionString() {
    return env("SUPABASE_DB_URL", "");
  },
};
