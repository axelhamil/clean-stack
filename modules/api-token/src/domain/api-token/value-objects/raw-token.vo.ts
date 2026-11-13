import { Option, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const TOKEN_BODY_LENGTH = 44;

const TOKEN_CHECKSUM_LENGTH = 6;
const TOKEN_START_BODY_CHARS = 8;
const CRC32_POLYNOMIAL = 0xedb88320;

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let entry = index;
  for (let bit = 0; bit < 8; bit++) {
    entry = entry & 1 ? CRC32_POLYNOMIAL ^ (entry >>> 1) : entry >>> 1;
  }

  return entry >>> 0;
});

export function crc32(text: string): number {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toBase58Fixed(value: number, length: number): string {
  let rest = value >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    out = BASE58_ALPHABET[rest % BASE58_ALPHABET.length] + out;
    rest = Math.floor(rest / BASE58_ALPHABET.length);
  }

  return out;
}

function checksumOf(payload: string): string {
  return toBase58Fixed(crc32(payload), TOKEN_CHECKSUM_LENGTH);
}

function formatProblem(raw: string, prefix: string): Option<string> {
  if (!raw.startsWith(prefix)) return Option.some("unexpected prefix");
  if (raw.length !== prefix.length + TOKEN_BODY_LENGTH + TOKEN_CHECKSUM_LENGTH) {
    return Option.some("unexpected length");
  }

  const body = raw.slice(prefix.length, prefix.length + TOKEN_BODY_LENGTH);
  const checksum = raw.slice(prefix.length + TOKEN_BODY_LENGTH);
  if ([...body, ...checksum].some((char) => !BASE58_ALPHABET.includes(char))) {
    return Option.some("non-base58 character");
  }
  if (checksum !== checksumOf(`${prefix}${body}`)) return Option.some("checksum mismatch");

  return Option.none();
}

const rawTokenSchema = z
  .object({ prefix: z.string(), raw: z.string() })
  .superRefine(({ prefix, raw }, ctx) => {
    const problem = formatProblem(raw, prefix);
    if (problem.isSome()) ctx.addIssue({ code: "custom", message: problem.unwrap() });
  });

type RawTokenValue = z.infer<typeof rawTokenSchema>;

export type TokenFormatError = { code: "API_TOKEN_MALFORMED"; message: string };

export class RawToken extends ValueObject<RawTokenValue, TokenFormatError> {
  static issue(prefix: string, body: string): Result<RawToken, TokenFormatError> {
    const payload = `${prefix}${body}`;

    return RawToken.parse(prefix, `${payload}${checksumOf(payload)}`);
  }

  static parse(prefix: string, raw: string): Result<RawToken, TokenFormatError> {
    return RawToken.create({ prefix, raw });
  }

  start(): string {
    return this.value.raw.slice(0, this.value.prefix.length + TOKEN_START_BODY_CHARS);
  }

  protected validate(value: RawTokenValue): Result<RawTokenValue, TokenFormatError> {
    const parsed = rawTokenSchema.safeParse(value);
    if (parsed.success) return Result.ok(parsed.data);

    return Result.fail({
      code: "API_TOKEN_MALFORMED",
      message: parsed.error.issues[0]?.message ?? "malformed token",
    });
  }
}
