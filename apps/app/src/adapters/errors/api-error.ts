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
  throw err;
}
