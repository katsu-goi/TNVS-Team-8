import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { fail, ok } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";

const db = adminDb();

const WORKSPACE_BY_ROLE: Record<string, string> = {
  COMPLIANCE_MANAGER: "compliance-management",
  DATA_PROTECTION_OFFICER: "privacy",
  LEGAL_COUNSEL: "legal-counsel",
  RECORDS_OFFICER: "records",
  DEPARTMENT_HEAD: "department",
  SECURITY_OFFICER: "security-operations",
  INFOSEC_OFFICER: "information-security",
  COMPLIANCE_OFFICER: "compliance",
  LEGAL_OFFICER: "legal-officer",
};

const WORKSPACE_ROLES = Object.keys(WORKSPACE_BY_ROLE);

function assignedRole(ctx: AuthContext | null): string | null {
  if (!ctx) return null;
  return ctx.user.assignedRoles.find((role) => WORKSPACE_BY_ROLE[role]) ?? null;
}

function validateWorkspace(ctx: AuthContext | null, workspace: string): Response | null {
  const role = assignedRole(ctx);
  if (!role || WORKSPACE_BY_ROLE[role] !== workspace) {
    return jsonResponse(fail("This workspace is not assigned to the current account.", "ACCESS_DENIED"), 403);
  }
  return null;
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function countRows(table: string, apply?: (query: any) => any): Promise<number> {
  let query: any = db.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function rows(table: string, select = "*", apply?: (query: any) => any): Promise<any[]> {
  let query: any = db.from(table).select(select);
  if (apply) query = apply(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table} lookup failed: ${error.message}`);
  return data ?? [];
}

async function usersById(userIds: Array<string | null | undefined>): Promise<Map<string, any>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const users = await rows("users", "id, first_name, last_name, email, department, position", (query) => query.in("id", ids));
  return new Map(users.map((user) => [user.id, user]));
}

function userLabel(user: any): string | null {
  if (!user) return null;
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || user.email || null;
}

async function legalWorkflows(state?: string): Promise<any[]> {
  const workflows = await rows("legal_contract_workflows", "*", (query) => {
    let next = query.order("submitted_at", { ascending: false, nullsFirst: false });
    if (state) next = next.eq("state", state);
    return next;
  });
  const contractIds = workflows.map((workflow) => workflow.contract_id);
  const contracts = contractIds.length
    ? await rows("contracts", "id, contract_number, title, type, counter_party, contract_value, status, ai_assessed_risk_level, start_date, end_date, document_id", (query) => query.in("id", contractIds))
    : [];
  const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));
  const userMap = await usersById(workflows.flatMap((workflow) => [workflow.submitted_by, workflow.reviewed_by]));
  return workflows.map((workflow) => ({
    ...workflow,
    contract: contractMap.get(workflow.contract_id) ?? null,
    submittedByName: userLabel(userMap.get(workflow.submitted_by)),
    reviewedByName: userLabel(userMap.get(workflow.reviewed_by)),
  }));
}

async function recordArchives(status?: string): Promise<any[]> {
  const archives = await rows("records_archives", "*", (query) => {
    let next = query.order("created_at", { ascending: false });
    if (status) next = next.eq("archive_status", status);
    return next;
  });
  const documentIds = archives.map((archive) => archive.document_id);
  const policyIds = archives.map((archive) => archive.retention_policy_id).filter(Boolean);
  const documents = documentIds.length
    ? await rows("documents", "id, title, file_name, file_type, status, classification_level, owner_email, owning_module, created_at", (query) => query.in("id", documentIds))
    : [];
  const policies = policyIds.length
    ? await rows("retention_policies", "id, name, retention_period_days, action_on_expiry", (query) => query.in("id", policyIds))
    : [];
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  const policyMap = new Map(policies.map((policy) => [policy.id, policy]));
  return archives.map((archive) => ({
    ...archive,
    document: documentMap.get(archive.document_id) ?? null,
    retentionPolicy: policyMap.get(archive.retention_policy_id) ?? null,
  }));
}

function maskPii(raw: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...raw };
  if (typeof masked.name === "string") masked.name = `${masked.name.slice(0, 1)}***`;
  if (typeof masked.phone === "string") {
    const phone = masked.phone;
    masked.phone = phone.length > 7 ? `${phone.slice(0, 4)}****${phone.slice(-3)}` : "****";
  }
  if (typeof masked.address === "string") masked.address = "REDACTED";
  return masked;
}

async function workspacePayload(workspace: string, section: string): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    workspace,
    section,
    generatedAt: new Date().toISOString(),
    metrics: [],
    rows: [],
    alerts: [],
  };

  if (workspace === "compliance-management") {
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Overall Compliance Score", value: 94, suffix: "%", tone: "success" },
        { label: "Critical Expiring Permits", value: await countRows("facility_permits", (query) => query.eq("status", "CRITICAL")), tone: "danger" },
        { label: "Awaiting Sign-off", value: await countRows("management_signoffs", (query) => query.eq("status", "AWAITING_MANAGER_SIGNOFF")), tone: "warning" },
        { label: "Active Incident Escalations", value: await countRows("compliance_incidents", (query) => query.neq("status", "RESOLVED")), tone: "danger" },
      ];
      payload.rows = await rows("management_signoffs", "*", (query) => query.order("submitted_at", { ascending: false }).limit(5));
      payload.alerts = await rows("compliance_incidents", "*", (query) => query.neq("status", "RESOLVED").order("created_at", { ascending: false }).limit(5));
    } else if (section === "team-supervision") {
      payload.metrics = [
        { label: "Compliance Officers", value: await countRows("users", (query) => query.eq("department", "Compliance").eq("status", "ACTIVE")), tone: "info" },
        { label: "Records Custodians", value: await countRows("users", (query) => query.eq("department", "Records Management").eq("status", "ACTIVE")), tone: "info" },
      ];
    } else if (section === "signoffs") {
      payload.rows = await rows("management_signoffs", "*", (query) => query.order("submitted_at", { ascending: false }));
    } else if (section === "incidents") {
      payload.rows = await rows("compliance_incidents", "*", (query) => query.order("created_at", { ascending: false }));
    } else if (section === "settings") {
      payload.rows = await rows("governance_settings", "*", (query) => query.eq("category", "COMPLIANCE").order("setting_key"));
    }
  }

  if (workspace === "legal-counsel") {
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Pending High-level Sign-offs", value: await countRows("legal_contract_workflows", (query) => query.eq("state", "PENDING_COUNSEL_REVIEW")), tone: "warning" },
        { label: "Open Regulatory Cases", value: await countRows("legal_cases", (query) => query.eq("case_type", "REGULATORY").not("status", "in", "(SETTLED,CLOSED)")), tone: "danger" },
        { label: "Approved Contracts", value: await countRows("legal_contract_workflows", (query) => query.eq("state", "COUNSEL_APPROVED")), tone: "success" },
        { label: "High Risk Contracts", value: await countRows("contracts", (query) => query.in("ai_assessed_risk_level", ["HIGH", "CRITICAL"])), tone: "danger" },
      ];
      payload.rows = (await legalWorkflows()).slice(0, 6);
    } else if (section === "approvals") {
      payload.rows = await legalWorkflows("PENDING_COUNSEL_REVIEW");
    } else if (section === "regulatory") {
      payload.rows = await rows("legal_cases", "*", (query) => query.eq("case_type", "REGULATORY").order("created_at", { ascending: false }));
      payload.alerts = await rows("compliance_incidents", "*", (query) => query.ilike("violation_category", "%LTFRB%").order("created_at", { ascending: false }));
    } else if (section === "sod") {
      payload.rows = await rows("role_conflicts", "id, code, description, active, first_role_id, second_role_id", (query) => query.eq("active", true).eq("is_deleted", false).order("code"));
    } else if (section === "risk") {
      payload.rows = await rows("contracts", "id, contract_number, title, counter_party, contract_value, status, ai_assessed_risk_level, ai_risk_summary", (query) => query.eq("is_deleted", false).order("contract_value", { ascending: false }));
    }
  }

  if (workspace === "legal-officer") {
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Draft Contracts", value: await countRows("legal_contract_workflows", (query) => query.eq("state", "DRAFT")), tone: "info" },
        { label: "Pending Counsel Review", value: await countRows("legal_contract_workflows", (query) => query.eq("state", "PENDING_COUNSEL_REVIEW")), tone: "warning" },
        { label: "Returned for Revision", value: await countRows("legal_contract_workflows", (query) => query.eq("state", "REJECTED_REVISION")), tone: "danger" },
        { label: "Upcoming Hearings", value: await countRows("legal_cases", (query) => query.eq("status", "PENDING_HEARING")), tone: "warning" },
      ];
      payload.rows = (await legalWorkflows()).slice(0, 6);
    } else if (section === "requests-review") {
      payload.rows = await rows("employee_requests", "*", (query) => query.order("created_at", { ascending: false }).limit(100));
    } else if (section === "contracts") {
      payload.rows = await legalWorkflows();
    } else if (section === "cases") {
      payload.rows = await rows("legal_cases", "*", (query) => query.order("created_at", { ascending: false }));
    } else if (section === "notices") {
      payload.rows = await rows("legal_notices", "*", (query) => query.order("created_at", { ascending: false }));
    } else if (section === "documents") {
      payload.rows = await rows("documents", "id, title, file_name, file_type, status, classification_level, owner_email, owning_module, created_at", (query) => query.eq("is_deleted", false).order("created_at", { ascending: false }));
    }
  }

  if (workspace === "records") {
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Archival Volume", value: await countRows("records_archives"), tone: "info" },
        { label: "Pending Digitization", value: await countRows("records_archives", (query) => query.eq("archive_status", "PENDING_VALIDATION")), tone: "warning" },
        { label: "Active File Loans", value: await countRows("records_custody_events", (query) => query.eq("event_type", "DOWNLOADED")), tone: "info" },
        { label: "Defensible Disposal Alerts", value: await countRows("records_archives", (query) => query.in("archive_status", ["EXPIRED", "DISPOSAL_AUTHORIZED"])), tone: "danger" },
      ];
      payload.rows = (await recordArchives()).slice(0, 6);
    } else if (section === "repositories") {
      payload.rows = await recordArchives();
    } else if (section === "ingestion") {
      payload.rows = await recordArchives("PENDING_VALIDATION");
    } else if (section === "custody") {
      payload.rows = await rows("records_custody_events", "*", (query) => query.order("occurred_at", { ascending: false }));
      payload.alerts = await rows("cctv_export_requests", "*", (query) => query.eq("status", "PENDING_CUSTODY_APPROVAL").order("created_at", { ascending: false }));
    } else if (section === "disposal") {
      payload.rows = await rows("records_archives", "*", (query) => query.in("archive_status", ["EXPIRED", "DISPOSAL_AUTHORIZED", "DISPOSED"]).order("retention_expires_at"));
    } else if (section === "settings") {
      payload.rows = await rows("governance_settings", "*", (query) => query.eq("category", "RECORDS").order("setting_key"));
    }
  }

  if (workspace === "privacy") {
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Privacy Risk Index", value: 94, suffix: "%", tone: "success" },
        { label: "Active Data Subject Requests", value: await countRows("data_subject_requests", (query) => query.not("status", "in", "(COMPLETED,REJECTED)")), tone: "warning" },
        { label: "CCTV Export Approvals", value: await countRows("cctv_export_requests", (query) => query.eq("status", "PENDING_PRIVACY_APPROVAL")), tone: "danger" },
        { label: "Retention Expiry Queue", value: await countRows("facility_data_logs", (query) => query.eq("status", "ACTIVE")), tone: "info" },
      ];
      payload.rows = await rows("data_subject_requests", "*", (query) => query.order("due_at").limit(5));
      payload.alerts = await rows("privacy_breach_incidents", "*", (query) => query.neq("status", "CLOSED").order("notification_due_at").limit(3));
    } else if (["governance", "retention"].includes(section)) {
      payload.rows = await rows("retention_policies", "*", (query) => query.eq("is_deleted", false).order("retention_period_days"));
    } else if (["inventory", "visitors", "biometrics", "decommissioning", "shredding"].includes(section)) {
      const logs = await rows("facility_data_logs", "*", (query) => {
        let next = query.order("created_at", { ascending: false });
        if (section === "visitors") next = next.eq("data_category", "HUB_VISITOR_LOGS");
        return next;
      });
      payload.rows = logs.map((log) => ({ ...log, raw_pii_json: maskPii(log.raw_pii_json ?? {}) }));
    } else if (section === "cctv") {
      payload.rows = await rows("cctv_export_requests", "*", (query) => query.order("created_at", { ascending: false }));
    } else if (section === "dsr") {
      payload.rows = await rows("data_subject_requests", "*", (query) => query.order("due_at"));
    } else if (section === "breaches") {
      payload.rows = await rows("privacy_breach_incidents", "*", (query) => query.order("notification_due_at"));
    } else if (section === "settings") {
      payload.rows = await rows("governance_settings", "*", (query) => query.eq("category", "PRIVACY").order("setting_key"));
    }
  }

  if (workspace === "department") {
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Pending Department Approvals", value: await countRows("department_approvals", (query) => query.eq("status", "PENDING_DEPARTMENT_HEAD")), tone: "warning" },
        { label: "Managed Departments", value: await countRows("department_scope_assignments"), tone: "info" },
        { label: "Compliance Manager Sign-offs", value: await countRows("management_signoffs", (query) => query.eq("status", "AWAITING_MANAGER_SIGNOFF")), tone: "info" },
        { label: "Critical Escalations", value: await countRows("compliance_incidents", (query) => query.eq("severity", "CRITICAL").neq("status", "RESOLVED")), tone: "danger" },
      ];
      payload.rows = await rows("department_approvals", "*", (query) => query.order("submitted_at", { ascending: false }).limit(6));
    } else if (section === "approvals") {
      payload.rows = await rows("department_approvals", "*", (query) => query.order("submitted_at", { ascending: false }));
    } else if (section === "supervision") {
      payload.rows = await rows("management_signoffs", "*", (query) => query.order("submitted_at", { ascending: false }));
    } else if (section === "activity") {
      payload.rows = await rows("audit_logs", "id, user_email, user_full_name, action, module, description, severity, status, created_at", (query) => query.order("created_at", { ascending: false }).limit(100));
    } else if (section === "reports") {
      payload.rows = await rows("department_scope_assignments", "*", (query) => query.order("department_name"));
    }
  }

  if (["security-operations", "information-security"].includes(workspace)) {
    const domain = workspace === "security-operations" ? "PHYSICAL" : "INFORMATION_SECURITY";
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Open Incidents", value: await countRows("security_role_incidents", (query) => query.eq("security_domain", domain).neq("status", "RESOLVED")), tone: "danger" },
        { label: "Critical Incidents", value: await countRows("security_role_incidents", (query) => query.eq("security_domain", domain).eq("severity", "CRITICAL").neq("status", "RESOLVED")), tone: "danger" },
        { label: "Active Security Alerts", value: await countRows("security_alerts", (query) => query.eq("status", "OPEN")), tone: "warning" },
        { label: "Resolved This View", value: await countRows("security_role_incidents", (query) => query.eq("security_domain", domain).eq("status", "RESOLVED")), tone: "success" },
      ];
      payload.rows = await rows("security_role_incidents", "*", (query) => query.eq("security_domain", domain).order("created_at", { ascending: false }).limit(8));
    } else if (["incidents", "emergency", "cyber-incidents", "vulnerabilities", "risk"].includes(section)) {
      payload.rows = await rows("security_role_incidents", "*", (query) => query.eq("security_domain", domain).order("created_at", { ascending: false }));
    } else if (["access-risk", "access-reviews"].includes(section)) {
      payload.rows = await rows("security_alerts", "*", (query) => query.order("created_at", { ascending: false }));
    } else if (["monitoring", "controls"].includes(section)) {
      payload.rows = await rows("active_sessions", "*", (query) => query.order("last_activity", { ascending: false }).limit(100));
    } else if (section === "reports") {
      payload.rows = await rows("security_logs", "*", (query) => query.order("timestamp", { ascending: false }).limit(100));
    }
  }

  if (workspace === "compliance") {
    if (section === "dashboard") {
      payload.metrics = [
        { label: "Overall Regional Compliance", value: 92, suffix: "%", tone: "success" },
        { label: "Permit Expiration Alerts", value: await countRows("facility_permits", (query) => query.in("status", ["WATCH", "CRITICAL", "EXPIRED"])), tone: "warning" },
        { label: "Vendor Contracts on Hold", value: await countRows("vendor_risk_assessments", (query) => query.eq("status", "FLAGGED_HOLD")), tone: "danger" },
        { label: "Government Action Items", value: await countRows("compliance_incidents", (query) => query.neq("status", "RESOLVED")), tone: "danger" },
      ];
      payload.rows = await rows("facility_permits", "*", (query) => query.order("expiration_date").limit(6));
      payload.alerts = await rows("compliance_incidents", "*", (query) => query.neq("status", "RESOLVED").order("statutory_deadline").limit(6));
    } else if (section === "franchise") {
      payload.rows = await rows("compliance_incidents", "*", (query) => query.ilike("violation_category", "%LTFRB%").order("created_at", { ascending: false }));
    } else if (section === "permits") {
      const { error } = await db.rpc("refresh_facility_permit_statuses");
      if (error) throw new Error(`permit status refresh failed: ${error.message}`);
      payload.rows = await rows("facility_permits", "*", (query) => query.order("expiration_date"));
    } else if (section === "contracts") {
      payload.rows = await rows("vendor_risk_assessments", "*", (query) => query.order("assessed_at", { ascending: false }));
    } else if (section === "incidents") {
      payload.rows = await rows("compliance_incidents", "*", (query) => query.order("created_at", { ascending: false }));
    }
  }

  return payload;
}

async function handleWorkspace(ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const denied = validateWorkspace(ctx, params.workspace);
  if (denied) return denied;
  return jsonResponse(ok(await workspacePayload(params.workspace, params.section)), 200);
}

async function handleSubmitLegal(ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const { data: workflow, error } = await db.from("legal_contract_workflows").select("*").eq("id", params.id).maybeSingle();
  if (error) throw new Error(`legal workflow lookup failed: ${error.message}`);
  if (!workflow) return jsonResponse(fail("Legal workflow not found.", "RESOURCE_NOT_FOUND"), 404);
  if (workflow.state === "REJECTED_REVISION") {
    const { error: draftError } = await db.from("legal_contract_workflows").update({ state: "DRAFT", updated_at: new Date().toISOString() }).eq("id", params.id);
    if (draftError) throw new Error(`legal workflow reset failed: ${draftError.message}`);
  } else if (workflow.state !== "DRAFT") {
    return jsonResponse(fail("Only draft or returned contracts can be submitted.", "BUSINESS_RULE_VIOLATION"), 422);
  }
  const { error: updateError } = await db.from("legal_contract_workflows").update({
    state: "PENDING_COUNSEL_REVIEW",
    submitted_by: ctx?.userId,
    submitted_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    counsel_comments: null,
    updated_at: new Date().toISOString(),
  }).eq("id", params.id);
  if (updateError) throw new Error(`legal workflow submission failed: ${updateError.message}`);
  return jsonResponse(ok("Contract submitted to Legal Counsel."), 200);
}

async function handleCounselAction(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const input = body as Record<string, unknown> | null;
  const action = String(input?.statusAction ?? "").toUpperCase();
  const comments = String(input?.counselComments ?? "").trim();
  if (!["COUNSEL_APPROVED", "REJECTED_REVISION"].includes(action)) {
    return jsonResponse(fail("statusAction must be COUNSEL_APPROVED or REJECTED_REVISION.", "VALIDATION_ERROR"), 400);
  }
  if (action === "REJECTED_REVISION" && comments.length < 5) {
    return jsonResponse(fail("Revision comments must contain at least 5 characters.", "VALIDATION_ERROR"), 400);
  }
  const { data: workflow, error } = await db.from("legal_contract_workflows").select("*, contract:contracts(id, document_id)").eq("id", params.id).maybeSingle();
  if (error) throw new Error(`legal workflow lookup failed: ${error.message}`);
  if (!workflow) return jsonResponse(fail("Legal workflow not found.", "RESOURCE_NOT_FOUND"), 404);
  if (workflow.state !== "PENDING_COUNSEL_REVIEW") {
    return jsonResponse(fail("Only pending counsel reviews can be decided.", "BUSINESS_RULE_VIOLATION"), 422);
  }
  const { error: updateError } = await db.from("legal_contract_workflows").update({
    state: action,
    reviewed_by: ctx?.userId,
    reviewed_at: new Date().toISOString(),
    counsel_comments: comments || null,
    updated_at: new Date().toISOString(),
  }).eq("id", params.id);
  if (updateError) throw new Error(`counsel action failed: ${updateError.message}`);

  const contract = Array.isArray(workflow.contract) ? workflow.contract[0] : workflow.contract;
  if (action === "COUNSEL_APPROVED" && contract?.document_id) {
    await db.from("records_archives").upsert({
      document_id: contract.document_id,
      archive_status: "PENDING_VALIDATION",
      metadata: { source: "LEGAL_COUNSEL_APPROVAL", legal_workflow_id: workflow.id },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "document_id", ignoreDuplicates: true });
  }
  return jsonResponse(ok(action === "COUNSEL_APPROVED" ? "Contract approved and sent to Records." : "Contract returned for revision."), 200);
}

async function handleManagerSignoff(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const input = body as Record<string, unknown> | null;
  const approve = Boolean(input?.approve);
  const comments = String(input?.comments ?? "").trim();
  if (!approve && comments.length < 5) {
    return jsonResponse(fail("Revision comments must contain at least 5 characters.", "VALIDATION_ERROR"), 400);
  }
  const { error } = await db.from("management_signoffs").update({
    status: approve ? "MANAGER_APPROVED" : "REJECTED_REVISION",
    manager_comments: comments || null,
    decided_by: ctx?.userId,
    decided_at: new Date().toISOString(),
  }).eq("id", params.id).eq("status", "AWAITING_MANAGER_SIGNOFF");
  if (error) throw new Error(`management sign-off failed: ${error.message}`);
  return jsonResponse(ok(approve ? "Management sign-off approved." : "Item returned for revision."), 200);
}

async function handleDepartmentDecision(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const input = body as Record<string, unknown> | null;
  const decision = String(input?.decision ?? "").toUpperCase();
  const comments = String(input?.comments ?? "").trim();
  if (!["APPROVED", "RETURNED", "REJECTED"].includes(decision)) {
    return jsonResponse(fail("Invalid department decision.", "VALIDATION_ERROR"), 400);
  }
  if (decision !== "APPROVED" && comments.length < 5) {
    return jsonResponse(fail("Decision comments must contain at least 5 characters.", "VALIDATION_ERROR"), 400);
  }
  const { error } = await db.from("department_approvals").update({
    status: decision,
    decision_comments: comments || null,
    decided_by: ctx?.userId,
    decided_at: new Date().toISOString(),
  }).eq("id", params.id).eq("status", "PENDING_DEPARTMENT_HEAD");
  if (error) throw new Error(`department decision failed: ${error.message}`);
  return jsonResponse(ok("Department decision recorded."), 200);
}

async function handleRevealPii(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const input = body as Record<string, unknown> | null;
  const justification = String(input?.justification ?? "").trim();
  if (justification.length < 10) {
    return jsonResponse(fail("A justification of at least 10 characters is required.", "VALIDATION_ERROR"), 400);
  }
  const { data: log, error } = await db.from("facility_data_logs").select("*").eq("id", params.id).maybeSingle();
  if (error) throw new Error(`privacy log lookup failed: ${error.message}`);
  if (!log) return jsonResponse(fail("Privacy log not found.", "RESOURCE_NOT_FOUND"), 404);
  const fields = Object.keys(log.raw_pii_json ?? {});
  const { error: auditError } = await db.from("privacy_reveal_audits").insert({
    actor_user_id: ctx?.userId,
    subject_type: "FACILITY_DATA_LOG",
    subject_id: params.id,
    fields_revealed: fields,
    justification,
    source_ip: ctx?.ip,
    occurred_at: new Date().toISOString(),
  });
  if (auditError) throw new Error(`privacy reveal audit failed: ${auditError.message}`);
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return jsonResponse(ok({ id: log.id, rawPii: log.raw_pii_json, revealedFields: fields }), 200, headers);
}

async function handleCctvDecision(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const input = body as Record<string, unknown> | null;
  const approve = Boolean(input?.approve);
  const justification = String(input?.justification ?? "").trim();
  if (justification.length < 10) {
    return jsonResponse(fail("A justification of at least 10 characters is required.", "VALIDATION_ERROR"), 400);
  }
  const { error } = await db.from("cctv_export_requests").update({
    status: approve ? "PENDING_CUSTODY_APPROVAL" : "REJECTED",
    privacy_approved_by: approve ? ctx?.userId : null,
    updated_at: new Date().toISOString(),
  }).eq("id", params.id).eq("status", "PENDING_PRIVACY_APPROVAL");
  if (error) throw new Error(`CCTV decision failed: ${error.message}`);
  return jsonResponse(ok(approve ? "CCTV export sent for Records custody approval." : "CCTV export rejected."), 200);
}

async function handleCctvCustody(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const input = body as Record<string, unknown> | null;
  const approve = Boolean(input?.approve);
  const { data: request, error: lookupError } = await db.from("cctv_export_requests").select("*").eq("id", params.id).maybeSingle();
  if (lookupError) throw new Error(`CCTV request lookup failed: ${lookupError.message}`);
  if (!request) return jsonResponse(fail("CCTV request not found.", "RESOURCE_NOT_FOUND"), 404);
  if (approve && request.privacy_approved_by === ctx?.userId) {
    return jsonResponse(fail("Privacy and custody approvals must be performed by different users.", "SOD_VIOLATION"), 422);
  }
  const { error } = await db.from("cctv_export_requests").update({
    status: approve ? "APPROVED" : "REJECTED",
    custody_approved_by: approve ? ctx?.userId : null,
    updated_at: new Date().toISOString(),
  }).eq("id", params.id).eq("status", "PENDING_CUSTODY_APPROVAL");
  if (error) throw new Error(`CCTV custody decision failed: ${error.message}`);
  return jsonResponse(ok(approve ? "CCTV export approved under dual custody." : "CCTV export rejected by Records custody."), 200);
}

async function handleVaultArchive(ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const { error } = await db.from("records_archives").update({
    archive_status: "VAULTED",
    custodian_user_id: ctx?.userId,
    vaulted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", params.id).eq("archive_status", "PENDING_VALIDATION");
  if (error) throw new Error(`archive vaulting failed: ${error.message}`);
  const { error: eventError } = await db.from("records_custody_events").insert({
    archive_id: params.id,
    actor_user_id: ctx?.userId,
    event_type: "VAULTED",
    details: { validation: "metadata_complete", source: "RECORDS_WORKSPACE" },
    source_ip: ctx?.ip,
    occurred_at: new Date().toISOString(),
  });
  if (eventError) throw new Error(`custody event write failed: ${eventError.message}`);
  return jsonResponse(ok("Record validated and vaulted."), 200);
}

async function pendingDisposalQueue(): Promise<any[]> {
  return rows(
    "retention_disposal_queue",
    "id, source_table, source_record_id, reason, flagged_at, status",
    (query) => query.eq("status", "PENDING_DELETION").order("flagged_at", { ascending: false }),
  );
}

async function handlePendingDisposalQueue() {
  return jsonResponse(ok(await pendingDisposalQueue()), 200);
}

async function handleExecuteDisposal(ctx: AuthContext | null, _req: Request, body: unknown, params: RouteParams) {
  const input = body as Record<string, unknown> | null;
  const notes = String(input?.notes ?? "").trim();
  if (notes.length > 2000) {
    return jsonResponse(fail("Notes must be 2000 characters or fewer.", "VALIDATION_ERROR"), 400);
  }

  const completedAt = new Date().toISOString();
  const { data, error } = await db
    .from("retention_disposal_queue")
    .update({
      status: "DISPOSED",
      reviewed_by: ctx?.userId,
      reviewed_at: completedAt,
      completed_at: completedAt,
      notes: notes || null,
    })
    .eq("id", params.id)
    .eq("status", "PENDING_DELETION")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`disposal execution failed: ${error.message}`);
  if (!data) {
    return jsonResponse(fail("The disposal item is no longer pending review.", "BUSINESS_RULE_VIOLATION"), 409);
  }
  return jsonResponse(ok("Disposal recorded and queue item closed."), 200);
}

async function handlePlaceDisposalOnLegalHold(ctx: AuthContext | null, _req: Request, _body: unknown, params: RouteParams) {
  const reviewedAt = new Date().toISOString();
  const { data, error } = await db
    .from("retention_disposal_queue")
    .update({
      status: "ON_HOLD",
      reviewed_by: ctx?.userId,
      reviewed_at: reviewedAt,
    })
    .eq("id", params.id)
    .eq("status", "PENDING_DELETION")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`legal hold update failed: ${error.message}`);
  if (!data) {
    return jsonResponse(fail("The disposal item is no longer pending review.", "BUSINESS_RULE_VIOLATION"), 409);
  }
  return jsonResponse(ok("Disposal item placed on legal hold."), 200);
}

async function handleRetentionRun(ctx: AuthContext | null) {
  const policies = await rows("retention_policies", "name, retention_period_days, action_on_expiry", (query) => query.eq("active", true).eq("is_deleted", false));
  let deleted = 0;
  let anonymized = 0;
  for (const policy of policies) {
    const cutoff = new Date(Date.now() - integer(policy.retention_period_days) * 86400000).toISOString();
    const expired = await rows("facility_data_logs", "*", (query) => query.eq("data_category", policy.name).eq("status", "ACTIVE").lt("created_at", cutoff));
    for (const log of expired) {
      if (policy.action_on_expiry === "ANONYMIZE") {
        const raw = log.raw_pii_json ?? {};
        const { error } = await db.from("facility_data_logs").update({
          raw_pii_json: { ...raw, name: "ANONYMOUS", phone: "09170000000", address: "ANONYMIZED" },
          status: "ANONYMIZED",
          anonymized_at: new Date().toISOString(),
        }).eq("id", log.id);
        if (error) throw new Error(`privacy anonymization failed: ${error.message}`);
        anonymized++;
      } else if (policy.action_on_expiry === "PERMANENT_DELETE") {
        const { error } = await db.from("facility_data_logs").delete().eq("id", log.id);
        if (error) throw new Error(`privacy purge failed: ${error.message}`);
        deleted++;
      }
    }
  }
  await db.from("privacy_reveal_audits").insert({
    actor_user_id: ctx?.userId,
    subject_type: "RETENTION_JOB",
    subject_id: crypto.randomUUID(),
    fields_revealed: [],
    justification: `Retention enforcement completed: ${deleted} deleted, ${anonymized} anonymized`,
    source_ip: ctx?.ip,
    occurred_at: new Date().toISOString(),
  });
  return jsonResponse(ok({ deleted, anonymized }, "Retention enforcement completed."), 200);
}

const routes = [
  { method: "GET", path: "/governance/workspace/:workspace/:section", guard: { kind: "assignedRoles", roles: WORKSPACE_ROLES }, handler: handleWorkspace },
  { method: "POST", path: "/governance/legal/contracts/:id/submit", guard: { kind: "assignedRoles", roles: ["LEGAL_OFFICER"] }, handler: handleSubmitLegal },
  { method: "POST", path: "/governance/legal/contracts/:id/counsel-action", guard: { kind: "assignedRoles", roles: ["LEGAL_COUNSEL"] }, handler: handleCounselAction },
  { method: "POST", path: "/governance/management/signoffs/:id/decision", guard: { kind: "assignedRoles", roles: ["COMPLIANCE_MANAGER"] }, handler: handleManagerSignoff },
  { method: "POST", path: "/governance/department/approvals/:id/decision", guard: { kind: "assignedRoles", roles: ["DEPARTMENT_HEAD"] }, handler: handleDepartmentDecision },
  { method: "POST", path: "/governance/privacy/logs/:id/reveal", guard: { kind: "assignedRoles", roles: ["DATA_PROTECTION_OFFICER"] }, handler: handleRevealPii },
  { method: "POST", path: "/governance/privacy/cctv/:id/decision", guard: { kind: "assignedRoles", roles: ["DATA_PROTECTION_OFFICER"] }, handler: handleCctvDecision },
  { method: "POST", path: "/governance/privacy/retention/run", guard: { kind: "assignedRoles", roles: ["DATA_PROTECTION_OFFICER"] }, handler: handleRetentionRun },
  { method: "POST", path: "/governance/records/cctv/:id/decision", guard: { kind: "assignedRoles", roles: ["RECORDS_OFFICER"] }, handler: handleCctvCustody },
  { method: "POST", path: "/governance/records/archives/:id/vault", guard: { kind: "assignedRoles", roles: ["RECORDS_OFFICER"] }, handler: handleVaultArchive },
  { method: "GET", path: "/governance/records/disposal-queue", guard: { kind: "assignedRoles", roles: ["RECORDS_OFFICER"] }, handler: handlePendingDisposalQueue },
  { method: "POST", path: "/governance/records/disposal-queue/:id/dispose", guard: { kind: "assignedRoles", roles: ["RECORDS_OFFICER"] }, handler: handleExecuteDisposal },
  { method: "POST", path: "/governance/records/disposal-queue/:id/legal-hold", guard: { kind: "assignedRoles", roles: ["RECORDS_OFFICER"] }, handler: handlePlaceDisposalOnLegalHold },
] as const;

Deno.serve(createHandler(routes as never, { name: "governance" }));
