import { adminDb } from "./db.ts";
import { AuthUser, naiveIso } from "./auth-users.ts";

const MAX_ATTEMPTS = 3;
const LOCK_DURATIONS_SECONDS = [10, 30];
const PERMANENT_LOCK_DAYS = 365;

export type LockoutInfo = {
  failedAttempts: number;
  maxAttempts: number;
  remainingAttempts: number;
  lockSecondsRemaining: number;
  permanentlyLocked: boolean;
  lockedUntil: string | null;
};

export function currentLockoutInfo(user: AuthUser, now: Date): LockoutInfo | null {
  const attempts = user.row.failed_login_attempts;
  if (attempts >= MAX_ATTEMPTS) {
    return infoOf(user, true, now);
  }
  if (isLockedUntilFuture(user.row.locked_until, now)) {
    return infoOf(user, false, now);
  }
  return null;
}

export function isLockedUntilFuture(lockedUntil: string | null, now: Date): boolean {
  return lockedUntil !== null && now < new Date(lockedUntil);
}

function lockDurationFor(attempt: number): number {
  const index = attempt - 1;
  if (LOCK_DURATIONS_SECONDS.length === 0) return 30;
  return LOCK_DURATIONS_SECONDS[Math.min(index, LOCK_DURATIONS_SECONDS.length - 1)];
}

function infoOf(user: AuthUser, permanentlyLocked: boolean, now: Date): LockoutInfo {
  const attempts = user.row.failed_login_attempts;
  const remaining = permanentlyLocked
    ? 0
    : Math.max(0, Math.floor((new Date(user.row.locked_until!).getTime() - now.getTime()) / 1000));
  return {
    failedAttempts: attempts,
    maxAttempts: MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - attempts),
    lockSecondsRemaining: remaining,
    permanentlyLocked,
    lockedUntil: user.row.locked_until,
  };
}

/**
 * Records one failed attempt and applies the progressive lock.
 * Mirrors LoginAttemptService.recordFailedAttempt (persisted in DB so the
 * lock cannot be bypassed by browser refresh or another client).
 */
export async function recordFailedAttempt(user: AuthUser, ipAddress: string, userAgent: string): Promise<LockoutInfo> {
  const db = adminDb();
  const now = new Date();
  const attempts = user.row.failed_login_attempts + 1;
  const permanent = attempts >= MAX_ATTEMPTS;

  const lockedUntil = permanent
    ? new Date(now.getTime() + PERMANENT_LOCK_DAYS * 86400_000)
    : new Date(now.getTime() + lockDurationFor(attempts) * 1000);

  const { error } = await db
    .from("users")
    .update({
      failed_login_attempts: attempts,
      last_failed_attempt_at: naiveIso(now),
      locked_until: naiveIso(lockedUntil),
    })
    .eq("id", user.row.id);
  if (error) throw new Error(`failed-attempt update failed: ${error.message}`);

  user.row.failed_login_attempts = attempts;
  user.row.locked_until = naiveIso(lockedUntil);
  user.row.last_failed_attempt_at = naiveIso(now);

  await writeAudit(user, "LOGIN_FAILED", "AUTH", "User", user.row.id,
    `Failed login attempt ${attempts}/${MAX_ATTEMPTS}`, ipAddress, "WARNING");

  if (permanent) {
    await writeAudit(user, "ACCOUNT_LOCKED", "AUTH", "User", user.row.id,
      `Account locked after ${attempts} consecutive failed login attempts`, ipAddress, "CRITICAL");
    await writeSecurityAlert(
      "Account locked - repeated failed logins",
      `Account ${user.row.email} locked after ${attempts} failed attempts`,
      "HIGH", "ACCOUNT_LOCKOUT", ipAddress, user.row.id,
    );
  }

  return infoOf(user, permanent, now);
}

export async function writeAudit(
  user: AuthUser | null,
  action: string,
  module: string,
  entityType: string | null,
  entityId: string | null,
  description: string,
  ipAddress: string | null,
  severity: string = "INFO",
): Promise<void> {
  try {
    const db = adminDb();
    const { error } = await db.from("audit_logs").insert({
      user_id: user?.row.id ?? null,
      user_email: user?.row.email ?? null,
      user_full_name: user ? `${user.row.first_name} ${user.row.last_name}` : null,
      action,
      module,
      entity_type: entityType,
      entity_id: entityId,
      description,
      ip_address: ipAddress,
      severity,
      status: "SUCCESS",
    });
    if (error) console.error("audit insert failed:", error.message);
  } catch (e) {
    console.error("audit insert threw:", (e as Error).message);
  }
}

export async function writeLoginHistory(
  username: string,
  userId: string | null,
  ip: string,
  status: string,
  reason: string,
  userAgent: string,
): Promise<void> {
  try {
    const db = adminDb();
    await db.from("login_history").insert({
      username,
      user_id: userId,
      ip_address: ip,
      status,
      failure_reason: reason,
      user_agent: userAgent,
    });
  } catch (e) {
    console.error("login_history insert threw:", (e as Error).message);
  }
}

export async function writeSecurityAlert(
  title: string,
  description: string,
  severity: string,
  alertType: string,
  ip: string,
  userId: string,
): Promise<void> {
  try {
    const db = adminDb();
    await db.from("security_alerts").insert({
      title,
      description,
      severity,
      alert_type: alertType,
      target_ip: ip,
      target_user_id: userId,
      status: "OPEN",
    });
  } catch (e) {
    console.error("security_alert insert threw:", (e as Error).message);
  }
}