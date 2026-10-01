import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261001000100_document_duplicate_detection.sql'), 'utf8');
const edge = readFileSync(resolve(process.cwd(), '../supabase/functions/documents/index.ts'), 'utf8');
const frontend = readFileSync(resolve(process.cwd(), 'src/api/documentService.ts'), 'utf8');

describe('duplicate detector backend authorization and safety contract', () => {
  it('uses a materialized authorized scope before candidate ranking', () => {
    expect(migration).toMatch(/with authorized as materialized/i);
    expect(migration.indexOf('with authorized as materialized')).toBeLessThan(migration.indexOf('candidates as'));
  });

  it('supports owner and explicit user/role grants', () => {
    expect(migration).toMatch(/owner_email/);
    expect(migration).toMatch(/document_grants/);
    expect(migration).toMatch(/grantee_type = 'USER'/);
    expect(migration).toMatch(/grantee_type = 'ROLE'/);
  });

  it('preserves employee cross-user isolation', () => {
    expect(migration).toMatch(/not \('EMPLOYEE' = any/);
  });

  it('preserves multi-role visibility evaluation', () => {
    expect(migration).toMatch(/p_roles text\[\]/);
    expect(migration).toMatch(/'SUPER_ADMIN' = any/);
    expect(migration).toMatch(/'COMPLIANCE_OFFICER' = any/);
  });

  it('exposes the candidate RPC only to service_role', () => {
    expect(migration).toMatch(/revoke all on function public\.phase10_document_duplicate_candidates[\s\S]+from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.phase10_document_duplicate_candidates[\s\S]+to service_role/i);
  });

  it('does not place a service-role credential in the browser service', () => {
    expect(frontend).not.toMatch(/service[_-]?role/i);
  });

  it('persists a review decision through the existing audit writer', () => {
    expect(edge).toMatch(/DOCUMENT_DUPLICATE_REVIEWED/);
    expect(edge).toMatch(/writeAudit/);
  });

  it('does not perform automatic delete, overwrite, archive, ownership, or classification changes in duplicate review', () => {
    const start = edge.indexOf('async function handleDuplicateReview');
    const end = edge.indexOf('async function handleGetSignedUrl', start);
    const handler = edge.slice(start, end);
    expect(handler).not.toMatch(/\.delete\(/);
    expect(handler).not.toMatch(/owner_email|classification_level|status:\s*["']ARCHIVED/);
  });
});
