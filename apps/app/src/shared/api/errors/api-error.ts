export interface ApiError extends Error {
  code?: string;
  metadata?: Record<string, unknown>;
  status?: number;
}

interface AuthClientErrorInput {
  code?: string;
  status?: number;
  message?: string;
}

/**
 * BetterAuth client calls (`authClient.*`) reject with `{ code, status, message }`
 * rather than a thrown `Error` — carry that shape into an `ApiError` so
 * `formatApiError`/`toastError` can resolve `byCode` downstream the same way
 * they do for `throwApiError`. Without this, a plain `new Error(message)` loses
 * the code and the catalog lookup always falls through to the caller's fallback.
 */
export function toAuthClientError(error: AuthClientErrorInput, fallbackMessage: string): ApiError {
  const err = new Error(error.message ?? fallbackMessage) as ApiError;
  err.code = error.code;
  err.status = error.status;
  return err;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; metadata?: Record<string, unknown> };
}

/**
 * Narrowed to what this function actually reads. Hono RPC's `ClientResponse`
 * (every real call site) and the DOM `Response` both satisfy this, but they
 * no longer satisfy each other structurally now that `Response` carries a
 * `textStream` member `ClientResponse` doesn't implement.
 */
interface ApiFailureResponse {
  readonly status: number;
  readonly headers: Pick<Headers, "get">;
  json(): Promise<unknown>;
}

export async function throwApiError(
  res: ApiFailureResponse,
  fallbackMessage: string,
): Promise<never> {
  let payload: ErrorEnvelope = {};
  try {
    payload = (await res.json()) as ErrorEnvelope;
  } catch {
    // No JSON body — keep fallback message.
  }
  const err = new Error(payload.error?.message ?? fallbackMessage) as ApiError;
  err.code = payload.error?.code;
  err.metadata = payload.error?.metadata;
  err.status = res.status;
  if (res.status === 429) {
    const headerVal = res.headers.get("Retry-After");
    if (headerVal !== null && err.metadata?.retryAfter === undefined) {
      const numeric = Number(headerVal);
      if (!Number.isNaN(numeric)) {
        err.metadata = { ...err.metadata, retryAfter: numeric };
      } else {
        // Non-numeric: try HTTP-date parse (e.g. "Thu, 12 Jun 2026 10:30:00 GMT")
        const parsed = Date.parse(headerVal);
        if (!Number.isNaN(parsed)) {
          const seconds = Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
          err.metadata = { ...err.metadata, retryAfter: seconds };
        }
        // NaN date → ignore header (no retryAfter set)
      }
    }
  }
  throw err;
}
