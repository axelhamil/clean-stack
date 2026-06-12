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
    const headerSeconds = headerVal !== null ? Number(headerVal) : Number.NaN;
    if (!Number.isNaN(headerSeconds) && err.metadata?.retryAfter === undefined) {
      err.metadata = { ...err.metadata, retryAfter: headerSeconds };
    }
  }
  throw err;
}
