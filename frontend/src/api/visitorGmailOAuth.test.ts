import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildGmailAuthorizationUrl,
  createGmailRawMessage,
  decryptGmailSecret,
  encryptGmailSecret,
  exchangeGmailAuthorizationCode,
  GMAIL_SEND_SCOPE,
  gmailOAuthRedirectUri,
  sendGmailMessage,
  VISITOR_GMAIL_SENDER,
} from '../../../supabase/functions/_shared/visitor-gmail';

const projectUrl = 'https://dunijfrvfozwlykpkfhy.supabase.co';

describe('visitor Gmail OAuth security', () => {
  it('produces the exact deployed callback and a send-only offline PKCE request', async () => {
    const redirectUri = gmailOAuthRedirectUri(projectUrl);
    expect(redirectUri).toBe(`${projectUrl}/functions/v1/visitor/admin/gmail-oauth/callback`);
    const authorization = new URL(await buildGmailAuthorizationUrl({
      clientId: 'client.apps.googleusercontent.com', redirectUri, state: 'state-value', codeVerifier: 'verifier-value',
    }));
    expect(authorization.origin + authorization.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authorization.searchParams.get('scope')).toBe(GMAIL_SEND_SCOPE);
    expect(authorization.searchParams.get('access_type')).toBe('offline');
    expect(authorization.searchParams.get('prompt')).toBe('consent');
    expect(authorization.searchParams.get('include_granted_scopes')).toBe('false');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('state')).toBe('state-value');
    expect(authorization.searchParams.get('login_hint')).toBe(VISITOR_GMAIL_SENDER);
  });

  it('encrypts backend OAuth material with purpose-bound AES-GCM', async () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const envelope = await encryptGmailSecret('refresh-secret', 'refresh-token', key);
    expect(envelope).not.toContain('refresh-secret');
    await expect(decryptGmailSecret(envelope, 'refresh-token', key)).resolves.toBe('refresh-secret');
    await expect(decryptGmailSecret(envelope, 'pkce-verifier', key)).rejects.toMatchObject({ code: 'GMAIL_SECRET_UNAVAILABLE' });
  });

  it('exchanges the code server-side and rejects broader Google grants', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access', refresh_token: 'refresh', scope: GMAIL_SEND_SCOPE, token_type: 'Bearer', expires_in: 3600,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
    const result = await exchangeGmailAuthorizationCode({
      code: 'authorization-code', codeVerifier: 'pkce-verifier', redirectUri: gmailOAuthRedirectUri(projectUrl),
      secrets: { clientId: 'client-id', clientSecret: 'client-secret', encryptionKey: Buffer.alloc(32).toString('base64') }, fetcher,
    });
    expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh', scopes: [GMAIL_SEND_SCOPE] });
    const request = vi.mocked(fetcher).mock.calls[0];
    expect(String(request[0])).toBe('https://oauth2.googleapis.com/token');
    expect(String(request[1]?.body)).toContain('code_verifier=pkce-verifier');

    const broadFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access', refresh_token: 'refresh', scope: `${GMAIL_SEND_SCOPE} https://www.googleapis.com/auth/gmail.readonly`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
    await expect(exchangeGmailAuthorizationCode({
      code: 'code', codeVerifier: 'verifier', redirectUri: gmailOAuthRedirectUri(projectUrl),
      secrets: { clientId: 'id', clientSecret: 'secret', encryptionKey: Buffer.alloc(32).toString('base64') }, fetcher: broadFetcher,
    })).rejects.toMatchObject({ code: 'GMAIL_SCOPE_REJECTED' });
  });

  it('builds a Gmail API raw MIME message with the fixed sender and stable message ID', async () => {
    const payload = { subject: 'Approved', text: 'Approved text', html: '<p>Approved</p>', attachments: [{ filename: 'pass.png', content: 'aGVsbG8=' }] };
    const raw = await createGmailRawMessage({ to: 'visitor@example.test', payload, idempotencyKey: 'visitor/approval/1' });
    const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(mime).toContain(`From: HIRNA TNVS <${VISITOR_GMAIL_SENDER}>`);
    expect(mime).toContain('To: visitor@example.test');
    expect(mime).toContain('Content-Disposition: attachment; filename="pass.png"');
    expect(mime).toMatch(/Message-ID: <visitor-[0-9a-f]{64}@hirna-tnvs\.local>/);
  });

  it('refreshes in memory and sends through the fixed authorized mailbox endpoint', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'short-lived-access', scope: GMAIL_SEND_SCOPE }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'gmail-message-id' }), { status: 200 })) as unknown as typeof fetch;
    await expect(sendGmailMessage({
      to: 'visitor@example.test', payload: { subject: 'Update', text: 'Update', html: '<p>Update</p>' },
      idempotencyKey: 'visitor/decline/1', refreshToken: 'refresh-token',
      secrets: { clientId: 'id', clientSecret: 'secret', encryptionKey: Buffer.alloc(32).toString('base64') }, fetcher,
    })).resolves.toBe('gmail-message-id');
    expect(String(vi.mocked(fetcher).mock.calls[1][0])).toBe(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(VISITOR_GMAIL_SENDER)}/messages/send`);
    expect(vi.mocked(fetcher).mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer short-lived-access' });
  });

  it('registers only the callback publicly and keeps management direct-SUPER_ADMIN-only', () => {
    const root = resolve(process.cwd(), '..');
    const visitor = readFileSync(resolve(root, 'supabase/functions/visitor/index.ts'), 'utf8');
    const migration = readFileSync(resolve(root, 'supabase/migrations/20261022000200_visitor_gmail_oauth.sql'), 'utf8');
    const app = readFileSync(resolve(root, 'frontend/src/App.tsx'), 'utf8');
    expect(visitor).toContain('{ method: "GET", path: "/admin/gmail-oauth/callback", guard: { kind: "public" }');
    expect(visitor).toContain('const DIRECT_SUPER_ADMIN = { kind: "assignedRoles", roles: ["SUPER_ADMIN"] }');
    expect(visitor).toContain('path: "/admin/gmail-oauth/authorize", guard: DIRECT_SUPER_ADMIN');
    expect(visitor).toContain('path: "/admin/gmail-oauth/disconnect", guard: DIRECT_SUPER_ADMIN');
    expect(migration).toContain('revoke all on public.visitor_gmail_oauth_configuration from public, anon, authenticated');
    expect(migration).toContain('revoke all on public.visitor_gmail_oauth_states from public, anon, authenticated');
    expect(app).toContain('path="admin/visitor-kiosk" element={<AdminPortalRoute><VisitorKioskConfigPage /></AdminPortalRoute>}');
  });
});
