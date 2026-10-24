import { describe, expect, it } from 'vitest';
import {
  evaluateVisitorKioskReadiness,
  findUnresolvedVisitorPolicyPlaceholders,
  publicVisitorKioskPrivacy,
  VISITOR_KIOSK_FIXED_DEPARTMENT_PURPOSES,
  type VisitorKioskPolicy,
} from '../../../supabase/functions/_shared/visitor-kiosk-config.ts';

const departments = ['Facilities', 'Human Resources', 'Operations'];
const completePolicy = (): VisitorKioskPolicy => ({
  organizationName: 'HIRNA TNVS',
  controllerName: 'Approved controller',
  controllerContact: 'privacy@example.test',
  dpoContact: 'dpo@example.test',
  processingPurposes: 'Visitor registration, authorization, security, and audit.',
  lawfulBasis: 'Organization-approved lawful basis for each stated processing activity.',
  privacyNoticeText: 'An organization-approved notice explaining the actual visitor processing activities.',
  acknowledgementText: 'I acknowledge that I have read and understood this notice.',
  noticeVersion: 'v1',
  retentionPolicy: 'Private identity images are securely deleted after the approved period.',
  retentionDays: 30,
  rightsProcess: 'Contact the approved privacy channel to exercise applicable data subject rights.',
  processors: 'Approved infrastructure and email processors.',
  safeguards: 'Private storage, role checks, audit logging, and time-limited signed access.',
  alternativeVerification: 'An authorized officer manually reviews the original ID and stored image.',
  acceptedIdTypes: ['Philippine Passport'],
  purposeDepartmentRoutes: Object.fromEntries(VISITOR_KIOSK_FIXED_DEPARTMENT_PURPOSES.map((purpose) => [purpose, 'Operations'])),
  registrationEnabled: true,
  privacyReviewApproved: true,
  securityReviewApproved: true,
  operationsReviewApproved: true,
});

describe('visitor kiosk readiness policy', () => {
  it('requires the explicit enable switch after every policy and review is complete', () => {
    const policy = { ...completePolicy(), registrationEnabled: false };
    const readiness = evaluateVisitorKioskReadiness(policy, departments);
    expect(readiness.configurationComplete).toBe(true);
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain('registrationEnabled');
  });

  it('fails closed when an organizational approval or active department route is missing', () => {
    const policy = completePolicy();
    policy.privacyReviewApproved = false;
    policy.purposeDepartmentRoutes.HR_RECRUITMENT = 'Inactive Department';
    const readiness = evaluateVisitorKioskReadiness(policy, departments);
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(expect.arrayContaining(['privacyReviewApproval', 'purposeDepartmentRoutes']));
  });

  it('becomes ready only with complete policy, valid active routes, approvals, and enablement', () => {
    expect(evaluateVisitorKioskReadiness(completePolicy(), departments)).toEqual({
      ready: true,
      configurationComplete: true,
      registrationEnabled: true,
      missing: [],
    });
  });

  it.each([
    ['privacyNoticeText', 'Retention is [NUMBER] days.'],
    ['retentionPolicy', 'Deletion starts after [DEFINED STARTING EVENT].'],
    ['dpoContact', '[APPROVED PRIVACY EMAIL]'],
    ['controllerName', '[REGISTERED ORGANIZATION NAME]'],
    ['controllerContact', '[OFFICIAL PRIVACY EMAIL OR CONTACT NUMBER]'],
    ['lawfulBasis', 'Subject to organizational approval'],
  ] as const)('fails closed when %s contains unresolved organization content', (field, value) => {
    const policy = { ...completePolicy(), [field]: value };
    const readiness = evaluateVisitorKioskReadiness(policy, departments);
    expect(readiness.ready).toBe(false);
    expect(readiness.configurationComplete).toBe(false);
    expect(readiness.missing).toContain(`${field}:unresolvedPlaceholder`);
  });

  it('recognizes normal Markdown links without treating their labels as placeholders', () => {
    const policy = completePolicy();
    policy.privacyNoticeText = 'Read the [PRIVACY POLICY](https://example.test/privacy) and contact the DPO.';
    expect(findUnresolvedVisitorPolicyPlaceholders(policy)).toEqual([]);
    expect(evaluateVisitorKioskReadiness(policy, departments).ready).toBe(true);
  });

  it('redacts incomplete policy content from the public kiosk projection', () => {
    const policy = completePolicy();
    policy.dpoContact = '[APPROVED PRIVACY EMAIL]';
    const publicConfig = publicVisitorKioskPrivacy(policy, evaluateVisitorKioskReadiness(policy, departments));
    expect(publicConfig.ready).toBe(false);
    expect(publicConfig.configurationComplete).toBe(false);
    expect(publicConfig.dpoContact).toBe('');
    expect(publicConfig.privacyNoticeText).toBe('');
    expect(publicConfig.acceptedIdTypes).toEqual([]);
    expect(JSON.stringify(publicConfig)).not.toContain('[APPROVED PRIVACY EMAIL]');
  });

  it('keeps administrative approval metadata out of the public projection', () => {
    const policy = completePolicy();
    const publicConfig = publicVisitorKioskPrivacy(policy, evaluateVisitorKioskReadiness(policy, departments));
    expect(publicConfig.ready).toBe(true);
    expect(publicConfig).not.toHaveProperty('privacyReviewApproved');
    expect(publicConfig).not.toHaveProperty('revision');
    expect(publicConfig).not.toHaveProperty('updatedBy');
  });

  it('does not publish biometric text or enable comparison when policy placeholders remain', () => {
    const policy = {
      ...completePolicy(),
      biometricProcessingEnabled: true,
      biometricNoticeText: 'Approved notice for [INSERT ORGANIZATION DETAILS HERE].',
      biometricAuthorizationText: 'I authorize the optional comparison.',
      biometricPrivacyApproved: true,
      biometricPiaApproved: true,
      biometricSecurityApproved: true,
      biometricLicenseApproved: true,
    };
    const publicConfig = publicVisitorKioskPrivacy(policy, evaluateVisitorKioskReadiness(policy, departments), true);
    expect(publicConfig.identityVerification.status).toBe('DISABLED');
    expect(publicConfig.identityVerification.biometricNotice).toBe('');
    expect(JSON.stringify(publicConfig)).not.toContain('INSERT ORGANIZATION DETAILS HERE');
  });
});
