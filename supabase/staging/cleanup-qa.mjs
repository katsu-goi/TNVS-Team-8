import { QA_ACCOUNTS, QA_PREFIX, stagingClient, unwrap } from "./lib.mjs";

const execute = process.argv.includes("--execute");
const { client } = stagingClient();
const allowedEmails = new Set(QA_ACCOUNTS.map((account) => account.email));
const users = unwrap(
  await client.from("users").select("id,email,employee_id").in("email", QA_ACCOUNTS.map((account) => account.email)),
  "locate QA users",
);
const userIds = users.map((user) => user.id);
const userIdSet = new Set(userIds);

if (users.length !== QA_ACCOUNTS.length || new Set(userIds).size !== QA_ACCOUNTS.length) {
  throw new Error(`Cleanup allow-list mismatch: found ${users.length}/${QA_ACCOUNTS.length} exact QA identities`);
}
if (users.some((user) => !allowedEmails.has(user.email) || !String(user.employee_id ?? "").startsWith(QA_PREFIX))) {
  throw new Error("Cleanup refused: a selected identity is outside the exact QA email/employee-id allow-list");
}

const userScoped = [
  ["employee_notifications", "recipient_id", "id,recipient_id"],
  ["employee_requests", "requester_id", "id,requester_id"],
  ["user_roles", "user_id", "user_id,role_id"],
  ["refresh_tokens", "user_id", "id,user_id"],
];
const prefixed = [
  ["compliance_incidents", "incident_reference"],
  ["employee_notifications", "title"],
  ["employee_requests", "title"],
  ["visitors", "qr_code_token"],
  ["reservations", "title"],
  ["contracts", "contract_number"],
  ["documents", "title"],
  ["legal_cases", "case_number"],
  ["rooms", "room_number"],
  ["facilities", "code"],
  ["retention_policies", "name"],
];

const selectedByTable = new Map();
const addSelection = (table, rows, keyOf) => {
  const keys = selectedByTable.get(table) ?? new Set();
  for (const row of rows) keys.add(keyOf(row));
  selectedByTable.set(table, keys);
};

for (const [table, column, select] of userScoped) {
  const rows = userIds.length
    ? unwrap(await client.from(table).select(select).in(column, userIds), `dry-run ${table} by QA user id`)
    : [];
  if (rows.some((row) => !userIdSet.has(row[column]))) {
    throw new Error(`Cleanup refused: ${table} selected a row outside the QA user-id allow-list`);
  }
  addSelection(table, rows, (row) => row.id ?? `${row.user_id}:${row.role_id}`);
}

for (const [table, column] of prefixed) {
  const rows = unwrap(
    await client.from(table).select(`id,${column}`).like(column, `${QA_PREFIX}%`),
    `dry-run ${table} by QA prefix`,
  );
  if (rows.some((row) => !String(row[column] ?? "").startsWith(QA_PREFIX))) {
    throw new Error(`Cleanup refused: ${table} selected a row outside the immutable QA prefix`);
  }
  addSelection(table, rows, (row) => row.id);
}

const storageFolder = `${QA_PREFIX}documents`;
const storageObjects = unwrap(
  await client.storage.from("documents").list(storageFolder, { limit: 1000 }),
  "dry-run QA Storage objects",
);
const storagePaths = storageObjects.map((object) => `${storageFolder}/${object.name}`);
if (storagePaths.some((path) => !path.startsWith(`${QA_PREFIX}documents/`))) {
  throw new Error("Cleanup refused: Storage selection escaped the QA prefix");
}

console.log(`${execute ? "EXECUTE" : "DRY RUN"}: ${users.length} exact QA users match the cleanup allow-list.`);
console.log(`Record prefix allow-list: ${QA_PREFIX}`);
for (const [table, keys] of [...selectedByTable.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`Selected ${table}: ${keys.size}`);
}
console.log(`Selected documents Storage objects: ${storagePaths.length}`);
console.log("Selected outside exact QA email/user-id/prefix allow-lists: 0");
console.log("Selected roles: 0; permissions: 0; hierarchy/configuration records: 0");
if (!execute) {
  console.log("No records were changed. Re-run with --execute after reviewing this scope.");
  process.exit(0);
}

// Dependency order is intentionally explicit. Every predicate is restricted to an
// exact QA user id or the immutable QA prefix; broad table deletes are impossible.
for (const [table, column] of userScoped) {
  if (!userIds.length) continue;
  const result = await client.from(table).delete().in(column, userIds);
  if (result.error) console.warn(`Skipped ${table}: ${result.error.message}`);
}

for (const [table, column] of prefixed) {
  const result = await client.from(table).delete().like(column, `${QA_PREFIX}%`);
  if (result.error) console.warn(`Skipped ${table}: ${result.error.message}`);
}

if (storagePaths.length) unwrap(await client.storage.from("documents").remove(storagePaths), "delete exact QA Storage objects");
if (userIds.length) unwrap(await client.from("users").delete().in("id", userIds), "delete exact QA users");
console.log("Scoped QA cleanup completed. Re-run safely to confirm idempotence.");
