import { describe, expect, it } from "bun:test";
import { BASE58_ALPHABET } from "../../../domain/api-token/value-objects/raw-token.vo";
import {
  cryptoTokenHasher,
  generateToken,
  hmacToken,
  parseToken,
} from "../../../infra/adapters/crypto-token-hasher.adapter";
import { GOLDEN_RAW, PREFIX } from "../../fixtures";

describe("cryptoTokenHasher", () => {
  it("keeps the digest of a known token bit for bit under both peppers", () => {
    expect(hmacToken(GOLDEN_RAW, "p".repeat(32))).toBe(
      "oX2izedzUlMGuA02FROD6Vf17r7p26MbjXHGR3eI5_w",
    );
    expect(cryptoTokenHasher.hmac(GOLDEN_RAW, "previous-pepper")).toBe(
      "A5bn_S1LS7h6e4JsaOgeAKUSZKLmKfcgVrIBxTz5NgU",
    );
  });

  it("draws a 44 character base58 body", () => {
    const body = cryptoTokenHasher.randomBody();

    expect(body).toHaveLength(44);
    expect([...body].every((char) => BASE58_ALPHABET.includes(char))).toBe(true);
  });

  it("generates distinct tokens that parse back, with a start of the prefix plus 8 chars", () => {
    const generated = Array.from({ length: 200 }, () => generateToken(PREFIX));

    expect(new Set(generated.map(({ raw }) => raw)).size).toBe(200);
    for (const { raw, start } of generated) {
      expect(parseToken(raw, PREFIX).isSuccess).toBe(true);
      expect(start).toBe(raw.slice(0, PREFIX.length + 8));
    }
  });
});
