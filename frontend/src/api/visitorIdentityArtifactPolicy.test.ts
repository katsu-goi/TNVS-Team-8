import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const visitorSource = readFileSync(resolve(process.cwd(), '../supabase/functions/visitor/index.ts'), 'utf8');
const deployment = JSON.parse(readFileSync(resolve(process.cwd(), '../vercel.json'), 'utf8'));

describe('visitor identity artifact security contract', () => {
  it('keeps the artifact route limited to assigned Facilities Officers', () => {
    expect(visitorSource).toContain('const VISITOR_OPERATIONS_ROLES = ["FACILITIES_OFFICER"]');
    expect(visitorSource).toContain('{ method: "GET", path: "/visitors/:id/identity-artifacts", guard: { kind: "assignedRoles", roles: VISITOR_OPERATIONS_ROLES }');
    expect(visitorSource).not.toContain('path: "/visitors/:id/identity-artifacts", guard: { kind: "public" }');
  });

  it('issues only five-minute signed links and never public storage URLs', () => {
    expect(visitorSource).toContain('.createSignedUrl(artifact.storage_path, 300)');
    expect(visitorSource).toContain('expiresInSeconds: 300');
    expect(visitorSource).not.toContain('.getPublicUrl(artifact.storage_path)');
  });

  it('checks ownership, active metadata, and accepted image media types', () => {
    expect(visitorSource).toContain('visitor.registration_source !== "KIOSK"');
    expect(visitorSource).toContain('.eq("visitor_id", p.id).is("deleted_at", null)');
    expect(visitorSource).toContain('["image/jpeg", "image/png", "image/webp"].includes(artifact.mime_type)');
  });

  it('permits only the configured Supabase project origin for signed images in production CSP', () => {
    const csp = deployment.headers[0].headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value;
    expect(csp).toContain("img-src 'self' data: blob: https://dunijfrvfozwlykpkfhy.supabase.co");
    expect(csp).not.toContain('img-src *');
  });
});
