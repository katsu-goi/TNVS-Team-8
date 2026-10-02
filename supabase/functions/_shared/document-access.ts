export type DocumentAction =
  | "METADATA"
  | "VIEW"
  | "DOWNLOAD"
  | "PRINT"
  | "SHARE"
  | "EDIT_METADATA"
  | "CLASSIFY"
  | "ARCHIVE"
  | "RESTORE"
  | "REQUEST_ACCESS"
  | "APPROVE_ACCESS"
  | "MANAGE_RETENTION";

export type DocumentAccessContext = {
  email: string;
  departmentId?: string | null;
  departmentName?: string | null;
  roles: string[];
  permissions: string[];
};

export type DocumentAccessRecord = Record<string, unknown>;
export type DocumentGrantRecord = Record<string, unknown>;

const DOMAIN_ROLE_KEYWORDS: Record<string, string[]> = {
  DATA_PROTECTION_OFFICER: ["privacy", "personal data", "data protection", "biometric", "cctv"],
  LEGAL_COUNSEL: ["legal", "litigation", "case", "notice", "hold"],
  LEGAL_OFFICER: ["legal", "litigation", "case", "notice", "hold"],
  CONTRACT_OFFICER: ["contract", "procurement", "vendor", "supplier", "agreement", "purchase", "lease"],
  COMPLIANCE_MANAGER: ["compliance", "retention", "regulatory", "audit", "disposal"],
  COMPLIANCE_OFFICER: ["compliance", "retention", "regulatory", "audit", "disposal"],
  SECURITY_OFFICER: ["security", "incident", "physical access", "visitor"],
  INFOSEC_OFFICER: ["information security", "infosec", "cyber", "vulnerability", "access review"],
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function upperSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean));
}

export function normalizeDocumentClassification(value: unknown):
  "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED" {
  const classification = text(value).toUpperCase();
  if (classification === "PUBLIC" || classification === "INTERNAL" || classification === "CONFIDENTIAL"
    || classification === "RESTRICTED" || classification === "HIGHLY_RESTRICTED") return classification;
  if (classification === "SECRET") return "HIGHLY_RESTRICTED";
  return "INTERNAL";
}

function isOwner(ctx: DocumentAccessContext, document: DocumentAccessRecord): boolean {
  const email = ctx.email.toLowerCase();
  return email !== "" && [document.owner_email, document.created_by]
    .some((value) => text(value).toLowerCase() === email);
}

function sameDepartment(ctx: DocumentAccessContext, document: DocumentAccessRecord): boolean {
  const userDepartmentId = text(ctx.departmentId);
  const documentDepartmentId = text(document.department_id);
  if (userDepartmentId && documentDepartmentId) return userDepartmentId === documentDepartmentId;
  const userDepartment = text(ctx.departmentName).toLowerCase();
  const documentDepartment = text(document.department).toLowerCase();
  return userDepartment !== "" && userDepartment === documentDepartment;
}

function documentDomainText(document: DocumentAccessRecord): string {
  const humanConfirmed = ["APPROVED", "CORRECTED"]
    .includes(text(document.classification_review_status).toUpperCase());
  return [
    document.owning_module,
    document.final_classification,
    document.department,
    humanConfirmed ? document.ai_detected_document_type : null,
    humanConfirmed ? document.ai_predicted_category : null,
  ].map(text).join(" ").toLowerCase();
}

function isDomainSpecialist(ctx: DocumentAccessContext, document: DocumentAccessRecord): boolean {
  const roles = upperSet(ctx.roles);
  const domain = documentDomainText(document);
  return Object.entries(DOMAIN_ROLE_KEYWORDS).some(([role, keywords]) =>
    roles.has(role) && keywords.some((keyword) => domain.includes(keyword))
  );
}

function grantAllows(
  ctx: DocumentAccessContext,
  grants: DocumentGrantRecord[],
  action: DocumentAction,
): boolean {
  const roles = upperSet(ctx.roles);
  const accepted = action === "METADATA"
    ? new Set(["METADATA", "VIEW", "DOWNLOAD", "PRINT", "DOWNLOAD_PRINT", "SHARE", "EDIT"])
    : action === "VIEW"
      ? new Set(["VIEW", "DOWNLOAD", "PRINT", "DOWNLOAD_PRINT", "SHARE", "EDIT"])
      : action === "DOWNLOAD"
        ? new Set(["DOWNLOAD", "DOWNLOAD_PRINT", "SHARE", "EDIT"])
        : action === "PRINT"
          ? new Set(["PRINT", "DOWNLOAD_PRINT", "SHARE", "EDIT"])
          : new Set([action]);
  return grants.some((grant) => {
    if (grant.is_deleted === true) return false;
    const granteeType = text(grant.grantee_type).toUpperCase();
    const granteeKey = text(grant.grantee_key);
    const subjectMatches = (granteeType === "USER" && granteeKey.toLowerCase() === ctx.email.toLowerCase())
      || (granteeType === "ROLE" && roles.has(granteeKey.toUpperCase()));
    return subjectMatches && accepted.has(text(grant.access_level).toUpperCase());
  });
}

function hasPermission(ctx: DocumentAccessContext, permission: string): boolean {
  return upperSet(ctx.permissions).has(permission);
}

function isTechnicalAdministratorOnly(ctx: DocumentAccessContext): boolean {
  const roles = upperSet(ctx.roles);
  const businessDocumentRoles = [
    "RECORDS_OFFICER", "DEPARTMENT_HEAD", "EMPLOYEE", "COMPLIANCE_MANAGER",
    "COMPLIANCE_OFFICER", "DATA_PROTECTION_OFFICER", "LEGAL_COUNSEL",
    "LEGAL_OFFICER", "CONTRACT_OFFICER", "SECURITY_OFFICER", "INFOSEC_OFFICER",
  ];
  return (roles.has("SUPER_ADMIN") || roles.has("SYSTEM_ADMIN"))
    && !businessDocumentRoles.some((role) => roles.has(role));
}

export function canKnowDocument(
  ctx: DocumentAccessContext,
  document: DocumentAccessRecord,
  grants: DocumentGrantRecord[],
): boolean {
  if (isOwner(ctx, document) || grantAllows(ctx, grants, "METADATA")) return true;
  const classification = normalizeDocumentClassification(document.classification_level);
  if (classification === "PUBLIC") return true;
  // Technical administration is intentionally not a document-content role.
  if (isTechnicalAdministratorOnly(ctx)) return false;
  const roles = upperSet(ctx.roles);
  if (roles.has("RECORDS_OFFICER") && hasPermission(ctx, "DOCUMENT_VIEW_METADATA")) return true;
  const specialist = isDomainSpecialist(ctx, document);
  if (classification === "HIGHLY_RESTRICTED") return specialist;
  if (classification === "RESTRICTED") {
    return specialist || (roles.has("DEPARTMENT_HEAD") && sameDepartment(ctx, document)
      && hasPermission(ctx, "DOCUMENT_VIEW_METADATA"));
  }
  return specialist || (sameDepartment(ctx, document) && hasPermission(ctx, "DOCUMENT_VIEW_METADATA"));
}

export function canViewDocumentContent(
  ctx: DocumentAccessContext,
  document: DocumentAccessRecord,
  grants: DocumentGrantRecord[],
): boolean {
  if (isOwner(ctx, document) || grantAllows(ctx, grants, "VIEW")) return true;
  const classification = normalizeDocumentClassification(document.classification_level);
  if (classification === "PUBLIC") return true;
  if (isTechnicalAdministratorOnly(ctx)) return false;
  const roles = upperSet(ctx.roles);
  const inDepartment = sameDepartment(ctx, document);
  const specialist = isDomainSpecialist(ctx, document);
  if (classification === "HIGHLY_RESTRICTED") return specialist;
  if (roles.has("RECORDS_OFFICER") && hasPermission(ctx, "DOCUMENT_VIEW")) return true;
  if (roles.has("DEPARTMENT_HEAD") && inDepartment && hasPermission(ctx, "DOCUMENT_VIEW")) return true;
  if (specialist && hasPermission(ctx, "DOCUMENT_VIEW")) return true;
  return classification === "INTERNAL" && inDepartment && hasPermission(ctx, "DOCUMENT_VIEW");
}

export function canDownloadDocumentContent(
  ctx: DocumentAccessContext,
  document: DocumentAccessRecord,
  grants: DocumentGrantRecord[],
): boolean {
  if (isOwner(ctx, document) || grantAllows(ctx, grants, "DOWNLOAD")) return true;
  if (!canViewDocumentContent(ctx, document, grants) || !hasPermission(ctx, "DOCUMENT_DOWNLOAD")) return false;
  return normalizeDocumentClassification(document.classification_level) !== "HIGHLY_RESTRICTED"
    || isDomainSpecialist(ctx, document);
}

export function canPrintDocumentContent(
  ctx: DocumentAccessContext,
  document: DocumentAccessRecord,
  grants: DocumentGrantRecord[],
): boolean {
  if (grantAllows(ctx, grants, "PRINT")) return true;
  return canViewDocumentContent(ctx, document, grants) && hasPermission(ctx, "DOCUMENT_PRINT");
}

export function canManageArchive(ctx: DocumentAccessContext, restore = false): boolean {
  const roles = upperSet(ctx.roles);
  return roles.has("RECORDS_OFFICER")
    && hasPermission(ctx, restore ? "DOCUMENT_RESTORE" : "DOCUMENT_ARCHIVE");
}

export function canApproveDocumentAccess(ctx: DocumentAccessContext, document: DocumentAccessRecord): boolean {
  const roles = upperSet(ctx.roles);
  if (!hasPermission(ctx, "DOCUMENT_APPROVE_ACCESS")) return false;
  const routedRole = accessRequestApproverRole(document);
  if (routedRole === "DEPARTMENT_HEAD") {
    return (roles.has("DEPARTMENT_HEAD") && sameDepartment(ctx, document))
      || roles.has("RECORDS_OFFICER");
  }
  const allowedByRoute: Record<string, string[]> = {
    DATA_PROTECTION_OFFICER: ["DATA_PROTECTION_OFFICER"],
    LEGAL_COUNSEL: ["LEGAL_COUNSEL", "LEGAL_OFFICER"],
    INFOSEC_OFFICER: ["INFOSEC_OFFICER"],
    SECURITY_OFFICER: ["SECURITY_OFFICER"],
    CONTRACT_OFFICER: ["CONTRACT_OFFICER"],
    COMPLIANCE_MANAGER: ["COMPLIANCE_MANAGER", "COMPLIANCE_OFFICER"],
  };
  return (allowedByRoute[routedRole] ?? [routedRole]).some((role) => roles.has(role));
}

export function documentAccessFlags(
  ctx: DocumentAccessContext,
  document: DocumentAccessRecord,
  grants: DocumentGrantRecord[],
) {
  const metadata = canKnowDocument(ctx, document, grants);
  const view = metadata && canViewDocumentContent(ctx, document, grants);
  const download = view && canDownloadDocumentContent(ctx, document, grants);
  const archive = canManageArchive(ctx, false);
  const restore = canManageArchive(ctx, true);
  return {
    metadata,
    view,
    download,
    print: view && canPrintDocumentContent(ctx, document, grants),
    share: view && (grantAllows(ctx, grants, "SHARE") || (download && hasPermission(ctx, "DOCUMENT_SHARE"))),
    requestAccess: metadata && !view && hasPermission(ctx, "DOCUMENT_REQUEST_ACCESS"),
    editMetadata: view && hasPermission(ctx, "DOCUMENT_EDIT_METADATA"),
    classify: view && hasPermission(ctx, "DOCUMENT_CLASSIFY"),
    archive: archive && text(document.status).toUpperCase() === "APPROVED",
    restore: restore && text(document.status).toUpperCase() === "ARCHIVED",
    manageRetention: view && hasPermission(ctx, "DOCUMENT_MANAGE_RETENTION"),
  };
}

export function accessRequestApproverRole(document: DocumentAccessRecord): string {
  const domain = documentDomainText(document);
  if (["privacy", "personal data", "biometric", "cctv"].some((value) => domain.includes(value))) return "DATA_PROTECTION_OFFICER";
  if (["legal", "litigation", "case", "notice", "hold"].some((value) => domain.includes(value))) return "LEGAL_COUNSEL";
  if (["information security", "infosec", "cyber", "vulnerability"].some((value) => domain.includes(value))) return "INFOSEC_OFFICER";
  if (["security", "incident", "physical access"].some((value) => domain.includes(value))) return "SECURITY_OFFICER";
  if (["contract", "procurement", "vendor", "supplier", "agreement"].some((value) => domain.includes(value))) return "CONTRACT_OFFICER";
  if (["compliance", "retention", "regulatory", "audit", "disposal"].some((value) => domain.includes(value))) return "COMPLIANCE_MANAGER";
  return "DEPARTMENT_HEAD";
}
