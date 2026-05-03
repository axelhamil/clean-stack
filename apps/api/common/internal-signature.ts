export const SIGNATURE_HEADER = "X-Internal-Signature";
export const MAX_AGE_SECONDS = 30;

function normalizeHost(host: string): string {
  return host.toLowerCase().trim().replace(/:443$/, "").replace(/:80$/, "");
}

function normalizeContentType(ct: string | null): string {
  if (!ct) return "";
  return (ct.split(";")[0] ?? "").trim().toLowerCase();
}

export interface CanonicalInput {
  timestamp: number;
  method: string;
  path: string;
  host: string;
  contentType: string | null;
  rawBody: string;
}

/**
 * Variante C — assemble the canonical message that gets HMAC-signed.
 *
 * Constraints:
 *   - method MUST be uppercased (POST not post). HTTP methods are spec
 *     case-sensitive but everyone uppercases — pin it.
 *   - host MUST go through normalizeHost (lowercase, drop default ports)
 *     so a valid signature survives proxies that touch the casing.
 *   - contentType MUST go through normalizeContentType (drop charset and
 *     other parameters) — defends against content-type confusion AND
 *     against axios/superagent appending "; charset=utf-8".
 *   - rawBody passes through verbatim (the bytes the client actually sent).
 *   - separator: "\n" — never appears inside any of the components above.
 *
 * Component order (locked — changing it invalidates every signature in flight):
 *   timestamp, method, path, host, contentType, rawBody
 *
 * Why each:
 *   timestamp   → anti-replay (verifier rejects if |now - t| > MAX_AGE_SECONDS)
 *   method      → prevents POST→GET swap (semantic shift on same path)
 *   path        → prevents cross-endpoint replay (/gdpr-sweep ≠ /billing-sweep)
 *   host        → prevents cross-env replay (staging.api ≠ prod.api)
 *   contentType → prevents content-type confusion (json parsed as form, etc.)
 *   rawBody     → prevents payload tampering (the whole point)
 */
export function canonicalize(input: CanonicalInput): string {
  return [
    String(input.timestamp),
    input.method.toUpperCase(),
    input.path,
    normalizeHost(input.host),
    normalizeContentType(input.contentType),
    input.rawBody,
  ].join("\n");
}

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += (view[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

const encoder = new TextEncoder();

async function importHmacKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function sign(message: string, key: string): Promise<string> {
  const cryptoKey = await importHmacKey(key);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return toHex(sig);
}

/**
 * Constant-time string equality on hex digests.
 *
 * Length check up front is safe here: signatures are SHA-256 hex (64 chars
 * fixed). A length mismatch means a malformed presented signature, not a
 * value the caller chose — no oracle.
 */
export function verify(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function buildSignatureHeader(timestamp: number, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
}

export function parseSignatureHeader(header: string): { t: number; v1: string } | null {
  const entries = header.split(",").map((kv) => {
    const [k, v] = kv.split("=");
    return [k?.trim() ?? "", v?.trim() ?? ""] as const;
  });
  const map = Object.fromEntries(entries);
  const t = Number(map.t);
  const v1 = map.v1;
  if (!Number.isFinite(t) || !v1) return null;
  return { t, v1 };
}
