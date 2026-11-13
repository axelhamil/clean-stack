import { createHmac } from "node:crypto";
import type { Result } from "@packages/ddd-kit";
import type { ITokenHasher } from "../../application/ports/services/token-hasher.port";
import {
  BASE58_ALPHABET,
  RawToken,
  TOKEN_BODY_LENGTH,
  type TokenFormatError,
} from "../../domain/api-token/value-objects/raw-token.vo";

const REJECTION_CEILING = 256 - (256 % BASE58_ALPHABET.length);

function randomBase58(length: number): string {
  let out = "";
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= REJECTION_CEILING) continue;
      out += BASE58_ALPHABET[byte % BASE58_ALPHABET.length];
      if (out.length === length) break;
    }
  }

  return out;
}

export function hmacToken(raw: string, pepper: string): string {
  return createHmac("sha256", pepper).update(raw).digest("base64url");
}

export const cryptoTokenHasher: ITokenHasher = {
  hmac: hmacToken,
  randomBody: () => randomBase58(TOKEN_BODY_LENGTH),
};

export function parseToken(raw: string, prefix: string): Result<RawToken, TokenFormatError> {
  return RawToken.parse(prefix, raw);
}

export function generateToken(prefix: string): { raw: string; start: string } {
  const token = RawToken.issue(prefix, cryptoTokenHasher.randomBody()).getValue();

  return { raw: token.value.raw, start: token.start() };
}
