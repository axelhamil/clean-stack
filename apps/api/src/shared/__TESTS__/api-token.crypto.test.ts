import { describe, expect, it } from "bun:test";
import { generateToken, hmacToken, parseToken } from "../crypto/api-token";

const PREFIX = "clean_";
const PEPPER = "a".repeat(32);

describe("api-token crypto", () => {
  it("round-trips a generated token through parseToken", () => {
    const { raw } = generateToken(PREFIX);
    expect(raw.startsWith(PREFIX)).toBe(true);
    expect(raw.length).toBe(PREFIX.length + 44 + 6);
    expect(parseToken(raw, PREFIX).isSuccess).toBe(true);
  });

  it("exposes a start made of the prefix plus 8 body chars", () => {
    const { raw, start } = generateToken(PREFIX);
    expect(start).toBe(raw.slice(0, PREFIX.length + 8));
  });

  it("rejects a token whose body was mutated by a single character", () => {
    const { raw } = generateToken(PREFIX);
    const swap = raw[PREFIX.length] === "a" ? "b" : "a";
    const tampered = PREFIX + swap + raw.slice(PREFIX.length + 1);
    const result = parseToken(tampered, PREFIX);
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("API_TOKEN_MALFORMED");
  });

  it("rejects a wrong prefix, a wrong length, and a non-base58 character", () => {
    const { raw } = generateToken(PREFIX);
    expect(parseToken(raw.replace(PREFIX, "other_"), PREFIX).isFailure).toBe(true);
    expect(parseToken(`${raw}x`, PREFIX).isFailure).toBe(true);
    const withZero = `${PREFIX}0${raw.slice(PREFIX.length + 1)}`;
    expect(parseToken(withZero, PREFIX).isFailure).toBe(true);
  });

  it("generates distinct tokens", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateToken(PREFIX).raw));
    expect(seen.size).toBe(200);
  });

  it("hmac is deterministic per pepper and differs across peppers", () => {
    const { raw } = generateToken(PREFIX);
    expect(hmacToken(raw, PEPPER)).toBe(hmacToken(raw, PEPPER));
    expect(hmacToken(raw, PEPPER)).not.toBe(hmacToken(raw, "b".repeat(32)));
  });
});
