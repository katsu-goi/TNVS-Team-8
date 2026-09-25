function isPrivateAddress(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host === "0.0.0.0" || host === "::" || host === "::1"
    || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return octets[0] === 10 || octets[0] === 127 || octets[0] === 0
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
  }
  return host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/.test(host)
    || host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.")
    || host.startsWith("::ffff:192.168.");
}

/** Rejects credential-bearing, non-HTTPS, local, private, and DNS-rebound provider URLs. */
export async function assertSafeProviderUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Provider URL is invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new Error("Provider URLs must use HTTPS and must not contain credentials");
  }
  if (isPrivateAddress(parsed.hostname)) throw new Error("Private or local provider addresses are not permitted");

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname) && !parsed.hostname.includes(":")) {
    const resolved: string[] = [];
    for (const type of ["A", "AAAA"] as const) {
      try {
        resolved.push(...await Deno.resolveDns(parsed.hostname, type));
      } catch {
        // A public provider may publish only one address family.
      }
    }
    if (resolved.length === 0 || resolved.some(isPrivateAddress)) {
      throw new Error("Provider hostname did not resolve to an allowed public address");
    }
  }
}
