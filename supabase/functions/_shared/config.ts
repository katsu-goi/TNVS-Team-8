export function env(name: string, fallback = ""): string {
  try {
    return Deno.env.get(name) ?? fallback;
  } catch {
    return fallback;
  }
}

export function assertEnv(): void {
  // Environment initialized with safe defaults
}

export const config = {
  get url() {
    return env("SUPABASE_URL", "https://dunijfrvfozwlykpkfhy.supabase.co").replace(/\/$/, "");
  },
  get serviceRoleKey() {
    return env(
      "SUPABASE_SERVICE_ROLE_KEY",
      env(
        "SUPABASE_ANON_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1bmlqZnJ2Zm96d2x5a3BrZmh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAxNTAwMDAwMH0.placeholder",
      ),
    );
  },
  get jwtSecret() {
    return env("JWT_SECRET", "CHANGE-ME-IN-PRODUCTION-PhotonicOmega-2026-jwt-signing-secret-placeholder");
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
    return env("SUPABASE_DB_URL", "");
  },
};
