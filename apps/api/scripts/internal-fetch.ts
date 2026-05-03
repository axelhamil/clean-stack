import {
  buildSignatureHeader,
  canonicalize,
  SIGNATURE_HEADER,
  sign,
} from "../common/internal-signature";

export interface SignedFetchInput {
  baseUrl: string;
  method: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  signingKey: string;
}

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
  });
}
