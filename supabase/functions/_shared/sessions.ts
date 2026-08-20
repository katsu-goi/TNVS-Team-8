import { adminDb } from "./db.ts";
import { AuthUser, tzIso } from "./auth-users.ts";

export type Agent = { browser: string; device: string };

export function parseUserAgent(userAgent: string | null): Agent {
  if (userAgent === null || userAgent.trim() === "") {
    return { browser: "Unknown", device: "Web App" };
  }
  const ua = userAgent;
  let browser = "Unknown";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Safari/")) browser = "Safari";
  else if (ua.includes("MSIE") || ua.includes("Trident/")) browser = "IE";

  let device = "Desktop";
  if (ua.includes("iPhone")) device = "iPhone";
  else if (ua.includes("iPad")) device = "iPad";
  else if (ua.includes("Android")) device = "Android";
  else if (ua.includes("Mobile")) device = "Mobile";

  return { browser, device };
}

/** Upserts the user's ACTIVE session (mirrors UserActivityService.upsert).
 *  If the user already has ACTIVE sessions, keeps the first and revokes the
 *  rest (guards against the multiple-row race that breaks Spring's Optional
 *  finder). */
export async function upsertActiveSession(
  user: AuthUser,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  const db = adminDb();
  const agent = parseUserAgent(userAgent);

  const { data: existingRows, error: findErr } = await db
    .from("active_sessions")
    .select("id, session_id")
    .eq("username", user.row.email)
    .eq("status", "ACTIVE");
  if (findErr) throw new Error(`active_sessions lookup failed: ${findErr.message}`);

  const existing = (existingRows ?? [])[0] ?? null;
  const duplicates = (existingRows ?? []).slice(1);
  if (duplicates.length > 0) {
    await db.from("active_sessions").update({ status: "REVOKED" }).in("id", duplicates.map((d) => d.id));
  }

  const payload = {
    username: user.row.email,
    user_id: user.row.id,
    full_name: `${user.row.first_name} ${user.row.last_name}`,
    role: user.roles[0] ?? "EMPLOYEE",
    ip_address: ip ?? "unknown",
    browser: agent.browser,
    device_name: agent.device,
    last_activity: tzIso(),
    ...(existing ? {} : { login_time: tzIso(), status: "ACTIVE", session_id: crypto.randomUUID() }),
  };

  const { error } = existing
    ? await db.from("active_sessions").update(payload).eq("id", existing.id)
    : await db.from("active_sessions").insert(payload);
  if (error) throw new Error(`active_sessions upsert failed: ${error.message}`);
}

/** Marks all ACTIVE sessions REVOKED (mirrors markOffline). */
export async function revokeActiveSessions(user: AuthUser): Promise<void> {
  const db = adminDb();
  const { error } = await db
    .from("active_sessions")
    .update({ status: "REVOKED" })
    .eq("username", user.row.email)
    .eq("status", "ACTIVE");
  if (error) throw new Error(`active_sessions revoke failed: ${error.message}`);
}

export type ActivityEvent = {
  type: string;
  userId: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  action: string;
  ip: string;
  device: string;
  browser: string;
};

/**
 * Inserts a row into user_activity_events so Supabase Realtime streams it to
 * subscribed clients (mirrors SupabaseRealtimePublisher.insertActivityEvent,
 * but via service_role so RLS deny-by-default is bypassed server-side).
 */
export async function insertActivityEvent(event: ActivityEvent): Promise<void> {
  try {
    const db = adminDb();
    await db.from("user_activity_events").insert({
      event_type: event.type,
      user_id: event.userId,
      username: event.username,
      full_name: event.fullName,
      email: event.email,
      role: event.role,
      action: event.action,
      ip: event.ip,
      device: event.device,
      browser: event.browser,
    });
  } catch (e) {
    console.error("user_activity_events insert threw:", (e as Error).message);
  }
}

/** Upserts the online-users row keyed by username. */
export async function upsertOnlineUser(user: AuthUser, ip: string | null, agent: Agent): Promise<void> {
  try {
    const db = adminDb();
    await db.from("online_users").upsert(
      {
        username: user.row.email,
        user_id: user.row.id,
        full_name: `${user.row.first_name} ${user.row.last_name}`,
        role: user.roles[0] ?? "EMPLOYEE",
        ip: ip ?? "unknown",
        device: agent.device,
        browser: agent.browser,
        last_activity: tzIso(),
      },
      { onConflict: "username" },
    );
  } catch (e) {
    console.error("online_users upsert threw:", (e as Error).message);
  }
}

/** Removes the user's online row. */
export async function removeOnlineUser(username: string): Promise<void> {
  try {
    const db = adminDb();
    await db.from("online_users").delete().eq("username", username);
  } catch (e) {
    console.error("online_users delete threw:", (e as Error).message);
  }
}