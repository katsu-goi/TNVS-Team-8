import { adminDb } from "./db.ts";
import { AuthUser, tzIso } from "./auth-users.ts";
import { config } from "./config.ts";
import { parseUserAgent } from "./sessions.ts";

type RestrictionRow = {
  account_exists: boolean;
  failed_attempts: number;
  locked_until: string | null;
  counted: boolean;
};

export type LockoutInfo = {
  accountExists: boolean;
  failedAttempts: number;
  lockSecondsRemaining: number;
  retryAt: string | null;
  counted: boolean;
};

export async function identifierReference(email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeIdentifier(reference: string): string {
  return `unknown:${reference.slice(0, 16)}`;
}

export async function getLoginRestriction(email: string, reference: string): Promise<LockoutInfo> {
  return callRestrictionRpc("get_login_restriction", email, reference);
}

export async function recordFailedAttempt(email: string, reference: string): Promise<LockoutInfo> {
  return callRestrictionRpc("record_login_failure", email, reference);
}

async function callRestrictionRpc(name: string, email: string, reference: string): Promise<LockoutInfo> {
  const { data, error } = await adminDb().rpc(name, { p_email: email, p_identifier_hash: reference });
  if (error) throw new Error(`${name} failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as RestrictionRow | null;
  if (!row) throw new Error(`${name} returned no restriction state`);
  const retryAt = row.locked_until ? new Date(row.locked_until).toISOString() : null;
  return {
    accountExists: row.account_exists,
    failedAttempts: row.failed_attempts,
    lockSecondsRemaining: retryAt ? Math.max(0, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000)) : 0,
    retryAt,
    counted: row.counted,
  };
}

export function publicLockoutData(info: LockoutInfo): { lockSecondsRemaining: number; retryAt: string | null } {
  return { lockSecondsRemaining: info.lockSecondsRemaining, retryAt: info.retryAt };
}

export function failureMessage(info: LockoutInfo): string {
  if (info.lockSecondsRemaining <= 0) return "Incorrect email or password.";
  const minutes = Math.floor(info.lockSecondsRemaining / 60);
  const seconds = info.lockSecondsRemaining % 60;
  return `Too many unsuccessful login attempts. Try again in ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.`;
}

export async function logFailedLogin(
  user: AuthUser | null,
  identifier: string,
  info: LockoutInfo,
  ipAddress: string,
  userAgent: string,
  blocked = false,
): Promise<void> {
  const reason = blocked ? "ACTIVE_ACCOUNT_RESTRICTION" : "INVALID_CREDENTIALS";
  const description = blocked
    ? `Login blocked by active temporary restriction after ${info.failedAttempts} failed attempts`
    : `Failed login attempt ${info.failedAttempts}`;
  await Promise.all([
    writeAudit(user, blocked ? "LOGIN_BLOCKED" : "LOGIN_FAILED", "AUTH", "User", user?.row.id ?? null,
      description, ipAddress, blocked ? "CRITICAL" : "WARNING", identifier),
    writeLoginHistory(identifier, user?.row.id ?? null, ipAddress, blocked ? "BLOCKED" : "FAILED", reason, userAgent),
    writeSecurityLog(user, blocked ? "LOGIN_BLOCKED" : "LOGIN_FAILED", "FAILED",
      blocked ? "HIGH" : "MEDIUM", ipAddress, userAgent, description, identifier),
  ]);
  if (info.counted && (info.failedAttempts === 5 || (info.failedAttempts >= 8 && info.failedAttempts % 3 === 2))) {
    await writeSecurityAlert(
      "Repeated unsuccessful login attempts",
      `Temporary restriction escalated after ${info.failedAttempts} failed attempts for ${identifier}`,
      "HIGH", "ACCOUNT_LOCKOUT", ipAddress, user?.row.id ?? null,
    );
  }
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
  safeUsername?: string,
): Promise<void> {
  try {
    const failed = action.includes("FAILED") || action.includes("BLOCKED") || action.includes("LOCKED");
    const { error } = await adminDb().from("audit_logs").insert({
      user_id: user?.row.id ?? null,
      user_email: user?.row.email ?? safeUsername ?? null,
      user_full_name: user ? `${user.row.first_name} ${user.row.last_name}` : null,
      action, module, entity_type: entityType, entity_id: entityId, description,
      ip_address: ipAddress, severity, status: failed ? "FAILED" : "SUCCESS",
    });
    if (error) console.error("audit insert failed:", error.message);
  } catch (e) {
    console.error("audit insert threw:", (e as Error).message);
  }
}

export async function writeLoginHistory(
  username: string, userId: string | null, ip: string, status: string, reason: string, userAgent: string,
): Promise<void> {
  try {
    const { error } = await adminDb().from("login_history").insert({
      username, user_id: userId, ip_address: ip, status, failure_reason: reason, user_agent: userAgent,
    });
    if (error) console.error("login_history insert failed:", error.message);
  } catch (e) {
    console.error("login_history insert threw:", (e as Error).message);
  }
}

export async function writeSecurityAlert(
  title: string, description: string, severity: string, alertType: string, ip: string, userId: string | null,
): Promise<void> {
  try {
    const { error } = await adminDb().from("security_alerts").insert({
      title, description, severity, alert_type: alertType,
      target_ip: ip, target_user_id: userId, status: "OPEN",
    });
    if (error) console.error("security_alert insert failed:", error.message);
  } catch (e) {
    console.error("security_alert insert threw:", (e as Error).message);
  }
}

export async function writeSecurityLog(
  user: AuthUser | null,
  action: string,
  status: "SUCCESS" | "FAILED",
  riskLevel: string,
  ipAddress: string | null,
  userAgent: string | null,
  reason: string,
  safeUsername?: string,
): Promise<void> {
  try {
    const agent = parseUserAgent(userAgent);
    const { error } = await adminDb().from("security_logs").insert({
      action, module: "AUTH",
      full_name: user ? `${user.row.first_name} ${user.row.last_name}` : null,
      role: user?.roles[0] ?? null,
      username: user?.row.email ?? safeUsername ?? null,
      user_id: user?.row.id ?? null,
      ip_address: ipAddress ?? null,
      browser: agent.browser, device_name: agent.device,
      risk_level: riskLevel, status, reason, timestamp: tzIso(),
    });
    if (error) console.error("security_logs insert failed:", error.message);
  } catch (e) {
    console.error("security_logs insert threw:", (e as Error).message);
  }
}
