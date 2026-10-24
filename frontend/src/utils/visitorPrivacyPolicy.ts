export const visitorPolicyFieldLabels: Record<string, string> = {
  organizationName: 'Organization name',
  controllerName: 'Personal information controller',
  controllerContact: 'Controller contact',
  dpoContact: 'DPO / privacy contact',
  processingPurposes: 'Processing purposes and information collected',
  lawfulBasis: 'Lawful basis',
  privacyNoticeText: 'Public privacy notice',
  acknowledgementText: 'Visitor acknowledgment statement',
  noticeVersion: 'Privacy notice version',
  retentionPolicy: 'Retention and secure deletion policy',
  rightsProcess: 'Data subject rights and request procedure',
  processors: 'Authorized processors and service providers',
  safeguards: 'Safeguards',
  alternativeVerification: 'Alternative/manual identity verification',
  acceptedIdTypes: 'Approved ID types',
};

const unresolvedPolicyPatterns = [
  /\[(?![^\]]+\]\s*\()[A-Z][A-Z0-9 _./-]{1,80}\]/g,
  /\b(?:subject to organizational approval|to be (?:provided|confirmed|determined|approved)|tbd|todo)\b/gi,
  /\b(?:insert|enter|provide)\s+(?:the\s+)?[^\n.]{1,80}\s+here\b/gi,
] as const;

export type UnresolvedPrivacyPolicyContent = { field: string; label: string; token: string };

export function findUnresolvedBiometricPolicyContent(values: object): UnresolvedPrivacyPolicyContent[] {
  const record = values as Record<string, unknown>;
  return [
    ['biometricNoticeText', 'Approved biometric-processing notice'],
    ['biometricAuthorizationText', 'Separate visitor authorization statement'],
  ].flatMap(([field, label]) => unresolvedPolicyPatterns.flatMap((pattern) => {
    const matches = String(record[field] ?? '').match(new RegExp(pattern.source, pattern.flags)) ?? [];
    return matches.map((token) => ({ field, label, token }));
  }));
}

export function findUnresolvedPrivacyPolicyContent(values: object): UnresolvedPrivacyPolicyContent[] {
  const record = values as Record<string, unknown>;
  const fields = Object.keys(visitorPolicyFieldLabels).flatMap((field) => {
    const value = record[field];
    return Array.isArray(value)
      ? value.map((item) => String(item ?? ''))
      : [String(value ?? '')];
  });
  const fieldNames = Object.keys(visitorPolicyFieldLabels).flatMap((field) => {
    const value = record[field];
    return Array.isArray(value) ? value.map(() => field) : [field];
  });

  return fields.flatMap((value, index) => unresolvedPolicyPatterns.flatMap((pattern) => {
    const matches = value.match(new RegExp(pattern.source, pattern.flags)) ?? [];
    const field = fieldNames[index];
    return matches.map((token) => ({ field, label: visitorPolicyFieldLabels[field], token }));
  }));
}
