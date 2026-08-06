import { createHmac } from "node:crypto";
import { Result } from "@packages/ddd-kit";

export const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const TOKEN_BODY_LENGTH = 44;
export const TOKEN_CHECKSUM_LENGTH = 6;
export const TOKEN_START_BODY_CHARS = 8;

export type TokenFormatError = { code: "API_TOKEN_MALFORMED"; message: string };

const ALPHABET_SIZE = BASE58_ALPHABET.length;
const REJECTION_CEILING = 256 - (256 % ALPHABET_SIZE);

function randomBase58(length: number): string {
  let out = "";
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= REJECTION_CEILING) continue;
      out += BASE58_ALPHABET[byte % ALPHABET_SIZE];
      if (out.length === length) break;
    }
  }
  return out;
}

function toBase58Fixed(value: number, length: number): string {
  let n = value >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    out = BASE58_ALPHABET[n % ALPHABET_SIZE] + out;
    n = Math.floor(n / ALPHABET_SIZE);
  }
  return out;
}

function checksumOf(payload: string): string {
  // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
  return toBase58Fixed(Bun.hash.crc32(payload), TOKEN_CHECKSUM_LENGTH);
}

export function generateToken(prefix: string): { raw: string; body: string; start: string } {
  const body = randomBase58(TOKEN_BODY_LENGTH);
  const raw = `${prefix}${body}${checksumOf(`${prefix}${body}`)}`;
  return { raw, body, start: raw.slice(0, prefix.length + TOKEN_START_BODY_CHARS) };
}

export function parseToken(raw: string, prefix: string): Result<{ raw: string }, TokenFormatError> {
  const malformed = (message: string) =>
    Result.fail<{ raw: string }, TokenFormatError>({ code: "API_TOKEN_MALFORMED", message });

  if (!raw.startsWith(prefix)) return malformed("unexpected prefix");
  if (raw.length !== prefix.length + TOKEN_BODY_LENGTH + TOKEN_CHECKSUM_LENGTH) {
    return malformed("unexpected length");
  }

  const body = raw.slice(prefix.length, prefix.length + TOKEN_BODY_LENGTH);
  const checksum = raw.slice(prefix.length + TOKEN_BODY_LENGTH);
  for (const char of body + checksum) {
    if (!BASE58_ALPHABET.includes(char)) return malformed("non-base58 character");
  }
  if (checksum !== checksumOf(`${prefix}${body}`)) return malformed("checksum mismatch");

  return Result.ok({ raw });
}

export function hmacToken(raw: string, pepper: string): string {
  return createHmac("sha256", pepper).update(raw).digest("base64url");
}
