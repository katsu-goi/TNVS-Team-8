import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '..');
const visitor = readFileSync(resolve(root, 'supabase/functions/visitor/index.ts'), 'utf8');
const policy = readFileSync(resolve(root, 'supabase/functions/_shared/visitor-kiosk-config.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261024000100_visitor_identity_screening.sql'), 'utf8');
const python = readFileSync(resolve(root, 'services/visitor-biometric/app/main.py'), 'utf8');

describe('visitor identity screening security contract', () => {
  it('requires a supported OCR classification before private upload', () => {
    const validation = visitor.indexOf('documentClassification !== "SUPPORTED_ID_TYPE"');
    const upload = visitor.indexOf('.from(IMAGE_BUCKET).upload');
    expect(validation).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(validation);
    expect(visitor).toContain('DOCUMENT_SCREENING_REQUIRED');
  });

  it('keeps biometrics default-off behind organizational and runtime gates', () => {
    expect(migration).toContain('biometric_processing_enabled boolean not null default false');
    expect(policy).toContain('policy.biometricPrivacyApproved && policy.biometricPiaApproved');
    expect(policy).toContain('policy.biometricSecurityApproved && policy.biometricLicenseApproved');
    expect(visitor).toContain('VISITOR_BIOMETRIC_ENABLED');
    expect(visitor).toContain('VISITOR_BIOMETRIC_SERVICE_KEY');
  });

  it('preserves manual clearance and stores no embeddings', () => {
    expect(migration).toContain('manual_identity_review_required boolean not null default true');
    expect(visitor).toContain('manual_identity_review_required: true');
    expect(visitor).toContain('MANUAL_REVIEW_APPROVED');
    expect(`${visitor}\n${migration}`.toLowerCase()).not.toContain('face_embedding');
  });

  it('protects the Python service with a server key, disabled default, limits, and timeout', () => {
    expect(python).toContain('hmac.compare_digest');
    expect(python).toContain('VISITOR_BIOMETRIC_ENABLED", "false"');
    expect(python).toContain('asyncio.Semaphore');
    expect(python).toContain('asyncio.wait_for');
    expect(python).not.toContain('allow_origins=["*"]');
  });
});
