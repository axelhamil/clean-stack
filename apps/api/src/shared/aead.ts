import { Buffer } from "node:buffer";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const NONCE_BYTES = 24;
const MIN_CIPHERTEXT_BYTES = NONCE_BYTES + 16;

export function masterKeyFromHex(hex: string): Uint8Array {
  if (hex.length !== 64) {
    throw new Error("WEBHOOK_MASTER_KEY must be 64 hex chars (32 bytes)");
  }
  return new Uint8Array(Buffer.from(hex, "hex"));
}

export function deriveOrgSubKey(masterKey: Uint8Array, organizationId: string): Uint8Array {
  const info = new TextEncoder().encode(`webhook-secret:${organizationId}`);
  return hkdf(sha256, masterKey, undefined, info, 32);
}

export function encryptSecret(plaintext: string, subKey: Uint8Array): string {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const cipher = xchacha20poly1305(subKey, nonce);
  const ciphertext = cipher.encrypt(new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(NONCE_BYTES + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, NONCE_BYTES);
  return Buffer.from(combined).toString("base64");
}

export function decryptSecret(encrypted: string, subKey: Uint8Array): string {
  const combined = Buffer.from(encrypted, "base64");
  if (combined.length < MIN_CIPHERTEXT_BYTES) {
    throw new Error("invalid ciphertext: too short");
  }
  const nonce = combined.subarray(0, NONCE_BYTES);
  const ciphertext = combined.subarray(NONCE_BYTES);
  const cipher = xchacha20poly1305(subKey, nonce);
  return new TextDecoder().decode(cipher.decrypt(ciphertext));
}
