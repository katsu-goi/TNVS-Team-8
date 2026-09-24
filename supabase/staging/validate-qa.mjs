import {
  PRODUCTION_PROJECT_REF,
  QA_ACCOUNTS,
  QA_PREFIX,
  assertStagingEnvironment,
  equalSets,
  stagingClient,
  unwrap,
} from "./lib.mjs";

const STAGING_PROJECT_REF = "jyuhyciumeputgznwkoz";
const IDS = {
  reservationA: "09240000-0000-4000-8000-000000000021",
  reservationB: "09240000-0000-4000-8000-000000000022",
  document: "09240000-0000-4000-8000-000000000041",
  notificationKnown: "09240000-0000-4000-8000-000000000101",
  notificationDocument: "09240000-0000-4000-8000-000000000102",
  notificationMissing: "09240000-0000-4000-8000-000000000103",
  notificationUnknown: "09240000-0000-4000-8000-000000000104",
  notificationAbsent: "09240000-0000-4000-8000-999999999998",
};
const DOCUMENT_PATH = `${QA_PREFIX}documents/employee-a.txt`;

const EXPECTED_EFFECTIVE = {
  "super-admin": ["SUPER_ADMIN"],
  "system-admin": ["SYSTEM_ADMIN"],
  "compliance-manager": ["COMPLIANCE_MANAGER"],
  dpo: ["DATA_PROTECTION_OFFICER"],
  "legal-counsel": ["LEGAL_COUNSEL", "LEGAL_OFFICER"],
  "records-officer": ["RECORDS_OFFICER"],
  "department-head": ["DEPARTMENT_HEAD", "COMPLIANCE_MANAGER", "EMPLOYEE"],
  "security-officer": ["SECURITY_OFFICER", "EMPLOYEE"],
  "infosec-officer": ["INFOSEC_OFFICER", "EMPLOYEE"],
  "facilities-manager": ["FACILITIES_MANAGER", "FACILITIES_OFFICER"],
  "facilities-officer": ["FACILITIES_OFFICER"],
  "compliance-officer": ["COMPLIANCE_OFFICER"],
  "legal-officer": ["LEGAL_OFFICER"],
  "contract-officer": ["CONTRACT_OFFICER"],
  "employee-a": ["EMPLOYEE"],
  "employee-b": ["EMPLOYEE"],
  "multi-role": ["COMPLIANCE_MANAGER", "DEPARTMENT_HEAD", "EMPLOYEE"],
};

const ALLOWED = [
  ["super-admin", "admin", "/admin/users"],
  ["system-admin", "admin", "/admin/config"],
  ["compliance-manager", "governance", "/governance/workspace/compliance-management/dashboard"],
  ["dpo", "governance", "/governance/workspace/privacy/dashboard"],
  ["legal-counsel", "governance", "/governance/workspace/legal-counsel/dashboard"],
  ["records-officer", "governance", "/governance/workspace/records/dashboard"],
  ["department-head", "governance", "/governance/workspace/department/dashboard"],
  ["security-officer", "governance", "/governance/workspace/security-operations/dashboard"],
  ["infosec-officer", "governance", "/governance/workspace/information-security/dashboard"],
  ["facilities-manager", "facilities", "/facilities-manager/dashboard/kpi"],
  ["facilities-officer", "facilities", "/facilities-officer/dashboard/summary"],
  ["compliance-officer", "governance", "/governance/workspace/compliance/dashboard"],
  ["legal-officer", "governance", "/governance/workspace/legal-officer/dashboard"],
  ["contract-officer", "contracts", "/contracts"],
  ["employee-a", "employee", "/employee/dashboard/summary"],
];

const { url: checkedUrl, projectRef: checkedRef } = assertStagingEnvironment({ requireServiceKey: false });
if (checkedRef !== STAGING_PROJECT_REF || checkedRef === PRODUCTION_PROJECT_REF) {
  throw new Error("ABORT: QA validation target is not the approved staging project");
}
const { client, url, projectRef } = stagingClient();
if (projectRef !== STAGING_PROJECT_REF || url !== checkedUrl) throw new Error("ABORT: inconsistent staging target");

const anonKey = process.env.STAGING_SUPABASE_ANON_KEY?.trim();
if (!anonKey || anonKey.toLowerCase().includes("replace-in")) {
  throw new Error("STAGING_SUPABASE_ANON_KEY is required");
}
for (const account of QA_ACCOUNTS) {
  const password = process.env[account.passwordEnv]?.trim();
  if (!password || password.toLowerCase().includes("replace-in")) {
    throw new Error(`${account.passwordEnv} is required`);
  }
}

const sessions = new Map();
const checks = [];
const pass = (name, detail) => {
  checks.push({ name, detail });
  console.log(`PASS | ${name} | ${detail}`);
};
const expectStatus = (response, expected, label) => {
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(response.status)) {
    throw new Error(`${label}: received HTTP ${response.status}; expected ${accepted.join(" or ")}`);
  }
};
const call = async (functionName, path, { method = "GET", token, body } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(`${url}/functions/v1/${functionName}${path}`, {
        method,
        headers: {
          apikey: anonKey,
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`network request failed after 3 attempts: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
};
const parseJson = async (response, label) => {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}: response was not JSON`);
  }
};
const tokenFor = (slug) => {
  const token = sessions.get(slug)?.accessToken;
  if (!token) throw new Error(`No in-memory session for ${slug}`);
  return token;
};

async function authenticateAll() {
  const unauthenticated = await call("auth", "/auth/me");
  expectStatus(unauthenticated, 401, "missing-token /auth/me");
  const invalid = await call("auth", "/auth/me", { token: "invalid-staging-qa-token" });
  expectStatus(invalid, 401, "invalid-token /auth/me");
  const nonexistent = await call("auth", "/auth/login", {
    method: "POST",
    body: { email: "qa.absent@tnvs-staging.invalid", password: "non-secret-negative-test" },
  });
  expectStatus(nonexistent, 401, "nonexistent-account login");
  const wrong = await call("auth", "/auth/login", {
    method: "POST",
    body: { email: "qa.employee-a@tnvs-staging.invalid", password: "intentionally-wrong-negative-test" },
  });
  expectStatus(wrong, 401, "wrong-password login");
  pass("negative authentication", "missing, invalid, nonexistent, and wrong credentials denied");

  for (const account of QA_ACCOUNTS) {
    const login = await call("auth", "/auth/login", {
      method: "POST",
      body: { email: account.email, password: process.env[account.passwordEnv] },
    });
    expectStatus(login, 200, `${account.name} login`);
    const loginEnvelope = await parseJson(login, `${account.name} login`);
    const accessToken = loginEnvelope?.data?.accessToken;
    const refreshToken = loginEnvelope?.data?.refreshToken;
    if (!accessToken || !refreshToken) throw new Error(`${account.name} login omitted tokens`);
    sessions.set(account.slug, { accessToken, refreshToken });

    const me = await call("auth", "/auth/me", { token: accessToken });
    expectStatus(me, 200, `${account.name} /auth/me`);
    const profile = (await parseJson(me, `${account.name} /auth/me`))?.data;
    if (!profile || profile.email !== account.email) throw new Error(`${account.name} /auth/me identity mismatch`);
    if (!equalSets(profile.assignedRoles ?? [], account.roles)) throw new Error(`${account.name} direct roles mismatch`);
    if (!equalSets(profile.roles ?? [], EXPECTED_EFFECTIVE[account.slug])) throw new Error(`${account.name} effective roles mismatch`);
    const serialized = JSON.stringify(profile).toLowerCase();
    if (serialized.includes("accesstoken") || serialized.includes("refreshtoken") || serialized.includes("passwordhash")) {
      throw new Error(`${account.name} /auth/me exposed a credential field`);
    }
    sessions.get(account.slug).permissions = profile.permissions ?? [];
    pass(account.name, `direct=${account.roles.join("+")} effective=${EXPECTED_EFFECTIVE[account.slug].join("+")}`);
  }
}

async function testRbac() {
  for (const [slug, functionName, path] of ALLOWED) {
    const response = await call(functionName, path, { token: tokenFor(slug) });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${slug} allowed RBAC test returned HTTP ${response.status}`);
    }
  }
  pass("allowed RBAC", "15/15 canonical roles reached a representative allowed operation");

  for (const [slug] of ALLOWED) {
    const [functionName, path] = slug === "super-admin"
      ? ["facilities", "/facilities-manager/dashboard/kpi"]
      : ["admin", "/admin/users"];
    const response = await call(functionName, path, { token: tokenFor(slug) });
    expectStatus(response, 403, `${slug} forbidden RBAC test`);
  }
  pass("forbidden RBAC", "15/15 representative unrelated operations denied with 403");

  const systemPermissions = sessions.get("system-admin")?.permissions ?? [];
  if (!systemPermissions.includes("SYSTEM_ADMINISTER") || !systemPermissions.includes("SECURITY_MONITOR")) {
    throw new Error("System Admin lacks required permissions");
  }
  const config = await call("admin", "/admin/config", { token: tokenFor("system-admin") });
  expectStatus(config, 200, "System Admin SYSTEM_ADMINISTER operation");
  const metrics = await call("security", "/security/admin/metrics", { token: tokenFor("system-admin") });
  expectStatus(metrics, 200, "System Admin SECURITY_MONITOR operation");
  const unrelated = await call("facilities", "/facilities-manager/dashboard/kpi", { token: tokenFor("system-admin") });
  expectStatus(unrelated, 403, "System Admin unrelated business privilege");
  pass("System Admin", "SYSTEM_ADMINISTER and SECURITY_MONITOR allowed; unrelated facilities privilege denied");

  const compliance = await call("governance", "/governance/workspace/compliance-management/dashboard", { token: tokenFor("multi-role") });
  const department = await call("governance", "/governance/workspace/department/dashboard", { token: tokenFor("multi-role") });
  const privacy = await call("governance", "/governance/workspace/privacy/dashboard", { token: tokenFor("multi-role") });
  expectStatus(compliance, 200, "Multi-Role compliance workspace");
  expectStatus(department, 200, "Multi-Role department workspace");
  expectStatus(privacy, 403, "Multi-Role unrelated privacy workspace");
  pass("Multi-Role authorization", "both direct-role workspaces allowed independent of role order; unrelated workspace denied");
}

async function testOwnershipAndStorage() {
  const update = (slug, id) => call("employee", `/employee/reservations/${id}`, {
    method: "PUT",
    token: tokenFor(slug),
    body: { reason: "Synthetic staging ownership verification" },
  });
  expectStatus(await update("employee-a", IDS.reservationA), 200, "Employee A own reservation");
  expectStatus(await update("employee-b", IDS.reservationB), 200, "Employee B own reservation");
  expectStatus(await update("employee-a", IDS.reservationB), [403, 404], "Employee A cross-owner reservation");
  expectStatus(await update("employee-b", IDS.reservationA), [403, 404], "Employee B cross-owner reservation");
  pass("employee ownership", "both own resources allowed; both cross-owner attempts denied");

  const ownDownload = await call("documents", `/documents/${IDS.document}/download`, { token: tokenFor("employee-a") });
  expectStatus(ownDownload, 200, "authorized document download");
  const signedUrl = await call("documents", `/documents/${IDS.document}/signed-url`, { token: tokenFor("employee-a") });
  expectStatus(signedUrl, 200, "authorized document signed URL");
  const otherDownload = await call("documents", `/documents/${IDS.document}/download`, { token: tokenFor("employee-b") });
  expectStatus(otherDownload, 403, "unauthorized document download");
  const anonymous = await call("documents", `/documents/${IDS.document}/download`);
  expectStatus(anonymous, 401, "anonymous document download");
  const objectPath = DOCUMENT_PATH.split("/").map(encodeURIComponent).join("/");
  const publicObject = await fetch(`${url}/storage/v1/object/public/documents/${objectPath}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
  });
  if (publicObject.ok) throw new Error("private document was accessible through the public Storage endpoint");
  pass("document Storage authorization", "owner allowed; other user, anonymous, and public-object access denied");
}

async function testNotificationsAndRealtime() {
  const before = unwrap(
    await client.from("realtime_events").select("id").order("id", { ascending: false }).limit(1),
    "load Realtime cursor",
  );
  const beforeId = before[0]?.id ?? 0;

  const aList = await call("notifications", "/notifications", { token: tokenFor("employee-a") });
  expectStatus(aList, 200, "Employee A notification list");
  const aItems = (await parseJson(aList, "Employee A notification list"))?.data ?? [];
  const aIds = new Set(aItems.map((item) => item.id));
  for (const id of [IDS.notificationKnown, IDS.notificationDocument, IDS.notificationUnknown]) {
    if (!aIds.has(id)) throw new Error("Employee A notification routing fixture is missing");
  }
  const unknown = aItems.find((item) => item.id === IDS.notificationUnknown);
  if (unknown?.relatedEntityType !== "QA_UNKNOWN") throw new Error("unknown notification type was not returned safely");

  const bList = await call("notifications", "/notifications", { token: tokenFor("employee-b") });
  expectStatus(bList, 200, "Employee B notification list");
  const bItems = (await parseJson(bList, "Employee B notification list"))?.data ?? [];
  if (!bItems.some((item) => item.id === IDS.notificationMissing)) {
    throw new Error("missing-target notification fixture is absent");
  }
  expectStatus(await call("notifications", `/notifications/${IDS.notificationKnown}/read`, {
    method: "POST", token: tokenFor("employee-a"), body: {},
  }), 200, "mark known notification read");
  expectStatus(await call("notifications", `/notifications/${IDS.notificationUnknown}/dismiss`, {
    method: "POST", token: tokenFor("employee-a"), body: {},
  }), 200, "dismiss unknown-type notification");
  expectStatus(await call("notifications", `/notifications/${IDS.notificationAbsent}/read`, {
    method: "POST", token: tokenFor("employee-a"), body: {},
  }), 404, "missing notification mutation");
  pass("notification behavior", "known reservation, document, missing target, and unknown type handled without 500");

  const events = unwrap(
    await client.from("realtime_events").select("id,source_table,operation,created_at").gt("id", beforeId).order("id"),
    "load emitted Realtime events",
  );
  const notificationUpdates = events.filter((event) => event.source_table === "employee_notifications" && event.operation === "UPDATE");
  if (!notificationUpdates.length) throw new Error("notification mutation did not emit a sanitized Realtime event");
  if (events.some((event) => !equalSets(Object.keys(event), ["id", "source_table", "operation", "created_at"]))) {
    throw new Error("Realtime event query returned unexpected raw-data columns");
  }
  pass("sanitized Realtime", `${notificationUpdates.length} employee_notifications UPDATE event(s); metadata-only shape verified`);
}

async function testAuditSafety() {
  const qaUsers = unwrap(
    await client.from("users").select("id").in("email", QA_ACCOUNTS.map((account) => account.email)),
    "load QA user ids for audit verification",
  );
  const auditRows = unwrap(
    await client.from("audit_logs").select("user_id,user_email,user_full_name,action,entity_type,entity_id,entity_name,module,description,old_values,new_values,ip_address,user_agent,severity,status,created_at")
      .in("user_id", qaUsers.map((user) => user.id)).order("created_at", { ascending: false }).limit(500),
    "load QA audit logs",
  );
  const securityRows = unwrap(
    await client.from("security_logs").select("action,module,full_name,role,ip_address,risk_level,status,reason,created_at")
      .ilike("full_name", "QA %").order("created_at", { ascending: false }).limit(500),
    "load QA security logs",
  );
  if (auditRows.length < 17 || securityRows.length < 17) {
    throw new Error(`insufficient QA audit/security evidence: audit=${auditRows.length}, security=${securityRows.length}`);
  }
  const secrets = [
    ...QA_ACCOUNTS.map((account) => process.env[account.passwordEnv]),
    ...[...sessions.values()].flatMap((session) => [session.accessToken, session.refreshToken]),
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  ].filter((value) => typeof value === "string" && value.length > 0);
  const serialized = JSON.stringify({ auditRows, securityRows });
  if (secrets.some((secret) => serialized.includes(secret))) {
    throw new Error("credential material was found in QA audit/security logs");
  }
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(serialized)) {
    throw new Error("JWT-like material was found in QA audit/security logs");
  }
  pass("audit/security records", `${auditRows.length} audit and ${securityRows.length} security rows checked; credential leaks=0`);
}

async function logoutAll() {
  let loggedOut = 0;
  for (const account of QA_ACCOUNTS) {
    const session = sessions.get(account.slug);
    if (!session) continue;
    const response = await call("auth", "/auth/logout", {
      method: "POST",
      token: session.accessToken,
      body: { refreshToken: session.refreshToken },
    });
    expectStatus(response, 200, `${account.name} logout`);
    loggedOut += 1;
  }
  if (loggedOut !== 17) throw new Error(`only ${loggedOut}/17 QA sessions logged out`);
  pass("logout", "17/17 sessions closed; credentials were never printed or persisted");
  sessions.clear();
}

try {
  await authenticateAll();
  await testRbac();
  await testOwnershipAndStorage();
  await testNotificationsAndRealtime();
  await testAuditSafety();
  await logoutAll();
  console.log(`QA_VALIDATION_PASS checks=${checks.length} target=${projectRef} production_mutations=0`);
} catch (error) {
  // Best-effort session closure without logging response bodies or credential data.
  for (const session of sessions.values()) {
    try {
      await call("auth", "/auth/logout", {
        method: "POST",
        token: session.accessToken,
        body: { refreshToken: session.refreshToken },
      });
    } catch {
      // Preserve the original validation error.
    }
  }
  throw error;
}
