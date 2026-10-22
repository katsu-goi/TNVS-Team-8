const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const VISITOR_GMAIL_SENDER = "hirnamobilitysolutionsinc@gmail.com";
const GMAIL_SEND_ENDPOINT = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(VISITOR_GMAIL_SENDER)}/messages/send`;

type FetchLike = typeof fetch;

export type GmailOAuthSecrets = {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
};

export type GmailMessagePayload = {
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
};

export class GmailOAuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GmailOAuthError";
  }
}

function envText(name: string): string {
  try {
    const runtime = globalThis as typeof globalThis & { Deno?: { env: { get(key: string): string | undefined } } };
    return runtime.Deno?.env.get(name)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function gmailOAuthSecrets(): GmailOAuthSecrets {
  const secrets = {
    clientId: envText("GOOGLE_GMAIL_CLIENT_ID"),
    clientSecret: envText("GOOGLE_GMAIL_CLIENT_SECRET"),
    encryptionKey: envText("VISITOR_GMAIL_OAUTH_ENCRYPTION_KEY"),
  };
  if (!secrets.clientId || !secrets.clientSecret || !secrets.encryptionKey) {
    throw new GmailOAuthError(
      "GMAIL_OAUTH_NOT_CONFIGURED",
      "Google Gmail OAuth client credentials and the token-encryption key must be configured server-side.",
    );
  }
  return secrets;
}

export function gmailOAuthRedirectUri(supabaseUrl: string): string {
  const origin = supabaseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    throw new GmailOAuthError("GMAIL_REDIRECT_URI_INVALID", "SUPABASE_URL cannot produce a secure Gmail OAuth redirect URI.");
  }
  return `${origin}/functions/v1/visitor/admin/gmail-oauth/callback`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomOAuthValue(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

async function encryptionKey(encodedKey: string, usage: KeyUsage[]): Promise<{ key: CryptoKey; raw: Uint8Array<ArrayBuffer> }> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64(encodedKey);
  } catch {
    throw new GmailOAuthError("GMAIL_ENCRYPTION_KEY_INVALID", "The Gmail OAuth encryption key must be base64 encoded.");
  }
  if (raw.byteLength !== 32) {
    raw.fill(0);
    throw new GmailOAuthError("GMAIL_ENCRYPTION_KEY_INVALID", "The Gmail OAuth encryption key must decode to exactly 32 bytes.");
  }
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usage);
  return { key, raw };
}

export async function encryptGmailSecret(value: string, purpose: "refresh-token" | "pkce-verifier", encodedKey: string): Promise<string> {
  if (!value) throw new GmailOAuthError("GMAIL_SECRET_EMPTY", "An empty OAuth secret cannot be encrypted.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, raw } = await encryptionKey(encodedKey, ["encrypt"]);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`visitor-gmail:${purpose}:v1`) },
      key,
      new TextEncoder().encode(value),
    );
    return `v1:${base64Url(iv)}:${base64Url(new Uint8Array(ciphertext))}`;
  } finally {
    raw.fill(0);
  }
}

export async function decryptGmailSecret(envelope: string, purpose: "refresh-token" | "pkce-verifier", encodedKey: string): Promise<string> {
  const parts = envelope.split(":");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) {
    throw new GmailOAuthError("GMAIL_SECRET_UNAVAILABLE", "The stored Gmail OAuth credential has an invalid envelope.");
  }
  const { key, raw } = await encryptionKey(encodedKey, ["decrypt"]);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(parts[1]),
        additionalData: new TextEncoder().encode(`visitor-gmail:${purpose}:v1`),
      },
      key,
      fromBase64(parts[2]),
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof GmailOAuthError) throw error;
    throw new GmailOAuthError("GMAIL_SECRET_UNAVAILABLE", "The stored Gmail OAuth credential cannot be decrypted.");
  } finally {
    raw.fill(0);
  }
}

export async function buildGmailAuthorizationUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): Promise<string> {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: GMAIL_SEND_SCOPE,
    state: args.state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    code_challenge: await pkceChallenge(args.codeVerifier),
    code_challenge_method: "S256",
    login_hint: VISITOR_GMAIL_SENDER,
  }).toString();
  return url.toString();
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function assertSendOnlyScope(scope: string | undefined, required = true): string[] {
  const scopes = (scope ?? "").split(/\s+/).map((value) => value.trim()).filter(Boolean);
  if ((required && scopes.length === 0) || scopes.some((value) => value !== GMAIL_SEND_SCOPE) || !scopes.includes(GMAIL_SEND_SCOPE)) {
    throw new GmailOAuthError("GMAIL_SCOPE_REJECTED", "Google did not grant exactly the Gmail send-only scope.");
  }
  return scopes;
}

async function tokenRequest(parameters: Record<string, string>, fetcher: FetchLike): Promise<GoogleTokenResponse> {
  const response = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const body = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || body.error) {
    throw new GmailOAuthError(
      `GOOGLE_OAUTH_${String(body.error || response.status).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
      body.error_description || "Google rejected the OAuth token request.",
    );
  }
  return body;
}

export async function exchangeGmailAuthorizationCode(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  secrets: GmailOAuthSecrets;
  fetcher?: FetchLike;
}): Promise<{ accessToken: string; refreshToken: string; scopes: string[] }> {
  const body = await tokenRequest({
    code: args.code,
    client_id: args.secrets.clientId,
    client_secret: args.secrets.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
    code_verifier: args.codeVerifier,
  }, args.fetcher ?? fetch);
  const scopes = assertSendOnlyScope(body.scope);
  if (!body.access_token || !body.refresh_token) {
    throw new GmailOAuthError(
      "GMAIL_REFRESH_TOKEN_MISSING",
      "Google did not return an offline refresh token. Revoke the prior grant and reconnect with consent.",
    );
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, scopes };
}

export async function refreshGmailAccessToken(args: {
  refreshToken: string;
  secrets: GmailOAuthSecrets;
  fetcher?: FetchLike;
}): Promise<string> {
  const body = await tokenRequest({
    refresh_token: args.refreshToken,
    client_id: args.secrets.clientId,
    client_secret: args.secrets.clientSecret,
    grant_type: "refresh_token",
  }, args.fetcher ?? fetch);
  if (body.scope) assertSendOnlyScope(body.scope);
  if (!body.access_token) throw new GmailOAuthError("GMAIL_ACCESS_TOKEN_MISSING", "Google did not return an access token.");
  return body.access_token;
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function wrapBase64(value: string): string {
  return value.replace(/\s+/g, "").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodedUtf8(value: string): string {
  return wrapBase64(toBase64(new TextEncoder().encode(value.replace(/\r?\n/g, "\r\n"))));
}

function encodedSubject(value: string): string {
  return `=?UTF-8?B?${toBase64(new TextEncoder().encode(safeHeader(value)))}?=`;
}

export async function createGmailRawMessage(args: {
  to: string;
  payload: GmailMessagePayload;
  idempotencyKey: string;
}): Promise<string> {
  const mixedBoundary = `hirna-mixed-${randomOAuthValue(18)}`;
  const alternativeBoundary = `hirna-alt-${randomOAuthValue(18)}`;
  const stableId = await sha256Hex(args.idempotencyKey);
  const lines = [
    `From: HIRNA TNVS <${VISITOR_GMAIL_SENDER}>`,
    `To: ${safeHeader(args.to)}`,
    `Subject: ${encodedSubject(args.payload.subject)}`,
    `Message-ID: <visitor-${stableId}@hirna-tnvs.local>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=\"${mixedBoundary}\"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary=\"${alternativeBoundary}\"`,
    "",
    `--${alternativeBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedUtf8(args.payload.text),
    `--${alternativeBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedUtf8(args.payload.html),
    `--${alternativeBoundary}--`,
  ];
  for (const attachment of args.payload.attachments ?? []) {
    const filename = safeHeader(attachment.filename).replace(/[\"\\]/g, "_").slice(0, 180) || "attachment.bin";
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: application/octet-stream; name=\"${filename}\"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename=\"${filename}\"`,
      "",
      wrapBase64(attachment.content),
    );
  }
  lines.push(`--${mixedBoundary}--`, "");
  return base64Url(new TextEncoder().encode(lines.join("\r\n")));
}

export async function sendGmailMessage(args: {
  to: string;
  payload: GmailMessagePayload;
  idempotencyKey: string;
  refreshToken: string;
  secrets: GmailOAuthSecrets;
  fetcher?: FetchLike;
}): Promise<string> {
  const fetcher = args.fetcher ?? fetch;
  const accessToken = await refreshGmailAccessToken({ refreshToken: args.refreshToken, secrets: args.secrets, fetcher });
  const raw = await createGmailRawMessage({ to: args.to, payload: args.payload, idempotencyKey: args.idempotencyKey });
  const response = await fetcher(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string; status?: string } };
  if (!response.ok || !body.id) {
    throw new GmailOAuthError(
      `GMAIL_SEND_${String(body.error?.status || response.status).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
      body.error?.message || "Gmail rejected the message.",
    );
  }
  return body.id;
}

export async function revokeGoogleRefreshToken(refreshToken: string, fetcher: FetchLike = fetch): Promise<void> {
  const response = await fetcher(GOOGLE_REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  });
  if (!response.ok) throw new GmailOAuthError("GMAIL_REVOKE_FAILED", "Google did not accept the token revocation request.");
}
