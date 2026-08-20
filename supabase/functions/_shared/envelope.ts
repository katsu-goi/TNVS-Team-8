export type ApiEnvelope = {
  success: boolean;
  message: string;
  data?: unknown;
  errors?: string[];
  errorCode?: string;
  timestamp: string;
};

/**
 * Mirrors Spring ApiResponse.success overloads:
 * - ok(data, message) → { success, message, data }
 * - ok(message)       → { success, message }            (no data field)
 * - ok()              → { success, message: "Operation successful" }
 */
export function ok(data?: unknown, message?: string): ApiEnvelope;
export function ok(message: string): ApiEnvelope;
export function ok(data?: unknown, message = "Operation successful"): ApiEnvelope {
  if (typeof data === "string") {
    return { success: true, message: data, timestamp: new Date().toISOString() };
  }
  return {
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function fail(
  message: string,
  errorCode: string,
  errors?: string[],
): ApiEnvelope {
  return {
    success: false,
    message,
    ...(errors && errors.length ? { errors } : {}),
    errorCode,
    timestamp: new Date().toISOString(),
  };
}