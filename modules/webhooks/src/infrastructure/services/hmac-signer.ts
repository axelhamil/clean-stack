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
  secrets: string[],
  timestampSeconds: number,
): Promise<string> {
  const signed = `${timestampSeconds}.${rawBody}`;
  const sigs = await Promise.all(
    secrets.map(async (secret) => {
      const key = await importHmacKey(secret);
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
      return `v1=${Buffer.from(new Uint8Array(sig)).toString("hex")}`;
    }),
  );
  return `t=${timestampSeconds},${sigs.join(",")}`;
}

export function isStaleTimestamp(timestampSeconds: number, nowMs = Date.now()): boolean {
  return Math.abs(nowMs / 1000 - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS;
}
