import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canKnowDocument, canViewDocumentContent, documentAccessFlags,
  type DocumentAccessContext,
} from '../../../supabase/functions/_shared/document-access.ts';

const document = (classification: string, overrides: Record<string, unknown> = {}) => ({
  id: 'document-1',
  owner_email: 'owner@hirna.test',
  department_id: 'facilities-id',
  department: 'Facilities',
  classification_level: classification,
  status: 'APPROVED',
  owning_module: 'DOCUMENTS',
  ...overrides,
});

const context = (roles: string[], permissions: string[], overrides: Partial<DocumentAccessContext> = {}): DocumentAccessContext => ({
  email: 'viewer@hirna.test',
  departmentId: 'facilities-id',
  departmentName: 'Facilities',
  roles,
  permissions,
  ...overrides,
});

const metadata = ['DOCUMENT_VIEW_METADATA'];
const view = ['DOCUMENT_VIEW_METADATA', 'DOCUMENT_VIEW', 'DOCUMENT_DOWNLOAD', 'DOCUMENT_PRINT'];

describe('enterprise document archive authorization policy', () => {
  it('allows Records Officer custody access without using technical-admin privileges', () => {
    const viewer = context(['RECORDS_OFFICER'], view);
    expect(canKnowDocument(viewer, document('RESTRICTED'), [])).toBe(true);
    expect(canViewDocumentContent(viewer, document('RESTRICTED'), [])).toBe(true);
  });

  it('scopes a Department Head to the originating department', () => {
    const viewer = context(['DEPARTMENT_HEAD', 'EMPLOYEE'], view);
    expect(canViewDocumentContent(viewer, document('RESTRICTED'), [])).toBe(true);
    expect(canKnowDocument(viewer, document('RESTRICTED', { department_id: 'legal-id', department: 'Legal' }), [])).toBe(false);
  });

  it('hides restricted cross-department documents from employees', () => {
    const viewer = context(['EMPLOYEE'], view, { departmentId: 'finance-id', departmentName: 'Finance' });
    expect(canKnowDocument(viewer, document('RESTRICTED'), [])).toBe(false);
    expect(canViewDocumentContent(viewer, document('RESTRICTED'), [])).toBe(false);
  });

  it('does not grant Super Admin or System Admin implicit content access', () => {
    for (const role of ['SUPER_ADMIN', 'SYSTEM_ADMIN']) {
      const viewer = context([role], [...metadata, 'DOCUMENT_VIEW']);
      expect(canKnowDocument(viewer, document('CONFIDENTIAL'), [])).toBe(false);
      expect(canViewDocumentContent(viewer, document('CONFIDENTIAL'), [])).toBe(false);
    }
  });

  it('preserves an explicitly assigned business role in a multi-role account', () => {
    const viewer = context(['SUPER_ADMIN', 'RECORDS_OFFICER'], view);
    expect(canViewDocumentContent(viewer, document('RESTRICTED'), [])).toBe(true);
  });

  it('keeps classification and actions separate', () => {
    const employee = context(['EMPLOYEE'], metadata);
    expect(canViewDocumentContent(employee, document('PUBLIC'), [])).toBe(true);
    expect(documentAccessFlags(employee, document('PUBLIC'), []).download).toBe(false);
    expect(canKnowDocument(employee, document('CONFIDENTIAL'), [])).toBe(true);
    expect(canViewDocumentContent(employee, document('CONFIDENTIAL'), [])).toBe(false);
    expect(canKnowDocument(employee, document('RESTRICTED'), [])).toBe(false);
  });

  it('protects highly restricted content while allowing a matching specialist', () => {
    const records = context(['RECORDS_OFFICER'], view);
    const privacy = context(['DATA_PROTECTION_OFFICER'], view);
    const privateRecord = document('HIGHLY_RESTRICTED', { owning_module: 'PRIVACY', title: 'Personal data request' });
    expect(canKnowDocument(records, privateRecord, [])).toBe(true);
    expect(canViewDocumentContent(records, privateRecord, [])).toBe(false);
    expect(canViewDocumentContent(privacy, privateRecord, [])).toBe(true);
  });

  it('never grants domain access from an unconfirmed AI suggestion', () => {
    const privacy = context(['DATA_PROTECTION_OFFICER'], view, { departmentId: 'privacy-id', departmentName: 'Privacy' });
    const suggested = document('RESTRICTED', {
      department_id: 'legal-id', department: 'Legal', owning_module: 'DOCUMENTS',
      ai_predicted_category: 'PRIVACY', classification_review_status: 'PENDING',
    });
    expect(canViewDocumentContent(privacy, suggested, [])).toBe(false);
    expect(canViewDocumentContent(privacy, { ...suggested, classification_review_status: 'APPROVED' }, [])).toBe(true);
  });

  it('allows an explicit user grant and does not treat archived as deleted', () => {
    const outsider = context(['EMPLOYEE'], view, { departmentId: 'other-id', departmentName: 'Other' });
    const archived = document('RESTRICTED', { status: 'ARCHIVED' });
    const grant = [{ grantee_type: 'USER', grantee_key: 'viewer@hirna.test', access_level: 'VIEW', is_deleted: false }];
    expect(canViewDocumentContent(outsider, archived, grant)).toBe(true);
  });
});

describe('enterprise archive server and migration contract', () => {
  const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261001000400_enterprise_document_archive.sql'), 'utf8');
  const edge = readFileSync(resolve(process.cwd(), '../supabase/functions/documents/index.ts'), 'utf8');

  it('derives departments from real existing rows without a hardcoded department catalog', () => {
    expect(migration).toMatch(/select trim\(department\).*from public\.users/is);
    expect(migration).toMatch(/select trim\(department\).*from public\.documents/is);
    expect(migration).not.toMatch(/'Administration'|'Finance'|'Human Resources'|'Facilities'|'Information Technology'/);
  });

  it('uses private signed URLs only after centralized content authorization and audits views', () => {
    const start = edge.indexOf('async function handleGetSignedUrl');
    const end = edge.indexOf('async function handleDeleteOwnedDocument', start);
    const handler = edge.slice(start, end);
    expect(handler.indexOf('canViewDocumentContent')).toBeLessThan(handler.indexOf('createSignedUrl'));
    expect(handler).toMatch(/VIEW_DOCUMENT/);
    expect(handler).not.toMatch(/file_path:\s*filePath|signedUrl.*writeAudit/);
  });

  it('keeps access requests human-decided and service-role tables browser-inaccessible', () => {
    expect(migration).toMatch(/status text not null default 'PENDING'/);
    expect(migration).toMatch(/decision_reason/);
    expect(migration).toMatch(/revoke all privileges on table public\.document_access_requests from anon, authenticated/i);
    expect(edge).toMatch(/APPROVE_DOCUMENT_ACCESS/);
    expect(edge).toMatch(/DENY_DOCUMENT_ACCESS/);
  });
});
