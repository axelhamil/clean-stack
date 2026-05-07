import { Buffer } from "node:buffer";

const TIMESTAMP_TOLERANCE_SECONDS = 300;

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function signWebhookPayload(
  rawBody: string,
  secret: string,
  timestampSeconds: number,
): Promise<string> {
  const key = await importHmacKey(secret);
  const signed = `${timestampSeconds}.${rawBody}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const hex = Buffer.from(new Uint8Array(sig)).toString("hex");
  return `t=${timestampSeconds},v1=${hex}`;
}

export function isStaleTimestamp(timestampSeconds: number, nowMs = Date.now()): boolean {
  return Math.abs(nowMs / 1000 - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS;
}
