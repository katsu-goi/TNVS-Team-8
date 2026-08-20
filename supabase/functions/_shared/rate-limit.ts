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

const SENSITIVE_PATHS = ["/auth/login", "/security/admin", "/auth/reset-password"];

export function tierFor(role: string, path: string): { name: string; spec: LimitSpec } {
  if (SENSITIVE_PATHS.some((p) => path.includes(p))) {
    return { name: "sensitive", spec: { windowSeconds: 60, capacity: 20 } };
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

  const { error } = await db.rpc("consume_rate_limit_token", {
    p_key: limitKey,
    p_window_start: windowStart,
    p_window_seconds: spec.windowSeconds,
    p_capacity: spec.capacity,
  });

  if (error) {
    // Fallback: if the RPC is missing (migration not applied), fail open but
    // conservatively (block) so a mis-deployment never silently removes limits.
    // This must never happen post-deploy; the migration ships in the same PR.
    console.error("consume_rate_limit_token failed:", error.message);
    return false;
  }
  return true;
}