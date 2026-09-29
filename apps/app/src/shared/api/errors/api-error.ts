export interface ApiError extends Error {
  code?: string;
  metadata?: Record<string, unknown>;
  status?: number;
}

type ApiErrorFields = Partial<Pick<ApiError, "code" | "message" | "metadata" | "status">>;

/**
 * Reads the `ApiError` fields off anything a query or mutation can reject
 * with. A rejection is `unknown` (a thrown string, `null`, a BetterAuth error
 * object, a real `ApiError`), so every reader needs the same object guard
 * before it can look at `status` or `code`: this is that guard, once.
 */
export function apiErrorFields(error: unknown): ApiErrorFields {
  if (typeof error !== "object" || error === null) return {};
  return error as ApiErrorFields;
}

interface AuthClientErrorInput {
  code?: string;
  status?: number;
  message?: string;
}

/**
 * BetterAuth client calls (`authClient.*`) reject with `{ code, status, message }`
 * rather than a thrown `Error`: carry that shape into an `ApiError` so
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

/**
 * `Retry-After` is either a delay in seconds or an HTTP date
 * ("Thu, 12 Jun 2026 10:30:00 GMT"). Anything else is ignored rather than
 * turned into a bogus countdown.
 */
function retryAfterSeconds(header: string): number | undefined {
  const numeric = Number(header);
  if (!Number.isNaN(numeric)) return numeric;

  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;

  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export async function throwApiError(
  res: ApiFailureResponse,
  fallbackMessage: string,
): Promise<never> {
  let payload: ErrorEnvelope = {};
  try {
    payload = (await res.json()) as ErrorEnvelope;
  } catch {
    // A failure without a JSON body keeps the caller's fallback message.
  }

  const err = new Error(payload.error?.message ?? fallbackMessage) as ApiError;
  err.code = payload.error?.code;
  err.metadata = payload.error?.metadata;
  err.status = res.status;

  const header = res.status === 429 ? res.headers.get("Retry-After") : null;
  if (header !== null && err.metadata?.retryAfter === undefined) {
    const retryAfter = retryAfterSeconds(header);
    if (retryAfter !== undefined) err.metadata = { ...err.metadata, retryAfter };
  }

  throw err;
}
