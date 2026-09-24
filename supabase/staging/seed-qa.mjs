import { QA_ACCOUNTS, QA_PREFIX, stagingClient, unwrap } from "./lib.mjs";

const { client } = stagingClient();
const ids = {
  facilityA: "09240000-0000-4000-8000-000000000001",
  facilityB: "09240000-0000-4000-8000-000000000002",
  roomA: "09240000-0000-4000-8000-000000000011",
  roomB: "09240000-0000-4000-8000-000000000012",
  roomC: "09240000-0000-4000-8000-000000000013",
  roomMaintenance: "09240000-0000-4000-8000-000000000014",
  reservationA: "09240000-0000-4000-8000-000000000021",
  reservationB: "09240000-0000-4000-8000-000000000022",
  reservationFuture: "09240000-0000-4000-8000-000000000023",
  visitor: "09240000-0000-4000-8000-000000000031",
  document: "09240000-0000-4000-8000-000000000041",
  request: "09240000-0000-4000-8000-000000000051",
  compliance: "09240000-0000-4000-8000-000000000061",
  retention: "09240000-0000-4000-8000-000000000071",
  legal: "09240000-0000-4000-8000-000000000081",
  contract: "09240000-0000-4000-8000-000000000091",
};

const users = unwrap(
  await client.from("users").select("id,email").in("email", QA_ACCOUNTS.map((account) => account.email)),
  "load QA users",
);
if (users.length !== 17) throw new Error("Provision all 17 QA users before seeding data");
const byEmail = new Map(users.map((user) => [user.email, user.id]));
const employeeA = byEmail.get("qa.employee-a@tnvs-staging.invalid");
const employeeB = byEmail.get("qa.employee-b@tnvs-staging.invalid");
const complianceOfficer = byEmail.get(QA_ACCOUNTS.find((account) => account.slug === "compliance-officer").email);

const now = new Date();
const day = (offset, hour) => {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + offset);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
};
const dateOnly = (offset) => day(offset, 4).slice(0, 10);
const upsert = async (table, rows) => unwrap(
  await client.from(table).upsert(rows, { onConflict: "id" }),
  `seed ${table}`,
);

await upsert("facilities", [
  { id: ids.facilityA, name: `${QA_PREFIX}Manila Hub`, code: `${QA_PREFIX}FAC-01`, type: "OFFICE", city: "Manila", country: "Philippines", total_capacity: 80, active: true, timezone: "Asia/Manila", created_by: "staging-seeder", is_deleted: false },
  { id: ids.facilityB, name: `${QA_PREFIX}Pasay Hub`, code: `${QA_PREFIX}FAC-02`, type: "OFFICE", city: "Pasay", country: "Philippines", total_capacity: 40, active: true, timezone: "Asia/Manila", created_by: "staging-seeder", is_deleted: false },
]);
await upsert("rooms", [
  { id: ids.roomA, facility_id: ids.facilityA, room_number: `${QA_PREFIX}ROOM-01`, name: `${QA_PREFIX}Board Room`, capacity: 20, type: "MEETING", status: "AVAILABLE", is_available: true, active: true, open_time: "07:00", close_time: "21:00", created_by: "staging-seeder", is_deleted: false },
  { id: ids.roomB, facility_id: ids.facilityA, room_number: `${QA_PREFIX}ROOM-02`, name: `${QA_PREFIX}Training Room`, capacity: 35, type: "TRAINING", status: "AVAILABLE", is_available: true, active: true, open_time: "07:00", close_time: "21:00", created_by: "staging-seeder", is_deleted: false },
  { id: ids.roomC, facility_id: ids.facilityB, room_number: `${QA_PREFIX}ROOM-03`, name: `${QA_PREFIX}Interview Room`, capacity: 8, type: "MEETING", status: "AVAILABLE", is_available: true, active: true, open_time: "07:00", close_time: "21:00", created_by: "staging-seeder", is_deleted: false },
  { id: ids.roomMaintenance, facility_id: ids.facilityB, room_number: `${QA_PREFIX}ROOM-04`, name: `${QA_PREFIX}Maintenance Room`, capacity: 6, type: "MEETING", status: "MAINTENANCE", is_available: false, active: true, open_time: "07:00", close_time: "21:00", created_by: "staging-seeder", is_deleted: false },
]);
await upsert("reservations", [
  { id: ids.reservationA, room_id: ids.roomA, user_id: employeeA, title: `${QA_PREFIX}Employee A Today`, purpose: "QA ownership and calendar test", start_time: day(0, 8), end_time: day(0, 9), expected_attendees: 5, status: "PENDING", approval_status: "PENDING", employee_name: "QA Employee A", employee_department: "QA STAGING", employee_email: "qa.employee-a@tnvs-staging.invalid", employee_id: `${QA_PREFIX}USER-15`, created_by: "qa.employee-a@tnvs-staging.invalid", is_deleted: false },
  { id: ids.reservationB, room_id: ids.roomB, user_id: employeeB, title: `${QA_PREFIX}Employee B Today`, purpose: "QA cross-owner denial test", start_time: day(0, 10), end_time: day(0, 12), expected_attendees: 12, status: "PENDING", approval_status: "PENDING", employee_name: "QA Employee B", employee_department: "QA STAGING", employee_email: "qa.employee-b@tnvs-staging.invalid", employee_id: `${QA_PREFIX}USER-16`, created_by: "qa.employee-b@tnvs-staging.invalid", is_deleted: false },
  { id: ids.reservationFuture, room_id: ids.roomC, user_id: employeeA, title: `${QA_PREFIX}Future Booking`, purpose: "QA peak-hour and facility analytics", start_time: day(7, 9), end_time: day(7, 11), expected_attendees: 6, status: "PENDING", approval_status: "PENDING", employee_name: "QA Employee A", employee_department: "QA STAGING", employee_email: "qa.employee-a@tnvs-staging.invalid", employee_id: `${QA_PREFIX}USER-15`, created_by: "qa.employee-a@tnvs-staging.invalid", is_deleted: false },
]);
await upsert("visitors", [{ id: ids.visitor, full_name: `${QA_PREFIX}Synthetic Visitor`, email: "qa.visitor@tnvs-staging.invalid", company: `${QA_PREFIX}Synthetic Co`, purpose_of_visit: "QA visitor workflow", expected_arrival: day(1, 8), host_id: employeeA, host_employee_id: `${QA_PREFIX}USER-15`, status: "REGISTERED", qr_code_token: `${QA_PREFIX}VISITOR-01`, created_by: "qa.employee-a@tnvs-staging.invalid", is_deleted: false }]);
const documentPath = `${QA_PREFIX}documents/employee-a.txt`;
const documentBytes = new TextEncoder().encode("TNVS Team 8 synthetic staging QA document. No production content.\n");
unwrap(await client.storage.from("documents").upload(documentPath, documentBytes, {
  contentType: "text/plain",
  upsert: true,
}), "seed synthetic document object");
await upsert("documents", [{ id: ids.document, title: `${QA_PREFIX}Restricted Employee A Document`, file_name: `${QA_PREFIX}document.txt`, file_type: "text/plain", file_size: documentBytes.byteLength, classification_level: "RESTRICTED", status: "ACTIVE", file_path: documentPath, created_by: "qa.employee-a@tnvs-staging.invalid", is_deleted: false }]);
await upsert("employee_requests", [{ id: ids.request, requester_id: employeeB, type: "FACILITY_ACCESS", title: `${QA_PREFIX}Employee B Request`, description: "Synthetic cross-owner request", status: "PENDING", created_by: "qa.employee-b@tnvs-staging.invalid", is_deleted: false }]);
await upsert("compliance_incidents", [{ id: ids.compliance, incident_reference: `${QA_PREFIX}COMP-01`, hub_name: `${QA_PREFIX}Manila Hub`, violation_category: "SYNTHETIC_QA", severity: "LOW", status: "OPEN", assigned_to: complianceOfficer, statutory_deadline: day(14, 8), remediation_directives: "Synthetic QA record only" }]);
await upsert("retention_policies", [{ id: ids.retention, name: `${QA_PREFIX}RETENTION-30D`, description: "Synthetic QA retention policy", retention_period_days: 30, action_on_expiry: "REVIEW", active: true, created_by: "staging-seeder", is_deleted: false }]);
await upsert("legal_cases", [{ id: ids.legal, case_number: `${QA_PREFIX}LEGAL-01`, title: `${QA_PREFIX}Synthetic Legal Matter`, court_name: "QA Tribunal", priority: "LOW", status: "OPEN", filed_date: dateOnly(0), next_hearing_date: dateOnly(30), lead_counselor: "QA Legal Counsel", created_by: "staging-seeder", is_deleted: false }]);
await upsert("contracts", [{ id: ids.contract, contract_number: `${QA_PREFIX}CONTRACT-01`, title: `${QA_PREFIX}Synthetic Service Contract`, type: "SERVICE", counter_party: `${QA_PREFIX}Synthetic Vendor`, contract_value: 1000, status: "DRAFT", start_date: dateOnly(1), end_date: dateOnly(365), created_by: "staging-seeder", is_deleted: false }]);

// Representative routing payloads: known, unknown, and missing entity.
await upsert("employee_notifications", [
  { id: "09240000-0000-4000-8000-000000000101", recipient_id: employeeA, title: `${QA_PREFIX}Known entity`, message: "Synthetic notification for a known reservation", type: "INFO", related_entity_type: "RESERVATION", related_entity_id: ids.reservationA, created_by: "staging-seeder", is_deleted: false },
  { id: "09240000-0000-4000-8000-000000000102", recipient_id: employeeA, title: `${QA_PREFIX}Known document`, message: "Synthetic notification for a second supported entity type", type: "INFO", related_entity_type: "DOCUMENT", related_entity_id: ids.document, created_by: "staging-seeder", is_deleted: false },
  { id: "09240000-0000-4000-8000-000000000103", recipient_id: employeeB, title: `${QA_PREFIX}Missing entity`, message: "Synthetic notification for a missing record", type: "INFO", related_entity_type: "RESERVATION", related_entity_id: "09240000-0000-4000-8000-999999999999", created_by: "staging-seeder", is_deleted: false },
  { id: "09240000-0000-4000-8000-000000000104", recipient_id: employeeA, title: `${QA_PREFIX}Unknown entity`, message: "Synthetic notification with an unknown entity type", type: "INFO", related_entity_type: "QA_UNKNOWN", related_entity_id: `${QA_PREFIX}UNKNOWN-01`, created_by: "staging-seeder", is_deleted: false },
]);

console.log("Seeded a small deterministic QA dataset. AI telemetry was intentionally not fabricated.");
