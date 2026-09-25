import {
  QA_ACCOUNTS,
  assertStagingEnvironment,
  stagingClient,
} from "./lib.mjs";

const TARGET_SLUGS = [
  "super-admin",
  "system-admin",
  "compliance-manager",
  "dpo",
  "legal-counsel",
  "records-officer",
  "department-head",
  "security-officer",
  "infosec-officer",
  "facilities-manager",
  "facilities-officer",
  "compliance-officer",
  "legal-officer",
  "contract-officer",
  "employee-a",
  "employee-b",
];

const SECURITY_SCOPED_SLUGS = ["system-admin", "security-officer", "infosec-officer"];
const DEFAULT_SELF_ONLY_SLUGS = [
  "compliance-manager",
  "dpo",
  "legal-counsel",
  "records-officer",
  "facilities-manager",
  "facilities-officer",
];

const { url } = assertStagingEnvironment({ requireServiceKey: false });
const { client } = stagingClient();
const anonKey = process.env.STAGING_SUPABASE_ANON_KEY?.trim();
if (!anonKey) throw new Error("STAGING_SUPABASE_ANON_KEY is required");

const accounts = new Map(
  QA_ACCOUNTS
    .filter((account) => TARGET_SLUGS.includes(account.slug))
    .map((account) => [account.slug, account]),
);
const sessions = new Map();
const departmentRestores = [];
let failures = 0;

async function call(functionName, path, { token, method = "GET", body } = {}) {
  return await fetch(`${url}/functions/v1/${functionName}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function result(ok, label, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label} | ${detail}`);
  if (!ok) failures += 1;
}

function expectStatus(label, response, expected) {
  result(response.status === expected, label, `HTTP ${response.status}; expected ${expected}`);
}

async function login(slug) {
  const account = accounts.get(slug);
  const password = process.env[account.passwordEnv]?.trim();
  if (!password) throw new Error(`${account.passwordEnv} is required`);
  const response = await call("auth", "/auth/login", {
    method: "POST",
    body: { email: account.email, password },
  });
  if (response.status !== 200) throw new Error(`${slug} login returned HTTP ${response.status}`);
  const envelope = await response.json();
  const session = {
    accessToken: envelope?.data?.accessToken,
    refreshToken: envelope?.data?.refreshToken,
    email: account.email,
  };
  if (!session.accessToken || !session.refreshToken) throw new Error(`${slug} login omitted tokens`);
  const meResponse = await call("auth", "/auth/me", { token: session.accessToken });
  if (meResponse.status !== 200) throw new Error(`${slug} /auth/me returned HTTP ${meResponse.status}`);
  const profile = (await meResponse.json())?.data;
  session.userId = profile?.id;
  session.assignedRoles = profile?.assignedRoles ?? [];
  sessions.set(slug, session);
}

async function moduleAuditScope(slug, functionName, path, expectedModule, expectedId, forbiddenIds) {
  const tampered = "?module=AUTH&userId=00000000-0000-4000-8000-000000000001&role=SUPER_ADMIN";
  const response = await call(functionName, `${path}${tampered}`, { token: sessions.get(slug).accessToken });
  const envelope = await response.json();
  const rows = Array.isArray(envelope?.data) ? envelope.data : [];
  const outOfScope = rows.filter(
    (row) => String(row?.module ?? "").toUpperCase() !== expectedModule,
  ).length;
  const ids = new Set(rows.map((row) => row?.id));
  const forbiddenReturned = forbiddenIds.filter((id) => ids.has(id)).length;
  result(
    response.status === 200 && ids.has(expectedId) && outOfScope === 0 && forbiddenReturned === 0,
    `${slug} module-scoped audit`,
    `HTTP ${response.status}; rows=${rows.length}; expected=${ids.has(expectedId)}; out-of-scope=${outOfScope}; forbidden=${forbiddenReturned}`,
  );
}

async function selfAuditScope(slug, tamperedUserId) {
  const session = sessions.get(slug);
  const suffix = tamperedUserId ? `?userId=${encodeURIComponent(tamperedUserId)}` : "";
  const response = await call("employee", `/employee/audit-logs${suffix}`, {
    token: session.accessToken,
  });
  const envelope = await response.json();
  const rows = Array.isArray(envelope?.data?.content) ? envelope.data.content : [];
  const outOfScope = rows.filter((row) => row?.userId !== session.userId).length;
  result(
    response.status === 200 && rows.length > 0 && outOfScope === 0,
    `${slug} self audit${tamperedUserId ? " with tampered userId" : ""}`,
    `HTTP ${response.status}; rows=${rows.length}; out-of-scope=${outOfScope}`,
  );
}

async function selfAuditTamperingScope(slug, query) {
  const session = sessions.get(slug);
  const response = await call("employee", `/employee/audit-logs?${query}`, {
    token: session.accessToken,
  });
  const envelope = await response.json();
  const rows = Array.isArray(envelope?.data?.content) ? envelope.data.content : [];
  const outOfScope = rows.filter((row) => row?.userId !== session.userId).length;
  result(
    response.status === 200 && rows.length > 0 && outOfScope === 0,
    `${slug} multi-parameter tampering`,
    `HTTP ${response.status}; rows=${rows.length}; out-of-scope=${outOfScope}`,
  );
}

async function globalAuditFilter(label, query, predicate) {
  const response = await call("security", `/security/admin/audit-logs?size=100&${query}`, {
    token: sessions.get("super-admin").accessToken,
  });
  const envelope = await response.json();
  const page = envelope?.data ?? envelope;
  const rows = Array.isArray(page?.content) ? page.content : [];
  const outOfScope = rows.filter((row) => !predicate(row)).length;
  result(
    response.status === 200 && rows.length > 0 && outOfScope === 0,
    `Super Admin global filter: ${label}`,
    `HTTP ${response.status}; rows=${rows.length}; out-of-scope=${outOfScope}`,
  );
}

async function globalAuditPagination() {
  const token = sessions.get("super-admin").accessToken;
  const firstResponse = await call("security", "/security/admin/audit-logs?page=0&size=5", { token });
  const secondResponse = await call("security", "/security/admin/audit-logs?page=1&size=5", { token });
  const firstEnvelope = await firstResponse.json();
  const secondEnvelope = await secondResponse.json();
  const firstPage = firstEnvelope?.data ?? firstEnvelope;
  const secondPage = secondEnvelope?.data ?? secondEnvelope;
  const firstRows = Array.isArray(firstPage?.content) ? firstPage.content : [];
  const secondRows = Array.isArray(secondPage?.content) ? secondPage.content : [];
  const firstIds = new Set(firstRows.map((row) => row?.id));
  const overlap = secondRows.filter((row) => firstIds.has(row?.id)).length;
  result(
    firstResponse.status === 200 && secondResponse.status === 200
      && firstRows.length === 5 && secondRows.length === 5 && overlap === 0
      && firstPage?.number === 0 && secondPage?.number === 1,
    "Super Admin global pagination",
    `page0=${firstRows.length}; page1=${secondRows.length}; overlap=${overlap}`,
  );
}

async function expectBusinessAuditDenied(slug) {
  const token = sessions.get(slug).accessToken;
  for (const [functionName, path] of [
    ["compliance", "/compliance/audit-logs"],
    ["legal", "/legal/audit-logs"],
    ["procurement", "/procurement/audit-logs"],
  ]) {
    expectStatus(`${slug} business audit ${path}`, await call(functionName, path, { token }), 403);
  }
}

async function prepareScopeFixtures() {
  const moduleRows = [
    { slug: "compliance-officer", module: "COMPLIANCE", action: "QA_AUDIT_GATE_COMPLIANCE" },
    { slug: "legal-officer", module: "LEGAL", action: "QA_AUDIT_GATE_LEGAL" },
    { slug: "contract-officer", module: "PROCUREMENT", action: "QA_AUDIT_GATE_PROCUREMENT" },
    { slug: "employee-a", module: "AUTH", action: "QA_AUDIT_GATE_GLOBAL_FILTER" },
  ].map((fixture) => ({
    user_id: sessions.get(fixture.slug).userId,
    user_email: sessions.get(fixture.slug).email,
    action: fixture.action,
    module: fixture.module,
    description: "QA audit authorization staging release gate fixture",
    severity: "INFO",
    status: "SUCCESS",
  }));
  const moduleInsert = await client.from("audit_logs").insert(moduleRows).select("id,module,action,user_id");
  if (moduleInsert.error) throw moduleInsert.error;
  result(moduleInsert.data.length === moduleRows.length, "legitimate system audit INSERT", `inserted=${moduleInsert.data.length}`);
  const byModule = new Map(moduleInsert.data.map((row) => [row.module, row]));

  const head = sessions.get("department-head");
  const headUser = await client.from("users").select("id,email,department").eq("id", head.userId).single();
  if (headUser.error) throw headUser.error;
  const otherUser = await client.from("users")
    .select("id,email,department")
    .eq("id", sessions.get("employee-b").userId)
    .single();
  if (otherUser.error) throw otherUser.error;
  if (otherUser.data.department === headUser.data.department) {
    departmentRestores.push({ id: otherUser.data.id, department: otherUser.data.department });
    const changed = await client.from("users")
      .update({ department: "QA STAGING B" })
      .eq("id", otherUser.data.id)
      .select("id,email,department")
      .single();
    if (changed.error) throw changed.error;
    otherUser.data = changed.data;
  }
  const departmentInsert = await client.from("audit_logs").insert([
    {
      user_id: headUser.data.id,
      user_email: headUser.data.email,
      action: "QA_AUDIT_GATE_DEPARTMENT_VISIBLE",
      module: "EMPLOYEE",
      description: "QA same-department authorization fixture",
      severity: "INFO",
      status: "SUCCESS",
    },
    {
      user_id: otherUser.data.id,
      user_email: otherUser.data.email,
      action: "QA_AUDIT_GATE_DEPARTMENT_HIDDEN",
      module: "EMPLOYEE",
      description: "QA other-department authorization fixture",
      severity: "INFO",
      status: "SUCCESS",
    },
  ]).select("id,user_id");
  if (departmentInsert.error) throw departmentInsert.error;

  return {
    byModule,
    globalFilterId: byModule.get("AUTH").id,
    sameDepartmentId: departmentInsert.data[0].id,
    otherDepartmentId: departmentInsert.data[1].id,
  };
}

async function departmentAuditScope(fixtures) {
  const session = sessions.get("department-head");
  const response = await call("governance", "/governance/workspace/department/activity?departmentId=OTHER&role=SUPER_ADMIN&userId=00000000-0000-4000-8000-000000000001", {
    token: session.accessToken,
  });
  const envelope = await response.json();
  const rows = Array.isArray(envelope?.data?.rows) ? envelope.data.rows : [];
  const emails = [...new Set(rows.map((row) => row.user_email).filter(Boolean))];
  const usersResult = emails.length
    ? await client.from("users").select("email,department").in("email", emails)
    : { data: [], error: null };
  if (usersResult.error) throw usersResult.error;
  const actorResult = await client.from("users").select("department").eq("id", session.userId).single();
  if (actorResult.error) throw actorResult.error;
  const departments = new Map((usersResult.data ?? []).map((user) => [user.email, user.department]));
  const crossDepartment = rows.filter(
    (row) => row.user_email && departments.get(row.user_email) !== actorResult.data?.department,
  ).length;
  const ids = new Set(rows.map((row) => row?.id));
  result(
    response.status === 200 && rows.length > 0 && crossDepartment === 0
      && ids.has(fixtures.sameDepartmentId) && !ids.has(fixtures.otherDepartmentId),
    "department-head department-scoped audit",
    `HTTP ${response.status}; rows=${rows.length}; same-visible=${ids.has(fixtures.sameDepartmentId)}; other-visible=${ids.has(fixtures.otherDepartmentId)}; cross-department-or-unknown=${crossDepartment}`,
  );
}

async function credentialPatternScan(table, fields) {
  const query = await client.from(table).select(fields).limit(1000);
  if (query.error) throw query.error;
  const credentialPattern = /Bearer\s+[A-Za-z0-9._~-]{16,}|\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}|(?:access|refresh|session|api|service[_ -]?role)[_ -]?(?:token|key)\s*[:=]\s*["']?[A-Za-z0-9._~-]{12,}/i;
  const hits = (query.data ?? []).filter((row) => credentialPattern.test(JSON.stringify(row))).length;
  result(hits === 0, `${table} credential-pattern scan`, `rows=${query.data?.length ?? 0}; hits=${hits}`);
}

async function databaseProtectionChecks(fixtureId) {
  const posture = await client.rpc("phase8_security_posture");
  if (posture.error) throw posture.error;
  const postureData = posture.data ?? {};
  result(
    postureData.publicTableCount === postureData.rlsEnabledCount
      && postureData.browserBusinessTablePrivileges === 0
      && postureData.browserFunctionExecutePrivileges === 0,
    "database RLS and browser privilege posture",
    `tables=${postureData.publicTableCount}; rls=${postureData.rlsEnabledCount}; table-grants=${postureData.browserBusinessTablePrivileges}; rpc-grants=${postureData.browserFunctionExecutePrivileges}`,
  );

  const serviceUpdate = await client.from("audit_logs")
    .update({ description: "QA mutation must be rejected" })
    .eq("id", fixtureId);
  result(Boolean(serviceUpdate.error), "service audit UPDATE blocked", `blocked=${Boolean(serviceUpdate.error)}`);

  const serviceDelete = await client.from("audit_logs").delete().eq("id", fixtureId);
  result(Boolean(serviceDelete.error), "service audit DELETE blocked", `blocked=${Boolean(serviceDelete.error)}`);

  const browserHeaders = {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
  const insertResponse = await fetch(`${url}/rest/v1/audit_logs`, {
    method: "POST",
    headers: browserHeaders,
    body: JSON.stringify({ action: "QA_BROWSER_INSERT_MUST_FAIL", module: "AUTH" }),
  });
  result(!insertResponse.ok, "browser arbitrary audit INSERT", `HTTP ${insertResponse.status}`);

  const updateResponse = await fetch(`${url}/rest/v1/audit_logs?id=eq.${fixtureId}`, {
    method: "PATCH",
    headers: browserHeaders,
    body: JSON.stringify({ description: "QA browser update must fail" }),
  });
  result(!updateResponse.ok, "browser audit UPDATE", `HTTP ${updateResponse.status}`);

  const deleteResponse = await fetch(`${url}/rest/v1/audit_logs?id=eq.${fixtureId}`, {
    method: "DELETE",
    headers: browserHeaders,
  });
  result(!deleteResponse.ok, "browser audit DELETE", `HTTP ${deleteResponse.status}`);

  const authenticatedRead = await fetch(`${url}/rest/v1/audit_logs?select=id&limit=1`, {
    headers: { apikey: anonKey, authorization: `Bearer ${sessions.get("employee-a").accessToken}` },
  });
  let authenticatedRows = -1;
  try {
    const payload = await authenticatedRead.json();
    authenticatedRows = Array.isArray(payload) ? payload.length : -1;
  } catch {
    // A non-JSON rejection is still a rejection.
  }
  result(
    !(authenticatedRead.ok && authenticatedRows > 0),
    "custom-auth browser direct audit read",
    `HTTP ${authenticatedRead.status}; rows=${authenticatedRows}`,
  );
}

async function logoutAll() {
  for (const session of sessions.values()) {
    await call("auth", "/auth/logout", {
      token: session.accessToken,
      method: "POST",
      body: { refreshToken: session.refreshToken },
    });
  }
}

async function restoreDepartmentFixtures() {
  for (const restore of departmentRestores) {
    const restored = await client.from("users")
      .update({ department: restore.department })
      .eq("id", restore.id);
    if (restored.error) console.error("department fixture restore failed");
  }
}

try {
  for (const slug of TARGET_SLUGS) await login(slug);

  const employeeA = sessions.get("employee-a");
  const employeeB = sessions.get("employee-b");
  const superAdmin = sessions.get("super-admin");
  const fixtures = await prepareScopeFixtures();
  expectStatus("anonymous security audit", await call("security", "/security/admin/logs"), 401);
  expectStatus(
    "Employee A security audit",
    await call("security", "/security/admin/logs", { token: employeeA.accessToken }),
    403,
  );
  expectStatus(
    "Employee A tampered userId",
    await call("security", `/security/admin/logs?userId=${encodeURIComponent(employeeB.userId)}`, {
      token: employeeA.accessToken,
    }),
    403,
  );
  expectStatus(
    "Employee A compliance audit",
    await call("compliance", "/compliance/audit-logs", { token: employeeA.accessToken }),
    403,
  );
  expectStatus(
    "Employee A legal audit",
    await call("legal", "/legal/audit-logs", { token: employeeA.accessToken }),
    403,
  );
  expectStatus(
    "Employee A procurement audit",
    await call("procurement", "/procurement/audit-logs", { token: employeeA.accessToken }),
    403,
  );
  expectStatus(
    "Employee A department activity",
    await call("governance", "/governance/workspace/department/activity", { token: employeeA.accessToken }),
    403,
  );
  expectStatus(
    "Employee B security audit",
    await call("security", "/security/admin/logs", { token: employeeB.accessToken }),
    403,
  );
  expectStatus(
    "Employee B global audit",
    await call("security", "/security/admin/audit-logs", { token: employeeB.accessToken }),
    403,
  );
  await expectBusinessAuditDenied("employee-b");
  expectStatus(
    "anonymous employee audit",
    await call("employee", "/employee/audit-logs"),
    401,
  );
  await selfAuditScope("employee-a");
  await selfAuditScope("employee-a", employeeB.userId);
  await selfAuditScope("employee-a", superAdmin.userId);
  await selfAuditScope("employee-b", employeeA.userId);
  await selfAuditTamperingScope(
    "employee-a",
    `actorId=${encodeURIComponent(employeeB.userId)}&departmentId=OTHER&role=SUPER_ADMIN&email=${encodeURIComponent(superAdmin.email)}`,
  );

  for (const slug of SECURITY_SCOPED_SLUGS) {
    expectStatus(
      `${slug} security logs`,
      await call("security", "/security/admin/logs?page=0&size=5", {
        token: sessions.get(slug).accessToken,
      }),
      200,
    );
    expectStatus(
      `${slug} global audit`,
      await call("security", "/security/admin/audit-logs", {
        token: sessions.get(slug).accessToken,
      }),
      403,
    );
    await selfAuditScope(slug);
    await expectBusinessAuditDenied(slug);
  }

  for (const slug of DEFAULT_SELF_ONLY_SLUGS) {
    expectStatus(
      `${slug} security logs`,
      await call("security", "/security/admin/logs", { token: sessions.get(slug).accessToken }),
      403,
    );
    expectStatus(
      `${slug} global audit`,
      await call("security", "/security/admin/audit-logs", { token: sessions.get(slug).accessToken }),
      403,
    );
    await selfAuditScope(slug);
    await expectBusinessAuditDenied(slug);
  }

  expectStatus(
    "Super Admin security logs",
    await call("security", "/security/admin/logs?page=0&size=5", { token: superAdmin.accessToken }),
    200,
  );
  expectStatus(
    "Employee A global audit",
    await call("security", "/security/admin/audit-logs", { token: employeeA.accessToken }),
    403,
  );
  const globalAudit = await call("security", "/security/admin/audit-logs?page=0&size=25", {
    token: superAdmin.accessToken,
  });
  let globalRows = [];
  try {
    const envelope = await globalAudit.json();
    const page = envelope?.data ?? envelope;
    globalRows = Array.isArray(page?.content) ? page.content : [];
  } catch {
    // The status assertion below captures a non-JSON response.
  }
  result(
    globalAudit.status === 200 && globalRows.length > 0,
    "Super Admin global audit",
    `HTTP ${globalAudit.status}; rows=${globalRows.length}`,
  );
  const unsafeGlobalRows = globalRows.filter(
    (row) => "old_values" in row || "new_values" in row || "previousValue" in row
      || "newValue" in row || "reason" in row || "details" in row,
  ).length;
  result(
    globalAudit.status !== 200 || unsafeGlobalRows === 0,
    "Super Admin global audit safe projection",
    `rows=${globalRows.length}; unsafe=${unsafeGlobalRows}`,
  );
  await globalAuditFilter(
    "employee actor",
    `userId=${encodeURIComponent(employeeA.userId)}`,
    (row) => row?.userId === employeeA.userId,
  );
  await globalAuditFilter(
    "AUTH module",
    "module=AUTH",
    (row) => String(row?.module ?? "").toUpperCase() === "AUTH",
  );
  await globalAuditFilter(
    "action",
    "action=QA_AUDIT_GATE_GLOBAL_FILTER",
    (row) => row?.action === "QA_AUDIT_GATE_GLOBAL_FILTER",
  );
  await globalAuditFilter(
    "risk",
    "riskLevel=INFO",
    (row) => String(row?.riskLevel ?? "").toUpperCase() === "INFO",
  );
  const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await globalAuditFilter(
    "start date",
    `startDate=${encodeURIComponent(startDate)}`,
    (row) => Date.parse(row?.timestamp) >= Date.parse(startDate),
  );
  const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await globalAuditFilter(
    "end date",
    `endDate=${encodeURIComponent(endDate)}`,
    (row) => Date.parse(row?.timestamp) <= Date.parse(endDate),
  );
  await globalAuditPagination();

  await moduleAuditScope(
    "compliance-officer",
    "compliance",
    "/compliance/audit-logs",
    "COMPLIANCE",
    fixtures.byModule.get("COMPLIANCE").id,
    [fixtures.byModule.get("LEGAL").id, fixtures.byModule.get("PROCUREMENT").id, fixtures.globalFilterId],
  );
  await moduleAuditScope(
    "legal-officer",
    "legal",
    "/legal/audit-logs",
    "LEGAL",
    fixtures.byModule.get("LEGAL").id,
    [fixtures.byModule.get("COMPLIANCE").id, fixtures.byModule.get("PROCUREMENT").id, fixtures.globalFilterId],
  );
  await moduleAuditScope(
    "contract-officer",
    "procurement",
    "/procurement/audit-logs",
    "PROCUREMENT",
    fixtures.byModule.get("PROCUREMENT").id,
    [fixtures.byModule.get("COMPLIANCE").id, fixtures.byModule.get("LEGAL").id, fixtures.globalFilterId],
  );
  await departmentAuditScope(fixtures);
  const departmentHead = sessions.get("department-head");
  expectStatus(
    "department-head security logs",
    await call("security", "/security/admin/logs", { token: departmentHead.accessToken }),
    403,
  );
  expectStatus(
    "department-head global audit",
    await call("security", "/security/admin/audit-logs", { token: departmentHead.accessToken }),
    403,
  );
  await expectBusinessAuditDenied("department-head");

  for (const [slug, deniedEndpoints] of [
    ["compliance-officer", [["legal", "/legal/audit-logs"], ["procurement", "/procurement/audit-logs"]]],
    ["legal-officer", [["compliance", "/compliance/audit-logs"], ["procurement", "/procurement/audit-logs"]]],
    ["contract-officer", [["compliance", "/compliance/audit-logs"], ["legal", "/legal/audit-logs"]]],
  ]) {
    const token = sessions.get(slug).accessToken;
    expectStatus(`${slug} security logs`, await call("security", "/security/admin/logs", { token }), 403);
    expectStatus(`${slug} global audit`, await call("security", "/security/admin/audit-logs", { token }), 403);
    for (const [functionName, path] of deniedEndpoints) {
      expectStatus(`${slug} cross-module ${path}`, await call(functionName, path, { token }), 403);
    }
  }
  await selfAuditScope("department-head");
  await selfAuditScope("compliance-officer");
  await selfAuditScope("legal-officer");
  await selfAuditScope("contract-officer");

  await databaseProtectionChecks(fixtures.globalFilterId);
  await credentialPatternScan("audit_logs", "description,old_values,new_values,user_agent");
  await credentialPatternScan("security_logs", "reason,previous_value,new_value");
  await credentialPatternScan("admin_audit_logs", "details,user_agent");

  const directResponse = await fetch(`${url}/rest/v1/audit_logs?select=id&limit=1`, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
  });
  let directRows = -1;
  try {
    const payload = await directResponse.json();
    directRows = Array.isArray(payload) ? payload.length : -1;
  } catch {
    // A non-JSON denial is still a denial.
  }
  result(
    !(directResponse.ok && directRows > 0),
    "anonymous direct audit_logs",
    `HTTP ${directResponse.status}; rows=${directRows}`,
  );
} finally {
  await restoreDepartmentFixtures();
  await logoutAll();
}

console.log(`AUDIT_AUTHORIZATION_RESULT failures=${failures}`);
if (failures > 0) process.exitCode = 1;
