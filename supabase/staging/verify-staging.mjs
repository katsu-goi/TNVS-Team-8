import {
  CANONICAL_ROLES,
  FORBIDDEN_ROLES,
  EXPECTED_ROLE_HIERARCHY,
  QA_ACCOUNTS,
  equalSets,
  stagingClient,
  unwrap,
} from "./lib.mjs";

const { client, projectRef } = stagingClient();
const checks = [];
const record = (name, pass, detail) => checks.push({ name, pass, detail });
const EXPECTED_DIRECT_PERMISSION_MAPPINGS = [
  ["COMPLIANCE_MANAGER", "COMPLIANCE_OVERSIGHT"],
  ["DATA_PROTECTION_OFFICER", "PRIVACY_OVERSIGHT"],
  ["DEPARTMENT_HEAD", "DEPARTMENT_APPROVE"],
  ["INFOSEC_OFFICER", "INFOSEC_MANAGE"],
  ["INFOSEC_OFFICER", "SECURITY_MONITOR"],
  ["LEGAL_COUNSEL", "LEGAL_COUNSEL_OPERATIONS"],
  ["RECORDS_OFFICER", "RECORDS_MANAGE"],
  ["SECURITY_OFFICER", "SECURITY_MONITOR"],
  ["SUPER_ADMIN", "RBAC_ADMINISTER"],
  ["SUPER_ADMIN", "SECURITY_MONITOR"],
  ["SUPER_ADMIN", "SYSTEM_ADMINISTER"],
  ["SUPER_ADMIN", "USER_OVERSIGHT"],
  ["SYSTEM_ADMIN", "SECURITY_MONITOR"],
  ["SYSTEM_ADMIN", "SYSTEM_ADMINISTER"],
].map((mapping) => mapping.join("->"));
const EXPECTED_NO_DIRECT_PERMISSION_ROLES = [
  "COMPLIANCE_OFFICER",
  "CONTRACT_OFFICER",
  "EMPLOYEE",
  "FACILITIES_MANAGER",
  "FACILITIES_OFFICER",
  "LEGAL_OFFICER",
];

const roles = unwrap(await client.from("roles").select("id,name,is_deleted"), "roles");
const activeRoles = roles.filter((role) => !role.is_deleted);
record("canonical role catalog", equalSets(activeRoles.map((role) => role.name), CANONICAL_ROLES), `${activeRoles.length}/15 active`);
record("forbidden roles inactive", !activeRoles.some((role) => FORBIDDEN_ROLES.includes(role.name)), "legacy roles must be absent or deleted");

const roleIds = new Map(activeRoles.map((role) => [role.id, role.name]));
const hierarchy = unwrap(await client.from("role_hierarchy").select("senior_role_id,junior_role_id"), "role hierarchy");
const actualHierarchy = hierarchy
  .map((edge) => [roleIds.get(edge.senior_role_id), roleIds.get(edge.junior_role_id)])
  .filter((edge) => edge[0] && edge[1])
  .map((edge) => edge.join("->"));
const expectedHierarchy = EXPECTED_ROLE_HIERARCHY.map((edge) => edge.join("->"));
record("role hierarchy", equalSets(actualHierarchy, expectedHierarchy), `${actualHierarchy.length}/${expectedHierarchy.length} intended direct edges`);

const permissionCatalog = unwrap(await client.from("permissions").select("id,name,is_deleted"), "permission catalog")
  .filter((permission) => !permission.is_deleted);
const permissionIds = new Map(permissionCatalog.map((permission) => [permission.id, permission.name]));
const permissions = unwrap(await client.from("role_permissions").select("role_id,permission_id"), "role permissions");
const duplicateMappings = permissions.length - new Set(permissions.map((item) => `${item.role_id}:${item.permission_id}`)).size;
const invalidMappings = permissions.filter((item) => !roleIds.has(item.role_id) || !permissionIds.has(item.permission_id));
record("role permissions", permissions.length > 0 && duplicateMappings === 0 && invalidMappings.length === 0,
  `${permissions.length} mappings; ${duplicateMappings} duplicates; ${invalidMappings.length} invalid`);
const actualDirectMappings = permissions
  .map((item) => [roleIds.get(item.role_id), permissionIds.get(item.permission_id)])
  .filter((mapping) => mapping[0] && mapping[1])
  .map((mapping) => mapping.join("->"));
record("authoritative direct permission mappings", equalSets(actualDirectMappings, EXPECTED_DIRECT_PERMISSION_MAPPINGS),
  `${actualDirectMappings.length}/${EXPECTED_DIRECT_PERMISSION_MAPPINGS.length} intended mappings`);
const systemAdminPermissions = actualDirectMappings
  .filter((mapping) => mapping.startsWith("SYSTEM_ADMIN->"))
  .map((mapping) => mapping.split("->")[1]);
record("SYSTEM_ADMIN permissions", equalSets(systemAdminPermissions, ["SYSTEM_ADMINISTER", "SECURITY_MONITOR"]),
  systemAdminPermissions.join(", ") || "missing");
const rolesWithoutDirectPermissions = activeRoles
  .filter((role) => !permissions.some((item) => item.role_id === role.id))
  .map((role) => role.name);
record("expected no-direct-permission roles", equalSets(rolesWithoutDirectPermissions, EXPECTED_NO_DIRECT_PERMISSION_ROLES),
  rolesWithoutDirectPermissions.join(", ") || "none");

const posture = unwrap(await client.rpc("phase8_security_posture"), "security posture RPC");
record("RLS coverage", posture.publicTableCount > 0 && posture.publicTableCount === posture.rlsEnabledCount, `${posture.rlsEnabledCount}/${posture.publicTableCount} public tables`);
record("browser business-table grants", posture.browserBusinessTablePrivileges === 0, `${posture.browserBusinessTablePrivileges} unexpected grants`);
record("browser RPC grants", posture.browserFunctionExecutePrivileges === 0, `${posture.browserFunctionExecutePrivileges} unexpected grants`);
record("sanitized Realtime", equalSets(posture.realtimePublishedTables ?? [], ["realtime_events"]), JSON.stringify(posture.realtimePublishedTables ?? []));

const users = unwrap(await client.from("users").select("id,email,status,is_deleted,locked_until").in("email", QA_ACCOUNTS.map((account) => account.email)), "QA users");
record("QA identities", users.length === 17, `${users.length}/17 present`);
record("QA accounts enabled", users.length === 17 && users.every((user) => user.status === "ACTIVE" && !user.is_deleted && !user.locked_until), "active, unlocked, not deleted");

const userByEmail = new Map(users.map((user) => [user.email, user]));
const assignments = users.length ? unwrap(await client.from("user_roles").select("user_id,role_id").in("user_id", users.map((user) => user.id)), "QA assignments") : [];
for (const expected of QA_ACCOUNTS) {
  const user = userByEmail.get(expected.email);
  const actual = user ? assignments.filter((item) => item.user_id === user.id).map((item) => roleIds.get(item.role_id)).filter(Boolean) : [];
  record(expected.name, Boolean(user) && equalSets(actual, expected.roles), actual.join(" + ") || "missing");
}

const buckets = unwrap(await client.storage.listBuckets(), "storage buckets");
const backupBucket = buckets.find((bucket) => bucket.name === "backup-archives");
const documentsBucket = buckets.find((bucket) => bucket.name === "documents");
record("backup-archives bucket", Boolean(backupBucket) && backupBucket.public === false, backupBucket ? `present; public=${backupBucket.public}` : "missing");
record("documents bucket", Boolean(documentsBucket) && documentsBucket.public === false, documentsBucket ? `present; public=${documentsBucket.public}` : "missing");

console.log(`Staging verification for ${projectRef}`);
for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} | ${check.name} | ${check.detail}`);
if (checks.some((check) => !check.pass)) process.exitCode = 1;
