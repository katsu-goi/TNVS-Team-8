import { createHandler, AuthContext, RouteParams } from "../_shared/guard.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { ok, fail } from "../_shared/envelope.ts";
import { adminDb } from "../_shared/db.ts";
import { naiveIso } from "../_shared/auth-users.ts";

const db = adminDb();

const CONTRACT_ROLES = ["CONTRACT_OFFICER", "LEGAL_OFFICER"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Interprets a naive LocalDateTime as UTC (matches Spring's naive persistence). */
function toUtcIso(s: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).toISOString();
  const naive = s.includes("T") ? s : `${s}T00:00:00`;
  return naive + "Z";
}

function dateStr(v: string | null): string | null {
  if (!v) return null;
  return v.slice(0, 10);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function createdAtUtc(v: unknown): string | null {
  if (!v) return null;
  return toUtcIso(String(v)).replace("Z", "");
}

function str(o: unknown): string | null {
  return o === null || o === undefined ? null : String(o);
}

function isUuid(s: string | undefined): s is string {
  return s != null && UUID_RE.test(s);
}

function generic500() {
  return jsonResponse(
    fail("An unexpected error occurred. Please contact system administrator.", "INTERNAL_SERVER_ERROR"),
    500,
  );
}

type Row = Record<string, unknown> & { id: string };

function toContractDto(c: Row) {
  return {
    id: c.id,
    contractNumber: c.contract_number ?? null,
    title: c.title ?? null,
    type: c.type ?? null,
    counterParty: c.counter_party ?? null,
    contractValue: num(c.contract_value),
    vendorId: c.vendor_id ?? null,
    startDate: dateStr(str(c.start_date)),
    endDate: dateStr(str(c.end_date)),
    renewalNoticeDate: dateStr(str(c.renewal_notice_date)),
    status: c.status ?? null,
    aiAssessedRiskLevel: c.ai_assessed_risk_level ?? null,
    aiRiskSummary: c.ai_risk_summary ?? null,
    associatedDocumentId: c.document_id ?? null,
    createdAt: createdAtUtc(c.created_at),
  };
}

const AI_OVERALL_RISK = "LOW";
const AI_SUMMARY = "AI Risk Assessment: Contract contains standard commercial terms with acceptable risk parameters.";

/** Mirrors ContractAnalyticsAiService.analyzeContract: deterministic sample output. */
function analyzeContract(): Record<string, unknown> {
  return {
    overallRisk: AI_OVERALL_RISK,
    summary: AI_SUMMARY,
    extractedClauses: [
      {
        clauseType: "Indemnification & Liability",
        content: "Party A shall indemnify Party B up to maximum damages of $1,000,000.",
        riskLevel: "MEDIUM",
        notes: "Standard liability cap included.",
      },
      {
        clauseType: "Termination Clause",
        content: "Either party may terminate with 30 days written notice.",
        riskLevel: "LOW",
        notes: "Standard 30-day notice window.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleListContracts(ctx: AuthContext | null) {
  const { data, error } = await db.from("contracts").select("*");
  if (error) throw new Error(`contracts query failed: ${error.message}`);
  const result = ((data as unknown as Row[]) ?? []).map(toContractDto);
  return jsonResponse(ok(result, "Contracts retrieved"), 200);
}

async function handleCreateContract(ctx: AuthContext | null, req: Request, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const status = str(b.status) ?? "ACTIVE";

  const now = naiveIso();
  const { data: saved, error } = await db.from("contracts").insert({
    contract_number: str(b.contractNumber),
    title: str(b.title),
    type: str(b.type) ?? "VENDOR_SERVICE",
    counter_party: str(b.counterParty),
    contract_value: str(b.contractValue),
    vendor_id: str(b.vendorId),
    start_date: dateStr(str(b.startDate)),
    end_date: dateStr(str(b.endDate)),
    renewal_notice_date: dateStr(str(b.renewalNoticeDate)),
    status,
    ai_assessed_risk_level: AI_OVERALL_RISK,
    ai_risk_summary: AI_SUMMARY,
    updated_at: now,
    updated_by: ctx ? ctx.email : "SYSTEM",
  }).select("*").single();
  if (error) throw new Error(`contract insert failed: ${error.message}`);

  const dto = { ...toContractDto(saved as unknown as Row), clauses: [] };
  return jsonResponse(ok(dto, "Contract created & analyzed by AI"), 200);
}

async function handleAnalyzeContract(ctx: AuthContext | null, _req: Request, _body: unknown, p: RouteParams) {
  if (!isUuid(p.id)) return generic500();
  const { data, error } = await db.from("contracts").select("id").eq("id", p.id).maybeSingle();
  if (error) throw new Error(`contract lookup failed: ${error.message}`);
  if (!data) return new Response(null, { status: 404 });
  return jsonResponse(ok(analyzeContract(), "AI Contract analysis complete"), 200);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  { method: "GET", path: "/contracts", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleListContracts },
  { method: "POST", path: "/contracts", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleCreateContract },
  { method: "GET", path: "/contracts/:id/analyze", guard: { kind: "roles", roles: CONTRACT_ROLES }, handler: handleAnalyzeContract },
] as const;

Deno.serve(createHandler(routes as never, { name: "contracts" }));