const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type ResolvedIp = {
  ip: string;
  ipVersion: number;
  isPrivate: boolean;
};

/**
 * Secure client-IP extraction, mirroring the Spring ClientIpResolver.
 * Forwarded headers (X-Forwarded-For, X-Real-IP) are only honored when the
 * immediate peer is loopback/private (i.e. provably behind the edge proxy).
 */
export function resolveClientIp(req: Request): ResolvedIp {
  const remote = req.headers.get("x-forwarded-remote-addr") ?? req.headers.get("x-supabase-fwd-for") ?? "0.0.0.0";
  const behindProxy = isLoopbackOrPrivate(remote);

  let ip: string | null = null;
  if (behindProxy) {
    ip = firstForwardedIp(req.headers.get("x-forwarded-for"));
    if (ip === null) {
      ip = trimToNull(req.headers.get("x-real-ip"));
    }
  }
  if (ip === null) {
    ip = remote;
  }
  return {
    ip,
    ipVersion: ip.includes(":") ? 6 : 4,
    isPrivate: isPrivateOrLocal(ip),
  };
}

export function isPrivateOrLocal(value: string | null): boolean {
  if (value === null || value.trim() === "") return true;
  const v = value.trim();
  if (!IPV4.test(v)) {
    const lower = v.toLowerCase();
    return lower.startsWith("0:") || lower.startsWith("::") ||
      lower.startsWith("fc") || lower.startsWith("fd") ||
      lower.startsWith("fe80:") || lower === "::1";
  }
  const [a, b] = v.split(".").map((n) => Number(n));
  if (a === 127 || a === 10 || a === 0 || a === 255) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isLoopbackOrPrivate(value: string): boolean {
  const v = value.trim();
  return v === "127.0.0.1" || v === "::1" || v === "0:0:0:0:0:0:0:1" ||
    v === "localhost" || isPrivateOrLocal(v);
}

function firstForwardedIp(header: string | null): string | null {
  if (header === null || header.trim() === "") return null;
  for (const entry of header.split(",")) {
    const candidate = trimToNull(entry);
    if (candidate !== null) return candidate;
  }
  return null;
}

function trimToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}