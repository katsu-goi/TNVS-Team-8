type DatabaseClient = any;

export type AiCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type AiCircuitConfig = {
  failureThreshold: number;
  openCooldownSeconds: number;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  halfOpenProbeLockSeconds: number;
};

export const DEFAULT_AI_CIRCUIT_CONFIG: AiCircuitConfig = {
  failureThreshold: 3,
  openCooldownSeconds: 60,
  requestTimeoutMs: 20_000,
  maxRetries: 2,
  retryBaseDelayMs: 250,
  halfOpenProbeLockSeconds: 30,
};

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.trunc(number))) : fallback;
}

export function normalizeAiCircuitConfig(value: Partial<AiCircuitConfig> | Record<string, unknown> = {}): AiCircuitConfig {
  return {
    failureThreshold: boundedInteger(value.failureThreshold, 3, 1, 20),
    openCooldownSeconds: boundedInteger(value.openCooldownSeconds, 60, 5, 3600),
    requestTimeoutMs: boundedInteger(value.requestTimeoutMs, 20_000, 1_000, 120_000),
    maxRetries: boundedInteger(value.maxRetries, 2, 0, 5),
    retryBaseDelayMs: boundedInteger(value.retryBaseDelayMs, 250, 50, 5_000),
    halfOpenProbeLockSeconds: boundedInteger(value.halfOpenProbeLockSeconds, 30, 5, 900),
  };
}

export class AiProviderRequestError extends Error {
  public readonly source = "provider" as const;

  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "AiProviderRequestError";
  }
}

export class AiCircuitOpenError extends Error {
  constructor(
    public readonly code: "AI_PROVIDER_CIRCUIT_OPEN" | "AI_PROVIDER_PROBE_IN_PROGRESS" | "AI_CIRCUIT_STATE_UNAVAILABLE",
    public readonly retryAfterSeconds: number,
    public readonly circuitState: AiCircuitState,
  ) {
    super(code === "AI_PROVIDER_PROBE_IN_PROGRESS"
      ? "AI processing recovery is already being tested. Please try again shortly."
      : "AI processing is temporarily unavailable. Please try again later.");
    this.name = "AiCircuitOpenError";
  }
}

export type ProviderFailureClassification = {
  category: "TIMEOUT" | "NETWORK" | "RATE_LIMIT" | "UPSTREAM_5XX" | "TRANSIENT_HTTP" | "NON_TRANSIENT";
  code: string;
  countable: boolean;
  retryable: boolean;
  safeMessage: string;
};

export function classifyProviderFailure(error: unknown): ProviderFailureClassification {
  const value = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  const name = String(value?.name ?? "").toLowerCase();
  const code = String(value?.code ?? "").toUpperCase();
  const message = String(value?.message ?? "").toLowerCase();
  const status = Number(value?.status);
  const isProviderHttpFailure = error instanceof AiProviderRequestError;
  if (name === "aborterror" || code === "PROVIDER_TIMEOUT" || message.includes("timed out") || message.includes("aborted")) {
    return { category: "TIMEOUT", code: "PROVIDER_TIMEOUT", countable: true, retryable: true, safeMessage: "The provider request timed out." };
  }
  if (name === "typeerror" || code === "PROVIDER_NETWORK_FAILURE" || message.includes("fetch failed") || message.includes("connection refused") || message.includes("dns")) {
    return { category: "NETWORK", code: "PROVIDER_NETWORK_FAILURE", countable: true, retryable: true, safeMessage: "The provider network request failed." };
  }
  if (isProviderHttpFailure && status === 429) {
    return { category: "RATE_LIMIT", code: "PROVIDER_RATE_LIMITED", countable: true, retryable: true, safeMessage: "The provider is temporarily rate limited." };
  }
  if (isProviderHttpFailure && status >= 500 && status <= 599) {
    return { category: "UPSTREAM_5XX", code: "PROVIDER_UPSTREAM_FAILURE", countable: true, retryable: true, safeMessage: "The provider is temporarily unavailable." };
  }
  if (isProviderHttpFailure && [408, 409, 425].includes(status)) {
    return { category: "TRANSIENT_HTTP", code: `PROVIDER_HTTP_${status}`, countable: true, retryable: true, safeMessage: "The provider returned a transient response." };
  }
  return { category: "NON_TRANSIENT", code: code || (Number.isFinite(status) ? `PROVIDER_HTTP_${status}` : "PROVIDER_NON_TRANSIENT_ERROR"), countable: false, retryable: false, safeMessage: "The provider request was rejected." };
}

type CircuitPermit = {
  allowed: boolean;
  permission_code: string;
  circuit_state: AiCircuitState;
  lease_version: number;
  retry_after_seconds: number;
  transitioned: boolean;
};

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

async function writeOperationalAudit(
  db: DatabaseClient,
  action: string,
  providerId: string,
  capability: string,
  detail: string,
  severity: "INFO" | "WARNING" | "ERROR" = "WARNING",
): Promise<void> {
  try {
    await db.from("audit_logs").insert({
      user_id: null, user_email: null, user_full_name: null,
      action, module: "AI_SERVICES", entity_type: "AIProvider", entity_id: null,
      description: `provider=${providerId}; capability=${capability}; ${detail}`.slice(0, 1000),
      ip_address: null, severity, status: "SUCCESS",
    });
  } catch {
    // Circuit decisions must not fail because optional audit persistence failed.
  }
}

export type ExecuteAiProviderCallOptions<T> = {
  db: DatabaseClient;
  providerId: string;
  capability: string;
  config?: Partial<AiCircuitConfig>;
  operation: (context: { signal: AbortSignal; attempt: number; isProbe: boolean }) => Promise<T>;
  dependencies?: {
    sleep?: (milliseconds: number) => Promise<void>;
    random?: () => number;
  };
};

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function executeAiProviderCall<T>(options: ExecuteAiProviderCallOptions<T>): Promise<T> {
  const config = normalizeAiCircuitConfig(options.config ?? {});
  const capability = options.capability.trim().toLowerCase();
  let retryDelayBudgetMs = 0;
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    retryDelayBudgetMs += Math.min(10_000, (config.retryBaseDelayMs * (2 ** attempt)) + config.retryBaseDelayMs);
  }
  const probeLockSeconds = Math.min(900, Math.max(
    config.halfOpenProbeLockSeconds,
    Math.ceil(((config.requestTimeoutMs * (config.maxRetries + 1)) + retryDelayBudgetMs + 5_000) / 1_000),
  ));
  const { data: permitData, error: permitError } = await options.db.rpc("acquire_ai_provider_circuit", {
    p_provider_id: options.providerId,
    p_capability: capability,
    p_probe_lock_seconds: probeLockSeconds,
  });
  if (permitError) {
    throw new AiCircuitOpenError("AI_CIRCUIT_STATE_UNAVAILABLE", 5, "OPEN");
  }
  const permit = firstRow(permitData as CircuitPermit | CircuitPermit[] | null);
  if (!permit) throw new AiCircuitOpenError("AI_CIRCUIT_STATE_UNAVAILABLE", 5, "OPEN");
  if (!permit.allowed) {
    await writeOperationalAudit(options.db, "PROVIDER_REQUEST_BLOCKED", options.providerId, capability,
      `state=${permit.circuit_state}; reason=${permit.permission_code}`);
    throw new AiCircuitOpenError(
      permit.permission_code === "PROBE_ALREADY_IN_PROGRESS" ? "AI_PROVIDER_PROBE_IN_PROGRESS" : "AI_PROVIDER_CIRCUIT_OPEN",
      Math.max(1, Number(permit.retry_after_seconds ?? 1)), permit.circuit_state,
    );
  }
  if (permit.transitioned && permit.circuit_state === "HALF_OPEN") {
    await writeOperationalAudit(options.db, "CIRCUIT_HALF_OPEN", options.providerId, capability, "probe=acquired", "INFO");
  }

  const sleep = options.dependencies?.sleep ?? defaultSleep;
  const random = options.dependencies?.random ?? Math.random;
  const startedAt = Date.now();
  let lastError: unknown;
  const maxRetriesForPermit = permit.circuit_state === "HALF_OPEN" ? 0 : config.maxRetries;
  for (let attempt = 0; attempt <= maxRetriesForPermit; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Provider request timed out", "AbortError")), config.requestTimeoutMs);
    try {
      const result = await options.operation({ signal: controller.signal, attempt: attempt + 1, isProbe: permit.circuit_state === "HALF_OPEN" });
      const latency = Math.max(0, Date.now() - startedAt);
      const { data: successData } = await options.db.rpc("record_ai_provider_circuit_success", {
        p_provider_id: options.providerId, p_capability: capability,
        p_lease_version: permit.lease_version, p_latency_ms: latency,
      });
      const success = firstRow(successData as { transitioned?: boolean } | Array<{ transitioned?: boolean }> | null);
      if (success?.transitioned) {
        await writeOperationalAudit(options.db, "CIRCUIT_CLOSED", options.providerId, capability, `latencyMs=${latency}`, "INFO");
      }
      return result;
    } catch (error) {
      lastError = error;
      const failure = classifyProviderFailure(error);
      if (!failure.retryable || attempt >= maxRetriesForPermit) break;
      const exponential = config.retryBaseDelayMs * (2 ** attempt);
      const jitter = Math.floor(Math.max(0, Math.min(1, random())) * config.retryBaseDelayMs);
      await sleep(Math.min(10_000, exponential + jitter));
    } finally {
      clearTimeout(timer);
    }
  }

  const failure = classifyProviderFailure(lastError);
  const latency = Math.max(0, Date.now() - startedAt);
  const { data: failureData } = await options.db.rpc("record_ai_provider_circuit_failure", {
    p_provider_id: options.providerId, p_capability: capability,
    p_lease_version: permit.lease_version, p_countable: failure.countable,
    p_error_code: failure.code, p_error_message_safe: failure.safeMessage,
    p_failure_threshold: config.failureThreshold,
    p_cooldown_seconds: config.openCooldownSeconds,
    p_latency_ms: latency,
  });
  const recorded = firstRow(failureData as { transitioned?: boolean; circuit_state?: string; failure_count?: number; next_attempt_at?: string | null } | Array<{ transitioned?: boolean; circuit_state?: string; failure_count?: number; next_attempt_at?: string | null }> | null);
  await writeOperationalAudit(options.db,
    failure.category === "TIMEOUT" ? "PROVIDER_TIMEOUT"
      : failure.countable ? "PROVIDER_TRANSIENT_FAILURE" : "PROVIDER_REQUEST_REJECTED",
    options.providerId, capability, `category=${failure.category}; latencyMs=${latency}`,
    failure.countable ? "WARNING" : "INFO");
  if (recorded?.transitioned && recorded.circuit_state === "OPEN") {
    await writeOperationalAudit(options.db, "CIRCUIT_OPENED", options.providerId, capability,
      `failureCount=${recorded.failure_count ?? config.failureThreshold}; category=${failure.category}`, "ERROR");
  }
  if (recorded?.circuit_state === "OPEN") {
    const retryMilliseconds = recorded.next_attempt_at ? new Date(recorded.next_attempt_at).getTime() - Date.now() : config.openCooldownSeconds * 1000;
    throw new AiCircuitOpenError("AI_PROVIDER_CIRCUIT_OPEN", Math.max(1, Math.ceil(retryMilliseconds / 1000)), "OPEN");
  }
  throw lastError;
}

export function circuitRetryHeaders(error: AiCircuitOpenError): Headers {
  const headers = new Headers();
  headers.set("Retry-After", String(Math.max(1, error.retryAfterSeconds)));
  return headers;
}
