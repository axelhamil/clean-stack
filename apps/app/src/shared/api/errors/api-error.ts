export interface ApiError extends Error {
  code?: string;
  metadata?: Record<string, unknown>;
  status?: number;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; metadata?: Record<string, unknown> };
}

export async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
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
