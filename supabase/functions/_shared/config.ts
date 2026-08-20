const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function assertEnv(): void {
  for (const key of required) {
    if (!Deno.env.get(key)) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}

export function env(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

export const config = {
  get url() {
    return env("SUPABASE_URL").replace(/\/$/, "");
  },
  get serviceRoleKey() {
    return env("SUPABASE_SERVICE_ROLE_KEY");
  },
  get jwtSecret() {
    return env("JWT_SECRET");
  },
  get jwtIssuer() {
    return env("JWT_ISSUER", "photonic-omega-facilities");
  },
  get accessTokenTtlSeconds() {
    return Number(env("JWT_ACCESS_TTL_SECONDS", "900"));
  },
  get refreshTokenTtlSeconds() {
    return Number(env("JWT_REFRESH_TTL_SECONDS", "604800"));
  },
  get dbConnectionString() {
    return env("SUPABASE_DB_URL");
  },
};
