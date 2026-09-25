import { createClient } from "@supabase/supabase-js";

export const PRODUCTION_PROJECT_REF = "dunijfrvfozwlykpkfhy";
export const QA_PREFIX = "QA-STAGING-20260924-";
export const QA_EMAIL_DOMAIN = "tnvs-staging.invalid";

export const TEAM8_EMAIL_BY_SLUG = {
  "super-admin": "superadmin@photonicomega.com",
  "system-admin": "systemadmin@photonicomega.com",
  "compliance-manager": "compliance.manager@photonicomega.com",
  dpo: "dpo@photonicomega.com",
  "legal-counsel": "counsel@photonicomega.com",
  "records-officer": "records@photonicomega.com",
  "department-head": "dept.head@photonicomega.com",
  "security-officer": "security@photonicomega.com",
  "infosec-officer": "infosec@photonicomega.com",
  "facilities-manager": "fm@photonicomega.com",
  "facilities-officer": "fo@photonicomega.com",
  "compliance-officer": "co@photonicomega.com",
};

export const CANONICAL_ROLES = [
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "COMPLIANCE_MANAGER",
  "DATA_PROTECTION_OFFICER",
  "LEGAL_COUNSEL",
  "RECORDS_OFFICER",
  "DEPARTMENT_HEAD",
  "SECURITY_OFFICER",
  "INFOSEC_OFFICER",
  "FACILITIES_MANAGER",
  "FACILITIES_OFFICER",
  "COMPLIANCE_OFFICER",
  "LEGAL_OFFICER",
  "CONTRACT_OFFICER",
  "EMPLOYEE",
];

export const FORBIDDEN_ROLES = [
  "ADMIN",
  "PROCUREMENT_OFFICER",
  "FINANCE_OFFICER",
  "HR_OFFICER",
  "OPERATIONS_OFFICER",
  "FLEET_MANAGER",
  "DISPATCHER",
  "DRIVER",
  "AUDITOR",
];

export const EXPECTED_ROLE_HIERARCHY = [
  ["DEPARTMENT_HEAD", "COMPLIANCE_MANAGER"],
  ["DEPARTMENT_HEAD", "EMPLOYEE"],
  ["FACILITIES_MANAGER", "FACILITIES_OFFICER"],
  ["INFOSEC_OFFICER", "EMPLOYEE"],
  ["LEGAL_COUNSEL", "LEGAL_OFFICER"],
  ["SECURITY_OFFICER", "EMPLOYEE"],
];

export const QA_ACCOUNTS = [
  ["QA Super Admin", "super-admin", "QA_PASSWORD_SUPER_ADMIN", ["SUPER_ADMIN"]],
  ["QA System Admin", "system-admin", "QA_PASSWORD_SYSTEM_ADMIN", ["SYSTEM_ADMIN"]],
  ["QA Compliance Manager", "compliance-manager", "QA_PASSWORD_COMPLIANCE_MANAGER", ["COMPLIANCE_MANAGER"]],
  ["QA DPO", "dpo", "QA_PASSWORD_DPO", ["DATA_PROTECTION_OFFICER"]],
  ["QA Legal Counsel", "legal-counsel", "QA_PASSWORD_LEGAL_COUNSEL", ["LEGAL_COUNSEL"]],
  ["QA Records Officer", "records-officer", "QA_PASSWORD_RECORDS_OFFICER", ["RECORDS_OFFICER"]],
  ["QA Department Head", "department-head", "QA_PASSWORD_DEPARTMENT_HEAD", ["DEPARTMENT_HEAD"]],
  ["QA Security Officer", "security-officer", "QA_PASSWORD_SECURITY_OFFICER", ["SECURITY_OFFICER"]],
  ["QA InfoSec Officer", "infosec-officer", "QA_PASSWORD_INFOSEC_OFFICER", ["INFOSEC_OFFICER"]],
  ["QA Facilities Manager", "facilities-manager", "QA_PASSWORD_FACILITIES_MANAGER", ["FACILITIES_MANAGER"]],
  ["QA Facilities Officer", "facilities-officer", "QA_PASSWORD_FACILITIES_OFFICER", ["FACILITIES_OFFICER"]],
  ["QA Compliance Officer", "compliance-officer", "QA_PASSWORD_COMPLIANCE_OFFICER", ["COMPLIANCE_OFFICER"]],
  ["QA Legal Officer", "legal-officer", "QA_PASSWORD_LEGAL_OFFICER", ["LEGAL_OFFICER"]],
  ["QA Contract Officer", "contract-officer", "QA_PASSWORD_CONTRACT_OFFICER", ["CONTRACT_OFFICER"]],
  ["QA Employee A", "employee-a", "QA_PASSWORD_EMPLOYEE_A", ["EMPLOYEE"]],
  ["QA Employee B", "employee-b", "QA_PASSWORD_EMPLOYEE_B", ["EMPLOYEE"]],
  ["QA Multi-Role", "multi-role", "QA_PASSWORD_MULTI_ROLE", ["COMPLIANCE_MANAGER", "DEPARTMENT_HEAD"]],
].map(([name, slug, passwordEnv, roles], index) => ({
  name,
  slug,
  passwordEnv,
  roles,
  email: TEAM8_EMAIL_BY_SLUG[slug] || `qa.${slug}@${QA_EMAIL_DOMAIN}`,
  legacyEmail: `qa.${slug}@${QA_EMAIL_DOMAIN}`,
  employeeId: `${QA_PREFIX}USER-${String(index + 1).padStart(2, "0")}`,
}));

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.toLowerCase().includes("replace-with")) {
    throw new Error(`${name} is required and must not be a placeholder`);
  }
  return value;
}

export function assertStagingEnvironment({ requireServiceKey = true } = {}) {
  const environment = required("STAGING_ENVIRONMENT").toLowerCase();
  const projectRef = required("STAGING_SUPABASE_PROJECT_REF").toLowerCase();
  const url = new URL(required("STAGING_SUPABASE_URL"));

  if (environment !== "staging") throw new Error("STAGING_ENVIRONMENT must equal staging");
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error("ABORT: production project ref is forbidden");
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Invalid Supabase project ref");
  if (url.protocol !== "https:" || url.hostname !== `${projectRef}.supabase.co`) {
    throw new Error("STAGING_SUPABASE_URL must exactly match STAGING_SUPABASE_PROJECT_REF");
  }
  if (url.href.includes(PRODUCTION_PROJECT_REF)) throw new Error("ABORT: production URL is forbidden");

  const serviceRoleKey = requireServiceKey ? required("STAGING_SUPABASE_SERVICE_ROLE_KEY") : undefined;
  console.log("Target environment: STAGING");
  console.log(`Target project: ${projectRef}`);
  return { environment, projectRef, url: url.origin, serviceRoleKey };
}

export function stagingClient() {
  const target = assertStagingEnvironment();
  return {
    ...target,
    client: createClient(target.url, target.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
  };
}

export function unwrap(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

export function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function equalSets(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}
