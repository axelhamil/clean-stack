import { describe, expect, it } from "bun:test";
import {
  buildSignatureHeader,
  type CanonicalInput,
  canonicalize,
  parseSignatureHeader,
  sign,
  verify,
} from "../internal-routes/internal-signature";

const KEY = "test-signing-key-with-at-least-32-chars!!";

const baseInput: CanonicalInput = {
  timestamp: 1700000000,
  method: "POST",
  path: "/internal/rgpd-sweep",
  host: "api.example.com",
  contentType: "application/json",
  rawBody: '{"dryRun":false}',
};

describe("internal-signature", () => {
  describe("parseSignatureHeader", () => {
    it("should roundtrip with buildSignatureHeader", () => {
      expect(parseSignatureHeader(buildSignatureHeader(1700000000, "abc"))).toEqual({
        t: 1700000000,
        v1: "abc",
      });
    });

    it("should return null on malformed input (missing v1, NaN timestamp, or empty)", () => {
      expect(parseSignatureHeader("t=1700000000")).toBeNull();
      expect(parseSignatureHeader("t=NaN,v1=abc")).toBeNull();
      expect(parseSignatureHeader("")).toBeNull();
    });
  });

  describe("verify", () => {
    it("should accept matching strings and reject any mismatch (length or content)", () => {
      expect(verify("abc", "abc")).toBe(true);
      expect(verify("abc", "abcd")).toBe(false);
      expect(verify("aaa", "aab")).toBe(false);
    });
  });

  describe("sign", () => {
    it("should be deterministic and emit 64-char lowercase hex", async () => {
      const a = await sign("hello", KEY);
      const b = await sign("hello", KEY);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("canonicalize (variante C contract)", () => {
    it("should produce a different message when ANY signed component changes", () => {
      const base = canonicalize(baseInput);
      const variants = [
        { ...baseInput, method: "GET" },
        { ...baseInput, path: "/internal/billing-sweep" },
        { ...baseInput, host: "staging.api.example.com" },
        { ...baseInput, contentType: "application/x-www-form-urlencoded" },
        { ...baseInput, rawBody: '{"dryRun":true}' },
        { ...baseInput, timestamp: baseInput.timestamp + 1 },
      ];
      for (const v of variants) expect(canonicalize(v)).not.toBe(base);
    });

    it("should normalize equivalent inputs to the same message", () => {
      const equivalents: [CanonicalInput, CanonicalInput][] = [
        [baseInput, { ...baseInput, host: "API.EXAMPLE.COM" }],
        [baseInput, { ...baseInput, host: "api.example.com:443" }],
        [baseInput, { ...baseInput, host: "api.example.com:80" }],
        [baseInput, { ...baseInput, contentType: "application/json; charset=utf-8" }],
        [
          { ...baseInput, method: "POST" },
          { ...baseInput, method: "post" },
        ],
        [
          { ...baseInput, contentType: null },
          { ...baseInput, contentType: "" },
        ],
      ];
      for (const [a, b] of equivalents) expect(canonicalize(a)).toBe(canonicalize(b));
    });
  });
});
