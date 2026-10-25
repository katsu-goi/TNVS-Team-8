import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '..');
const visitor = readFileSync(resolve(root, 'supabase/functions/visitor/index.ts'), 'utf8');
const policy = readFileSync(resolve(root, 'supabase/functions/_shared/visitor-kiosk-config.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261024000100_visitor_identity_screening.sql'), 'utf8');
const readinessMigration = readFileSync(resolve(root, 'supabase/migrations/20261024000200_visitor_biometric_readiness.sql'), 'utf8');
const cleanupMigration = readFileSync(resolve(root, 'supabase/migrations/20261024000300_visitor_biometric_temporary_cleanup.sql'), 'utf8');
const readiness = readFileSync(resolve(root, 'supabase/functions/_shared/visitor-biometric.ts'), 'utf8');
const admin = readFileSync(resolve(root, 'supabase/functions/admin/index.ts'), 'utf8');
const python = readFileSync(resolve(root, 'services/visitor-biometric/app/main.py'), 'utf8');
const pythonStorage = readFileSync(resolve(root, 'services/visitor-biometric/app/storage.py'), 'utf8');
const vercelContainer = readFileSync(resolve(root, 'services/visitor-biometric/Dockerfile.vercel'), 'utf8');
const vercelBuildReport = readFileSync(resolve(root, 'services/visitor-biometric/app/build_report.py'), 'utf8');
const vercelProject = readFileSync(resolve(root, 'services/visitor-biometric/vercel.json'), 'utf8');
const modelManifest = readFileSync(resolve(root, 'services/visitor-biometric/app/model_manifest.py'), 'utf8');
const dependencyLock = readFileSync(resolve(root, 'services/visitor-biometric/requirements.lock.txt'), 'utf8');

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
    expect(readiness).toContain('VISITOR_BIOMETRIC_ENABLED');
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
    expect(python).toContain('asyncio.wait({task}, timeout=timeout)');
    expect(python).not.toContain('allow_origins=["*"]');
  });

  it('requires evidence-backed reviews and a real authenticated inference readiness check', () => {
    expect(readinessMigration).toContain('biometric_retention_approved boolean not null default false');
    expect(readinessMigration).toContain("length(trim(coalesce(biometric_privacy_evidence, ''))) >= 10");
    expect(readiness).toContain('X-Visitor-Verification-Key');
    expect(readiness).toContain('/v1/readiness');
    expect(readiness).toContain('inferenceStatus !== "PASSED"');
    expect(admin).toContain('path: "/admin/visitor-biometric-readiness", guard: DIRECT_SUPER_ADMIN');
    expect(admin).toContain('BIOMETRIC_TECHNICAL_NOT_READY');
    expect(visitor).toContain('checkVisitorBiometricTechnicalReadiness(false)');
  });

  it('uses short-lived private Supabase references for the Vercel biometric container', () => {
    expect(visitor).toContain('createSignedUrl(storagePath, 300)');
    expect(visitor).toContain('createSignedUrl(selfieStoragePath, 300)');
    expect(visitor).toContain('body: JSON.stringify({ requestId, idImageReference, selfieImageReference })');
    expect(visitor).toContain('VISITOR_BIOMETRIC_VERCEL_BYPASS_SECRET');
    expect(visitor).toContain('x-vercel-protection-bypass');
    expect(readiness).toContain('VISITOR_BIOMETRIC_VERCEL_BYPASS_SECRET');
    expect(readiness).toContain('x-vercel-protection-bypass');
    expect(visitor).toContain('remove([selfieStoragePath])');
    expect(visitor).toContain('cacheControl: "0"');
    expect(pythonStorage).toContain('VISITOR_BIOMETRIC_STORAGE_ORIGIN');
    expect(pythonStorage).toContain('/storage/v1/object/sign/');
    expect(pythonStorage).toContain('_RejectRedirects');
    expect(vercelContainer).toContain('VISITOR_BIOMETRIC_REQUIRE_STORAGE_REFERENCES=true');
    expect(vercelContainer).toContain('--port ${PORT:-80}');
    expect(vercelContainer).toContain('VISITOR_BIOMETRIC_ENABLED=false');
    expect(vercelContainer).toContain('pip check');
    expect(vercelContainer).toContain('python -m app.build_report');
    expect(vercelBuildReport).toContain('sitePackagesBytes');
    expect(vercelBuildReport).toContain('deepfaceHomeBytes');
    expect(vercelBuildReport).toContain('sha256_file');
    expect(JSON.parse(vercelProject).regions).toEqual(['sin1']);
  });

  it('pins the reviewed model profile, dependencies, and orphan-object cleanup', () => {
    expect(modelManifest).toContain('APPROVED_MODEL_PROFILE = "opencv-sface-yunet-2021dec-2023mar"');
    expect(modelManifest).toContain('0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79');
    expect(modelManifest).toContain('8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4');
    expect(vercelContainer).toContain('DEEPFACE_MODEL=SFace');
    expect(vercelContainer).toContain('DEEPFACE_DETECTOR=yunet');
    expect(vercelContainer).toContain('--require-hashes -r requirements.lock.txt');
    expect(dependencyLock).toContain('deepface==0.0.103 --hash=sha256:');
    expect(cleanupMigration).toContain('visitor_biometric_temporary_objects');
    expect(cleanupMigration).toContain('enable row level security');
    expect(visitor).toContain('/visitor-biometric/temporary-cleanup');
    expect(visitor).toContain('VISITOR_BIOMETRIC_CLEANUP_KEY');
  });
});
