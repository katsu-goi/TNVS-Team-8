import { adminDb } from "./db.ts";
import { naiveIso } from "./auth-users.ts";

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  is_revoked: boolean;
  revoked_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

const REFRESH_TTL_MS = 7 * 24 * 3600_000;

/** Finds an active refresh token by its opaque value. */
export async function findActiveRefreshToken(token: string): Promise<RefreshTokenRow | null> {
  const db = adminDb();
  const { data, error } = await db
    .from("refresh_tokens")
    .select("*")
    .eq("token", token)
    .eq("is_revoked", false)
    .maybeSingle();
  if (error) throw new Error(`refresh_tokens lookup failed: ${error.message}`);
  return data as RefreshTokenRow | null;
}

export async function saveRefreshToken(
  userId: string,
  token: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  const db = adminDb();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const { error } = await db.from("refresh_tokens").insert({
    user_id: userId,
    token,
    expires_at: naiveIso(expiresAt),
    ip_address: ipAddress,
    user_agent: userAgent,
  });
  if (error) throw new Error(`refresh_tokens insert failed: ${error.message}`);
}

export async function revokeRefreshToken(id: string): Promise<void> {
  const db = adminDb();
  const { error } = await db
    .from("refresh_tokens")
    .update({ is_revoked: true, revoked_at: naiveIso() })
    .eq("id", id);
  if (error) throw new Error(`refresh_tokens revoke failed: ${error.message}`);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const db = adminDb();
  const { error } = await db
    .from("refresh_tokens")
    .update({ is_revoked: true, revoked_at: naiveIso() })
    .eq("user_id", userId)
    .eq("is_revoked", false);
  if (error) throw new Error(`refresh_tokens revoke-all failed: ${error.message}`);
}

export function isRefreshTokenExpired(row: RefreshTokenRow): boolean {
  return new Date(row.expires_at) < new Date();
}