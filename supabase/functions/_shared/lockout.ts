import { adminDb } from "./db.ts";
import { AuthUser, tzIso } from "./auth-users.ts";
import { config } from "./config.ts";
import { parseUserAgent } from "./sessions.ts";

export type LockoutInfo = {
  accountExists: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  retryAfterSeconds: number;
  counted: boolean;
};

export type LoginFinalization = {
  allowed: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  retryAfterSeconds: number;
};

type LockoutRow = {
  account_exists: boolean;
  failed_attempts: number;
  locked_until: string | null;
  counted: boolean;
};

type LoginSuccessRow = {
  allowed: boolean;
  failed_attempts: number;
  locked_until: string | null;
};

const encoder = new TextEncoder();

async function identifierHash(identifier: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(config.jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(identifier)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function retryAfterSeconds(lockedUntil: string | null, now = new Date()): number {
  if (!lockedUntil) return 0;
  const milliseconds = new Date(lockedUntil).getTime() - now.getTime();
  return Number.isFinite(milliseconds) ? Math.max(0, Math.ceil(milliseconds / 1000)) : 0;
}

function normalizeLockout(row: LockoutRow): LockoutInfo {
  return {
    accountExists: row.account_exists,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    retryAfterSeconds: retryAfterSeconds(row.locked_until),
    counted: row.counted,
  };
}

async function lockoutRpc(
  name: "get_login_restriction" | "record_login_failure",
  email: string,
): Promise<LockoutInfo> {
  const { data, error } = await adminDb().rpc(name, {
    p_email: email,
    p_identifier_hash: await identifierHash(email),
  });
  if (error) throw new Error(`${name} failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as LockoutRow | null;
  if (!row) throw new Error(`${name} returned no result`);
  return normalizeLockout(row);
}

export async function getLoginRestriction(email: string): Promise<LockoutInfo> {
  return lockoutRpc("get_login_restriction", email);
}

export async function recordLoginFailure(
  email: string,
  user: AuthUser | null,
  ipAddress: string,
): Promise<LockoutInfo> {
  const info = await lockoutRpc("record_login_failure", email);
  await writeAudit(user, "LOGIN_FAILED", "AUTH", "User", user?.row.id ?? null,
    `Failed login attempt ${info.failedAttempts}`, ipAddress, "WARNING");

  if (info.counted && info.retryAfterSeconds > 0) {
    await writeAudit(user, "LOGIN_TEMPORARILY_LOCKED", "AUTH", "User", user?.row.id ?? null,
      `Temporary login restriction applied after ${info.failedAttempts} failed attempts`, ipAddress, "WARNING");
  }
  if (user && info.counted && info.retryAfterSeconds > 0) {
    await writeSecurityAlert(
      "Temporary login restriction - repeated failures",
      `Account ${user.row.email} temporarily restricted after ${info.failedAttempts} failed attempts`,
      "HIGH", "ACCOUNT_LOCKOUT", ipAddress, user.row.id,
    );
  }
  return info;
}

export async function finalizeLoginSuccess(email: string, ipAddress: string): Promise<LoginFinalization> {
  const { data, error } = await adminDb().rpc("finalize_login_success", {
    p_email: email,
    p_ip: ipAddress,
  });
  if (error) throw new Error(`finalize_login_success failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as LoginSuccessRow | null;
  if (!row) throw new Error("finalize_login_success returned no result");
  return {
    allowed: row.allowed,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    retryAfterSeconds: retryAfterSeconds(row.locked_until),
  };
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

/**
 * Writes one row into security_logs (the "gateway log" feed). Mirrors
 * Spring's SecurityLogService so login/logout activity streams to the
 * Real-time Gateway Logs widget and the SysAdmin Recent Security Events.
 */
export async function writeSecurityLog(
  user: AuthUser | null,
  action: string,
  status: "SUCCESS" | "FAILED",
  riskLevel: string,
  ipAddress: string | null,
  userAgent: string | null,
  reason: string,
): Promise<void> {
  try {
    const db = adminDb();
    const agent = parseUserAgent(userAgent);
    const { error } = await db.from("security_logs").insert({
      action,
      module: "AUTH",
      full_name: user ? `${user.row.first_name} ${user.row.last_name}` : null,
      role: user?.roles[0] ?? null,
      user_id: user?.row.id ?? null,
      ip_address: ipAddress ?? null,
      browser: agent.browser,
      device_name: agent.device,
      risk_level: riskLevel,
      status,
      reason,
      timestamp: tzIso(),
    });
    if (error) throw new Error(`security_logs insert failed: ${error.message}`);
  } catch (e) {
    console.error("security_logs insert threw:", (e as Error).message);
  }
}
