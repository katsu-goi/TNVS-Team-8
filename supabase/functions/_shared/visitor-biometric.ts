import { adminDb } from "./db.ts";

export type VisitorBiometricTechnicalReadiness = {
  checkedAt: string;
  overallStatus: "READY" | "NOT_CONFIGURED" | "DISABLED" | "UNAVAILABLE" | "MODEL_NOT_TESTED" | "ERROR";
  ready: boolean;
  edge: {
    featureFlagEnabled: boolean;
    serviceUrlConfigured: boolean;
    secureTransport: boolean;
    serviceKeyConfigured: boolean;
  };
  service: {
    connected: boolean;
    featureFlagEnabled: boolean | null;
    modelProfile: string | null;
    model: string | null;
    detector: string | null;
    modelStatus: "INITIALIZED" | "NOT_INITIALIZED" | "ERROR" | "UNKNOWN";
    inferenceStatus: "PASSED" | "NOT_TESTED" | "FAILED" | "UNKNOWN";
    inferenceOutcome: "MATCH_INDICATED" | "MISMATCH_INDICATED" | "INCONCLUSIVE" | "NO_FACE_DETECTED" | "MULTIPLE_FACES_DETECTED" | "PROCESSING_FAILED" | null;
    inferenceTestedAt: string | null;
    errorCode: string | null;
    modelInitializationMilliseconds: number | null;
    inferenceDurationMilliseconds: number | null;
    peakResidentMemoryBytes: number | null;
    processStartedAt: string | null;
    processUptimeMilliseconds: number | null;
    requestDurationMilliseconds: number | null;
    coldStart: boolean | null;
  };
  missing: string[];
};

function envText(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function secureServiceUrl(value: string): boolean {
  if (value.startsWith("https://")) return true;
  return envText("VISITOR_BIOMETRIC_ALLOW_INSECURE_LOCALHOST").toLowerCase() === "true"
    && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(value);
}

function emptyReadiness(): VisitorBiometricTechnicalReadiness {
  return {
    checkedAt: new Date().toISOString(),
    overallStatus: "NOT_CONFIGURED",
    ready: false,
    edge: {
      featureFlagEnabled: envText("VISITOR_BIOMETRIC_ENABLED").toLowerCase() === "true",
      serviceUrlConfigured: Boolean(envText("VISITOR_BIOMETRIC_SERVICE_URL")),
      secureTransport: secureServiceUrl(envText("VISITOR_BIOMETRIC_SERVICE_URL")),
      serviceKeyConfigured: envText("VISITOR_BIOMETRIC_SERVICE_KEY").length >= 32,
    },
    service: {
      connected: false,
      featureFlagEnabled: null,
      modelProfile: null,
      model: null,
      detector: null,
      modelStatus: "UNKNOWN",
      inferenceStatus: "UNKNOWN",
      inferenceOutcome: null,
      inferenceTestedAt: null,
      errorCode: null,
      modelInitializationMilliseconds: null,
      inferenceDurationMilliseconds: null,
      peakResidentMemoryBytes: null,
      processStartedAt: null,
      processUptimeMilliseconds: null,
      requestDurationMilliseconds: null,
      coldStart: null,
    },
    missing: [],
  };
}

/**
 * Calls the private Python service using server-only credentials. The result is
 * deliberately limited to operational metadata and never contains images,
 * embeddings, tokens, keys, or model paths.
 */
export async function checkVisitorBiometricTechnicalReadiness(
  runInference: boolean,
): Promise<VisitorBiometricTechnicalReadiness> {
  const readiness = emptyReadiness();
  const endpoint = envText("VISITOR_BIOMETRIC_SERVICE_URL").replace(/\/+$/, "");
  const key = envText("VISITOR_BIOMETRIC_SERVICE_KEY");
  if (!readiness.edge.featureFlagEnabled) readiness.missing.push("SUPABASE_BIOMETRIC_FLAG_DISABLED");
  if (!readiness.edge.serviceUrlConfigured) readiness.missing.push("BIOMETRIC_SERVICE_URL_MISSING");
  else if (!readiness.edge.secureTransport) readiness.missing.push("BIOMETRIC_SERVICE_HTTPS_REQUIRED");
  if (!readiness.edge.serviceKeyConfigured) readiness.missing.push("BIOMETRIC_SERVICE_KEY_INVALID");
  if (!endpoint || !readiness.edge.secureTransport || !readiness.edge.serviceKeyConfigured) {
    readiness.overallStatus = "NOT_CONFIGURED";
    return readiness;
  }

  const timeoutSeconds = Math.max(5, Math.min(120, Number(envText("VISITOR_BIOMETRIC_READINESS_TIMEOUT_SECONDS")) || 60));
  try {
    const requestBody: Record<string, unknown> = { runInference };
    const readinessIdPath = envText("VISITOR_BIOMETRIC_READINESS_ID_STORAGE_PATH");
    const readinessSelfiePath = envText("VISITOR_BIOMETRIC_READINESS_SELFIE_STORAGE_PATH");
    if (runInference && readinessIdPath && readinessSelfiePath) {
      const bucket = envText("VISITOR_BIOMETRIC_STORAGE_BUCKET") || "visitor-identity-private";
      const storage = adminDb().storage.from(bucket);
      const [{ data: idSigned, error: idError }, { data: selfieSigned, error: selfieError }] = await Promise.all([
        storage.createSignedUrl(readinessIdPath, 300),
        storage.createSignedUrl(readinessSelfiePath, 300),
      ]);
      if (idError || selfieError || !idSigned?.signedUrl || !selfieSigned?.signedUrl) {
        readiness.overallStatus = "MODEL_NOT_TESTED";
        readiness.service.errorCode = "READINESS_TEST_IMAGES_UNAVAILABLE";
        readiness.missing.push(readiness.service.errorCode);
        console.error("visitor biometric readiness failed category=READINESS_STORAGE_REFERENCE");
        return readiness;
      }
      requestBody.idImageReference = { signedUrl: idSigned.signedUrl };
      requestBody.selfieImageReference = { signedUrl: selfieSigned.signedUrl };
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Visitor-Verification-Key": key,
    };
    const vercelBypass = envText("VISITOR_BIOMETRIC_VERCEL_BYPASS_SECRET");
    if (vercelBypass) headers["x-vercel-protection-bypass"] = vercelBypass;
    const response = await fetch(`${endpoint}/v1/readiness`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    if (!response.ok) {
      const errorCode = response.status === 401
        ? "BIOMETRIC_SERVICE_AUTHENTICATION_FAILED"
        : response.status === 404
          ? "BIOMETRIC_READINESS_ENDPOINT_NOT_FOUND"
          : response.status === 429
            ? "BIOMETRIC_SERVICE_RATE_LIMITED"
            : response.status === 503
              ? "BIOMETRIC_SERVICE_CONFIGURATION_INVALID"
              : `BIOMETRIC_SERVICE_HTTP_${response.status}`;
      readiness.overallStatus = response.status === 401 ? "ERROR" : "UNAVAILABLE";
      readiness.service.errorCode = errorCode;
      readiness.missing.push(readiness.service.errorCode);
      console.error(`visitor biometric readiness failed category=HTTP_${response.status}`);
      return readiness;
    }
    const result = await response.json() as Record<string, unknown>;
    const modelStatus = String(result.modelStatus ?? "UNKNOWN").toUpperCase();
    const inferenceStatus = String(result.inferenceStatus ?? "UNKNOWN").toUpperCase();
    const inferenceOutcome = String(result.inferenceOutcome ?? "").toUpperCase();
    readiness.service = {
      connected: true,
      featureFlagEnabled: result.featureEnabled === true,
      modelProfile: typeof result.modelProfile === "string" ? result.modelProfile.slice(0, 100) : null,
      model: typeof result.model === "string" ? result.model.slice(0, 80) : null,
      detector: typeof result.detector === "string" ? result.detector.slice(0, 80) : null,
      modelStatus: ["INITIALIZED", "NOT_INITIALIZED", "ERROR"].includes(modelStatus)
        ? modelStatus as VisitorBiometricTechnicalReadiness["service"]["modelStatus"] : "UNKNOWN",
      inferenceStatus: ["PASSED", "NOT_TESTED", "FAILED"].includes(inferenceStatus)
        ? inferenceStatus as VisitorBiometricTechnicalReadiness["service"]["inferenceStatus"] : "UNKNOWN",
      inferenceOutcome: ["MATCH_INDICATED", "MISMATCH_INDICATED", "INCONCLUSIVE", "NO_FACE_DETECTED", "MULTIPLE_FACES_DETECTED", "PROCESSING_FAILED"].includes(inferenceOutcome)
        ? inferenceOutcome as NonNullable<VisitorBiometricTechnicalReadiness["service"]["inferenceOutcome"]> : null,
      inferenceTestedAt: typeof result.inferenceTestedAt === "string" ? result.inferenceTestedAt.slice(0, 40) : null,
      errorCode: typeof result.errorCode === "string" ? result.errorCode.slice(0, 100) : null,
      modelInitializationMilliseconds: typeof result.modelInitializationMilliseconds === "number" && Number.isFinite(result.modelInitializationMilliseconds)
        ? Math.max(0, Math.round(result.modelInitializationMilliseconds)) : null,
      inferenceDurationMilliseconds: typeof result.inferenceDurationMilliseconds === "number" && Number.isFinite(result.inferenceDurationMilliseconds)
        ? Math.max(0, Math.round(result.inferenceDurationMilliseconds)) : null,
      peakResidentMemoryBytes: typeof result.peakResidentMemoryBytes === "number" && Number.isFinite(result.peakResidentMemoryBytes)
        ? Math.max(0, Math.round(result.peakResidentMemoryBytes)) : null,
      processStartedAt: typeof result.processStartedAt === "string" ? result.processStartedAt.slice(0, 40) : null,
      processUptimeMilliseconds: typeof result.processUptimeMilliseconds === "number" && Number.isFinite(result.processUptimeMilliseconds)
        ? Math.max(0, Math.round(result.processUptimeMilliseconds)) : null,
      requestDurationMilliseconds: typeof result.requestDurationMilliseconds === "number" && Number.isFinite(result.requestDurationMilliseconds)
        ? Math.max(0, Math.round(result.requestDurationMilliseconds)) : null,
      coldStart: typeof result.coldStart === "boolean" ? result.coldStart : null,
    };
    if (!readiness.service.featureFlagEnabled) readiness.missing.push("PYTHON_BIOMETRIC_FLAG_DISABLED");
    if (readiness.service.modelStatus !== "INITIALIZED") readiness.missing.push("DEEPFACE_MODEL_NOT_INITIALIZED");
    if (readiness.service.inferenceStatus !== "PASSED") readiness.missing.push("DEEPFACE_INFERENCE_NOT_TESTED");
    if (readiness.service.errorCode) readiness.missing.push(readiness.service.errorCode);
    readiness.ready = readiness.missing.length === 0;
    readiness.overallStatus = readiness.ready
      ? "READY"
      : readiness.service.inferenceStatus !== "PASSED"
        ? "MODEL_NOT_TESTED"
        : !readiness.edge.featureFlagEnabled || !readiness.service.featureFlagEnabled
          ? "DISABLED"
          : "ERROR";
    return readiness;
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    readiness.overallStatus = "UNAVAILABLE";
    readiness.service.errorCode = timeout ? "BIOMETRIC_SERVICE_TIMEOUT" : "BIOMETRIC_SERVICE_UNAVAILABLE";
    readiness.missing.push(readiness.service.errorCode);
    console.error(`visitor biometric readiness failed category=${timeout ? "TIMEOUT" : "UNAVAILABLE"}`);
    return readiness;
  }
}
