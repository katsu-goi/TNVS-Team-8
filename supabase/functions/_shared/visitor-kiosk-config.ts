export const VISITOR_KIOSK_PURPOSES = [
  { value: "MEETING_EMPLOYEE", label: "Meeting an Employee" },
  { value: "DRIVER_PARTNER_ASSISTANCE", label: "Driver-Partner Inquiry or Assistance" },
  { value: "DRIVER_PARTNER_ONBOARDING", label: "Driver-Partner Onboarding or Requirements" },
  { value: "HR_RECRUITMENT", label: "Human Resources or Recruitment" },
  { value: "BUSINESS_MEETING", label: "Business Meeting or Partnership" },
  { value: "DOCUMENT_TRANSACTION", label: "Document Submission or Collection" },
  { value: "DELIVERY_PICKUP", label: "Delivery or Pickup" },
  { value: "FLEET_OPERATIONS", label: "Vehicle, Fleet, or Operations Concern" },
  { value: "MAINTENANCE_SERVICE", label: "Maintenance or Service Visit" },
  { value: "GOVERNMENT_REGULATORY", label: "Government or Regulatory Transaction" },
  { value: "OTHER", label: "Other Purpose" },
] as const;

export const VISITOR_KIOSK_FIXED_DEPARTMENT_PURPOSES = [
  "DRIVER_PARTNER_ASSISTANCE", "DRIVER_PARTNER_ONBOARDING", "HR_RECRUITMENT",
  "DOCUMENT_TRANSACTION", "DELIVERY_PICKUP", "FLEET_OPERATIONS",
  "MAINTENANCE_SERVICE", "GOVERNMENT_REGULATORY",
] as const;

export type VisitorKioskPolicy = {
  organizationName: string;
  controllerName: string;
  controllerContact: string;
  dpoContact: string;
  processingPurposes: string;
  lawfulBasis: string;
  privacyNoticeText: string;
  acknowledgementText: string;
  noticeVersion: string;
  retentionPolicy: string;
  retentionDays: number | null;
  rightsProcess: string;
  processors: string;
  safeguards: string;
  alternativeVerification: string;
  acceptedIdTypes: string[];
  purposeDepartmentRoutes: Record<string, string>;
  registrationEnabled: boolean;
  privacyReviewApproved: boolean;
  securityReviewApproved: boolean;
  operationsReviewApproved: boolean;
};

export type VisitorKioskReadiness = {
  ready: boolean;
  configurationComplete: boolean;
  registrationEnabled: boolean;
  missing: string[];
};

const REQUIRED_TEXT_FIELDS: Array<[keyof VisitorKioskPolicy, string]> = [
  ["organizationName", "organizationName"],
  ["controllerName", "controllerName"],
  ["controllerContact", "controllerContact"],
  ["dpoContact", "dpoContact"],
  ["processingPurposes", "processingPurposes"],
  ["lawfulBasis", "lawfulBasis"],
  ["privacyNoticeText", "privacyNoticeText"],
  ["acknowledgementText", "acknowledgementText"],
  ["noticeVersion", "noticeVersion"],
  ["retentionPolicy", "retentionPolicy"],
  ["rightsProcess", "rightsProcess"],
  ["processors", "processors"],
  ["safeguards", "safeguards"],
  ["alternativeVerification", "alternativeVerification"],
];

const UNRESOLVED_POLICY_PATTERNS = [
  /\[(?![^\]]+\]\s*\()[A-Z][A-Z0-9 _./-]{1,80}\]/g,
  /\b(?:subject to organizational approval|to be (?:provided|confirmed|determined|approved)|tbd|todo)\b/gi,
  /\b(?:insert|enter|provide)\s+(?:the\s+)?[^\n.]{1,80}\s+here\b/gi,
] as const;

export type VisitorPolicyPlaceholder = { field: string; token: string };

/** Finds template markers without treating normal Markdown links as placeholders. */
export function findUnresolvedVisitorPolicyPlaceholders(
  policy: VisitorKioskPolicy,
): VisitorPolicyPlaceholder[] {
  const values: Array<[string, string]> = REQUIRED_TEXT_FIELDS.map(([key, label]) => [label, String(policy[key] ?? "")]);
  policy.acceptedIdTypes.forEach((value, index) => values.push([`acceptedIdTypes[${index}]`, value]));

  return values.flatMap(([field, value]) => UNRESOLVED_POLICY_PATTERNS.flatMap((pattern) => {
    const matches = value.match(new RegExp(pattern.source, pattern.flags)) ?? [];
    return matches.map((token) => ({ field, token }));
  }));
}

export function evaluateVisitorKioskReadiness(
  policy: VisitorKioskPolicy,
  activeDepartments: readonly string[],
): VisitorKioskReadiness {
  const missing = REQUIRED_TEXT_FIELDS
    .filter(([key]) => !String(policy[key] ?? "").trim())
    .map(([, label]) => label);
  const unresolvedFields = new Set(findUnresolvedVisitorPolicyPlaceholders(policy).map(({ field }) => field.replace(/\[\d+\]$/, "")));
  unresolvedFields.forEach((field) => missing.push(`${field}:unresolvedPlaceholder`));
  if (!Number.isInteger(policy.retentionDays) || Number(policy.retentionDays) <= 0) missing.push("retentionDays");
  if (policy.acceptedIdTypes.length === 0) missing.push("acceptedIdTypes");

  const active = new Set(activeDepartments.map((department) => department.trim()).filter(Boolean));
  const routesComplete = VISITOR_KIOSK_FIXED_DEPARTMENT_PURPOSES.every((purpose) => {
    const department = policy.purposeDepartmentRoutes[purpose]?.trim();
    return Boolean(department && active.has(department));
  });
  if (!routesComplete) missing.push("purposeDepartmentRoutes");
  if (!policy.privacyReviewApproved) missing.push("privacyReviewApproval");
  if (!policy.securityReviewApproved) missing.push("securityReviewApproval");
  if (!policy.operationsReviewApproved) missing.push("operationsReviewApproval");

  const configurationComplete = missing.length === 0;
  return {
    ready: configurationComplete && policy.registrationEnabled,
    configurationComplete,
    registrationEnabled: policy.registrationEnabled,
    missing: policy.registrationEnabled ? missing : [...missing, "registrationEnabled"],
  };
}

export function parsePurposeDepartmentRoutes(raw: unknown): Record<string, string> {
  if (!raw) return {};
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return {}; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set<string>(VISITOR_KIOSK_FIXED_DEPARTMENT_PURPOSES);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, department]) => [key.trim().toUpperCase(), String(department ?? "").trim()])
    .filter(([key, department]) => allowed.has(key) && Boolean(department)));
}

export function splitVisitorKioskList(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("|") : [];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

/** Public projection: deliberately excludes approval actors/timestamps, revisions, and audit reasons. */
export function publicVisitorKioskPrivacy(policy: VisitorKioskPolicy, readiness: VisitorKioskReadiness) {
  const publishPolicy = readiness.configurationComplete;
  return {
    organizationName: publishPolicy ? policy.organizationName : "",
    controllerName: publishPolicy ? policy.controllerName : "",
    controllerContact: publishPolicy ? policy.controllerContact : "",
    dpoContact: publishPolicy ? policy.dpoContact : "",
    processingPurposes: publishPolicy ? policy.processingPurposes : "",
    lawfulBasis: publishPolicy ? policy.lawfulBasis : "",
    privacyNoticeText: publishPolicy ? policy.privacyNoticeText : "",
    acknowledgementText: publishPolicy ? policy.acknowledgementText : "",
    retentionPolicy: publishPolicy ? policy.retentionPolicy : "",
    retentionDays: publishPolicy ? policy.retentionDays : null,
    rightsProcess: publishPolicy ? policy.rightsProcess : "",
    processors: publishPolicy ? policy.processors : "",
    safeguards: publishPolicy ? policy.safeguards : "",
    alternativeVerification: publishPolicy ? policy.alternativeVerification : "",
    noticeVersion: publishPolicy ? policy.noticeVersion : "",
    acceptedIdTypes: publishPolicy ? policy.acceptedIdTypes : [],
    ready: readiness.ready,
    configurationComplete: readiness.configurationComplete,
    registrationEnabled: readiness.registrationEnabled,
    missing: readiness.missing,
    ocr: { status: "NOT_CONFIGURED" as const, message: "OCR is not configured. Visitors confirm their entered details and authorized staff review the ID image." },
    identityVerification: {
      status: "NOT_CONFIGURED" as const,
      livenessSupported: false,
      message: "A biometric identity-verification provider is not configured. No face-match or liveness result will be fabricated; authorized staff must use the approved alternative procedure.",
    },
  };
}
