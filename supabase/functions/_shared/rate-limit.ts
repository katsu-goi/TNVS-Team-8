import { adminDb } from "./db.ts";

export type LimitSpec = {
  /** Window size in seconds. */
  windowSeconds: number;
  /** Max requests allowed per window. */
  capacity: number;
};

const TAGS = { admin: "admin", user: "user", guest: "guest" } as const;
type Tiers = Record<(typeof TAGS)[keyof typeof TAGS], LimitSpec>;

const TIERS: Tiers = {
  // Mirrors RateLimitingFilter.createNewBucket():
  // admin 600/min, user 300/min, guest 60/min, sensitive 20/min.
  admin: { windowSeconds: 60, capacity: 600 },
  user: { windowSeconds: 60, capacity: 300 },
  guest: { windowSeconds: 60, capacity: 60 },
};

const SENSITIVE_LIMITS: Array<{ path: string; spec: LimitSpec }> = [
  { path: "/admin/backups", spec: { windowSeconds: 3600, capacity: 10 } },
  { path: "/auth/login", spec: { windowSeconds: 60, capacity: 20 } },
  { path: "/auth/refresh", spec: { windowSeconds: 60, capacity: 30 } },
  { path: "/auth/forgot-password", spec: { windowSeconds: 3600, capacity: 10 } },
  { path: "/auth/reset-password", spec: { windowSeconds: 3600, capacity: 10 } },
  { path: "/security/admin", spec: { windowSeconds: 60, capacity: 30 } },
  { path: "/visitors/", spec: { windowSeconds: 60, capacity: 60 } },
  { path: "/documents/upload", spec: { windowSeconds: 60, capacity: 10 } },
  { path: "/document-title-suggest/", spec: { windowSeconds: 60, capacity: 10 } },
  { path: "/contracts/", spec: { windowSeconds: 60, capacity: 30 } },
  { path: "/ai/chat", spec: { windowSeconds: 60, capacity: 5 } },
  { path: "/ai/", spec: { windowSeconds: 60, capacity: 20 } },
  { path: "/analytics/export", spec: { windowSeconds: 60, capacity: 20 } },
];

export function tierFor(role: string, path: string): { name: string; spec: LimitSpec } {
  const sensitive = SENSITIVE_LIMITS.find((entry) => path.includes(entry.path));
  if (sensitive) {
    return { name: `sensitive:${sensitive.path}`, spec: sensitive.spec };
  }
  const normalized = role.toLowerCase();
  if (normalized === "admin") return { name: TAGS.admin, spec: TIERS.admin };
  if (normalized === "user") return { name: TAGS.user, spec: TIERS.user };
  return { name: TAGS.guest, spec: TIERS.guest };
}

/**
 * Atomically consumes one token from the sliding window for `limitKey`.
 * Returns true if within capacity; false if over. Uses an advisory lock on
 * the row so concurrent Edge Function instances cannot overshoot the window.
 */
export async function consumeRateLimit(
  limitKey: string,
  spec: LimitSpec,
): Promise<boolean> {
  const db = adminDb();
  const nowSec = Math.floor(Date.now() / 1000);
  // Align windows to spec.windowSeconds boundaries for predictable expiry.
  const windowStart = Math.floor(nowSec / spec.windowSeconds) * spec.windowSeconds;

  const { data, error } = await db.rpc("consume_rate_limit_token", {
    p_key: limitKey,
    p_window_start: windowStart,
    p_window_seconds: spec.windowSeconds,
    p_capacity: spec.capacity,
  });

  if (error) {
    // If the RPC is missing or unavailable, fail closed so a mis-deployment
    // never silently removes abuse protection.
    // This must never happen post-deploy; the migration ships in the same PR.
    console.error("consume_rate_limit_token failed:", error.message);
    return false;
  }
  return data === true;
}
