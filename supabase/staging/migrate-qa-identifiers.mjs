import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "../functions/node_modules/bcryptjs/index.js";
import { QA_ACCOUNTS, equalSets, stagingClient, unwrap } from "./lib.mjs";

const BCRYPT_COST = 12;
const { client, projectRef } = stagingClient();
if (projectRef !== "jyuhyciumeputgznwkoz") {
  throw new Error("ABORT: account migration target is not the approved staging project");
}

for (const account of QA_ACCOUNTS) {
  const password = process.env[account.passwordEnv]?.trim();
  if (!password || Buffer.byteLength(password, "utf8") < 14) {
    throw new Error(`${account.passwordEnv} must contain a staging-only password of at least 14 UTF-8 bytes`);
  }
}
const passwords = QA_ACCOUNTS.map((account) => process.env[account.passwordEnv]);
if (new Set(passwords).size !== QA_ACCOUNTS.length) {
  throw new Error("All QA passwords must be distinct");
}

const employees = QA_ACCOUNTS.map((account) => account.employeeId);
const beforeUsers = unwrap(
  await client.from("users").select("id,employee_id,email").in("employee_id", employees).eq("is_deleted", false),
  "load current QA identities",
);
if (beforeUsers.length !== QA_ACCOUNTS.length || new Set(beforeUsers.map((user) => user.id)).size !== QA_ACCOUNTS.length) {
  throw new Error(`Expected exactly ${QA_ACCOUNTS.length} stable QA identities; found ${beforeUsers.length}`);
}
const beforeByEmployee = new Map(beforeUsers.map((user) => [user.employee_id, user]));
for (const account of QA_ACCOUNTS) {
  const user = beforeByEmployee.get(account.employeeId);
  const allowed = new Set([account.legacyEmail, account.email].map((email) => email.toLowerCase()));
  if (!user || !allowed.has(user.email.toLowerCase())) {
    throw new Error(`Stable QA identity mismatch for ${account.slug}`);
  }
}

const roleRows = unwrap(await client.from("roles").select("id,name").eq("is_deleted", false), "load roles");
const roleNameById = new Map(roleRows.map((role) => [role.id, role.name]));
const assignments = unwrap(
  await client.from("user_roles").select("user_id,role_id").in("user_id", beforeUsers.map((user) => user.id)),
  "load direct role assignments",
);
const directRoles = (userId) => assignments.filter((row) => row.user_id === userId).map((row) => roleNameById.get(row.role_id)).filter(Boolean);
for (const account of QA_ACCOUNTS) {
  const user = beforeByEmployee.get(account.employeeId);
  if (!equalSets(directRoles(user.id), account.roles)) throw new Error(`Direct role mismatch before migration for ${account.slug}`);
}

const targetRows = unwrap(
  await client.from("users").select("id,email").in("email", QA_ACCOUNTS.map((account) => account.email)),
  "check target email collisions",
);
const intendedIdByEmail = new Map(QA_ACCOUNTS.map((account) => [account.email, beforeByEmployee.get(account.employeeId).id]));
for (const row of targetRows) {
  if (intendedIdByEmail.get(row.email.toLowerCase()) !== row.id) throw new Error(`Target email collision detected for ${row.email}`);
}

await mkdir(new URL("../.temp/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../.temp/qa-account-migration-backup.json", import.meta.url),
  `${JSON.stringify({ projectRef, capturedAt: new Date().toISOString(), users: QA_ACCOUNTS.map((account) => {
    const user = beforeByEmployee.get(account.employeeId);
    return { slug: account.slug, id: user.id, employeeId: account.employeeId, email: user.email, directRoles: directRoles(user.id) };
  }) }, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);
console.log("Preflight complete: 17 stable IDs and direct-role mappings backed up; target collisions=0.");

const hashes = await Promise.all(QA_ACCOUNTS.map((account) => bcrypt.hash(process.env[account.passwordEnv], BCRYPT_COST)));
for (let index = 0; index < QA_ACCOUNTS.length; index += 1) {
  const account = QA_ACCOUNTS[index];
  const user = beforeByEmployee.get(account.employeeId);
  unwrap(
    await client.from("users").update({
      email: account.email,
      password_hash: hashes[index],
      failed_login_attempts: 0,
      locked_until: null,
      updated_by: "staging-qa-identifier-migration",
      updated_at: new Date().toISOString(),
    }).eq("id", user.id).select("id,email").single(),
    `update ${account.slug}`,
  );
}

const afterUsers = unwrap(
  await client.from("users").select("id,employee_id,email,password_hash").in("employee_id", employees).eq("is_deleted", false),
  "verify migrated QA identities",
);
const afterByEmployee = new Map(afterUsers.map((user) => [user.employee_id, user]));
for (const account of QA_ACCOUNTS) {
  const before = beforeByEmployee.get(account.employeeId);
  const after = afterByEmployee.get(account.employeeId);
  if (!after || after.id !== before.id || after.email.toLowerCase() !== account.email) throw new Error(`Identity preservation failed for ${account.slug}`);
  if (!/^\$2[aby]\$12\$/.test(after.password_hash) || !(await bcrypt.compare(process.env[account.passwordEnv], after.password_hash))) {
    throw new Error(`BCrypt verification failed for ${account.slug}`);
  }
}
const afterAssignments = unwrap(
  await client.from("user_roles").select("user_id,role_id").in("user_id", afterUsers.map((user) => user.id)),
  "verify direct role assignments",
);
for (const account of QA_ACCOUNTS) {
  const user = afterByEmployee.get(account.employeeId);
  const names = afterAssignments.filter((row) => row.user_id === user.id).map((row) => roleNameById.get(row.role_id)).filter(Boolean);
  if (!equalSets(names, account.roles)) throw new Error(`Direct role preservation failed for ${account.slug}`);
}
console.log("Migration complete: identities=17 IDs preserved=17 roles preserved=17 bcrypt-cost-12 verified=17.");
