import * as jose from "npm:jose@^5.10.0";
import { config } from "./config.ts";

export type JwtPayload = {
  sub: string;
  roles?: string;
  type: "ACCESS" | "REFRESH";
  iss: string;
  jti: string;
  iat: number;
  exp: number;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function signAccessToken(
  email: string,
  roles: string[],
  issuer: string = config.jwtIssuer,
  ttlSeconds: number = config.accessTokenTtlSeconds,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ roles: roles.join(","), type: "ACCESS" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuer(issuer)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secretKey());
}

export async function signRefreshToken(
  email: string,
  issuer: string = config.jwtIssuer,
  ttlSeconds: number = config.refreshTokenTtlSeconds,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ type: "REFRESH" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuer(issuer)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secretKey());
}

export async function verifyToken(
  token: string,
  expectedType: "ACCESS" | "REFRESH",
  issuer: string = config.jwtIssuer,
): Promise<JwtPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secretKey(), {
      issuer,
      algorithms: ["HS256"],
    });
    if (payload.type !== expectedType) return null;
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  return verifyToken(token, "ACCESS");
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload | null> {
  return verifyToken(token, "REFRESH");
}