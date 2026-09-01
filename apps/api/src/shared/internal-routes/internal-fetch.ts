// Client-side counterpart of `requireInternalSignature` — the canonical message
// MUST stay byte-identical with the verifier. See docs/CRON.md.
import { buildSignatureHeader, canonicalize, SIGNATURE_HEADER, sign } from "./internal-signature";

/**
 * Deliberately above the server's own idle timeout: with both sides on their
 * defaults the server always answers first, so a client abort means the API is
 * unreachable or wedged rather than merely slow.
 */
export const DEFAULT_INTERNAL_FETCH_TIMEOUT_MS = 150_000;

export interface SignedFetchInput {
  baseUrl: string;
  method: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  signingKey: string;
  timeoutMs?: number;
}

/**
 * Signs and dispatches an HTTP request to an `/internal/*` endpoint.
 *
 * Builds the canonical message, computes the HMAC-SHA256 signature, and
 * attaches it as `X-Internal-Signature`. Import this in external schedulers
 * (GH Actions, Railway cron sidecar) — it is the only supported way to call
 * internal routes from outside the process.
 */
export async function signedInternalFetch(input: SignedFetchInput): Promise<Response> {
  const url = new URL(input.path, input.baseUrl);
  const rawBody = input.body === undefined ? "" : JSON.stringify(input.body);
  const contentType = rawBody ? "application/json" : null;
  const timestamp = Math.floor(Date.now() / 1000);

  const message = canonicalize({
    timestamp,
    method: input.method,
    path: url.pathname,
    host: url.host,
    contentType,
    rawBody,
  });

  const headers: Record<string, string> = {
    [SIGNATURE_HEADER]: buildSignatureHeader(timestamp, await sign(message, input.signingKey)),
  };
  if (contentType) headers["Content-Type"] = contentType;

  return fetch(url, {
    method: input.method,
    headers,
    body: rawBody || undefined,
    signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_INTERNAL_FETCH_TIMEOUT_MS),
  });
}
