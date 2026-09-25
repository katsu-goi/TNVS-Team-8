import bcrypt from "../functions/node_modules/bcryptjs/index.js";
import {
  CANONICAL_ROLES,
  FORBIDDEN_ROLES,
  QA_ACCOUNTS,
  equalSets,
  stagingClient,
  unwrap,
} from "./lib.mjs";

const { client } = stagingClient();

const roles = unwrap(
  await client.from("roles").select("id,name,is_deleted").eq("is_deleted", false),
  "load active roles",
);
const activeRoleNames = roles.map((role) => role.name);
if (!equalSets(activeRoleNames, CANONICAL_ROLES)) {
  throw new Error(`Active role catalog is not exactly canonical (${activeRoleNames.length} found)`);
}
const forbidden = activeRoleNames.filter((name) => FORBIDDEN_ROLES.includes(name));
if (forbidden.length) throw new Error(`Forbidden active roles found: ${forbidden.join(", ")}`);
const roleByName = new Map(roles.map((role) => [role.name, role]));

const conflicts = unwrap(
  await client.from("role_conflicts")
    .select("first_role_id,second_role_id,active,is_deleted")
    .eq("active", true)
    .eq("is_deleted", false),
  "load active role conflicts",
);
const multiRoleIds = QA_ACCOUNTS.find((account) => account.slug === "multi-role").roles
  .map((name) => roleByName.get(name).id);
if (conflicts.some((rule) => multiRoleIds.includes(rule.first_role_id) && multiRoleIds.includes(rule.second_role_id))) {
  throw new Error("Configured QA Multi-Role pair is prohibited by active SoD rules");
}

for (const account of QA_ACCOUNTS) {
  const password = process.env[account.passwordEnv]?.trim();
  if (!password || password.toLowerCase().includes("replace-in")) {
    throw new Error(`${account.passwordEnv} must be supplied securely`);
  }
  if (Buffer.byteLength(password, "utf8") < 14) {
    throw new Error(`${account.passwordEnv} must be at least 14 bytes`);
  }
}

const provisioned = [];
for (const account of QA_ACCOUNTS) {
  const [firstName, ...rest] = account.name.split(" ");
  const passwordHash = await bcrypt.hash(process.env[account.passwordEnv], 12);
  const data = unwrap(
    await client.from("users").upsert({
      employee_id: account.employeeId,
      first_name: firstName,
      last_name: rest.join(" "),
      email: account.email,
      password_hash: passwordHash,
      department: "QA STAGING",
      position: account.name,
      status: "ACTIVE",
      is_email_verified: true,
      email_verified_at: new Date().toISOString(),
      failed_login_attempts: 0,
      locked_until: null,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      created_by: "staging-provisioner",
      updated_by: "staging-provisioner",
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" }).select("id,email").single(),
    `provision ${account.name}`,
  );
  provisioned.push({ ...account, id: data.id });
}

const ids = provisioned.map((account) => account.id);
unwrap(await client.from("user_roles").delete().in("user_id", ids), "reset QA role assignments");
const assignments = provisioned.flatMap((account) => account.roles.map((roleName) => ({
  user_id: account.id,
  role_id: roleByName.get(roleName).id,
})));
unwrap(await client.from("user_roles").insert(assignments), "assign QA roles");

console.log(`Provisioned ${provisioned.length} staging-only QA identities.`);
for (const account of provisioned) console.log(`${account.name}: ${account.roles.join(" + ")}`);
