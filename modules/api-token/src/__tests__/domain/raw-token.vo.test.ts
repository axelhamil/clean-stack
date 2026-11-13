import { describe, expect, it } from "bun:test";
import { hash } from "bun";
import { crc32, RawToken } from "../../domain/api-token/value-objects/raw-token.vo";
import { GOLDEN_BODY, GOLDEN_RAW, PREFIX } from "../fixtures";

const problemOf = (raw: string) => RawToken.parse(PREFIX, raw).getError().message;

describe("RawToken", () => {
  it("keeps the wire format of a known token bit for bit", () => {
    const issued = RawToken.issue(PREFIX, GOLDEN_BODY).getValue();

    expect(issued.value.raw).toBe(GOLDEN_RAW);
    expect(issued.start()).toBe("clean_3mJr7AoU");
    expect(RawToken.parse(PREFIX, GOLDEN_RAW).isSuccess).toBe(true);
  });

  it("computes the standard CRC32 the checksum is made of", () => {
    const payload = `${PREFIX}${GOLDEN_BODY}`;

    expect(crc32(payload)).toBe(637526488);
    expect(crc32(payload)).toBe(hash.crc32(payload));
    expect(crc32("préfixe_")).toBe(hash.crc32("préfixe_"));
    expect(crc32("")).toBe(0);
  });

  it("rejects a token whose last checksum character was changed", () => {
    expect(problemOf(`${GOLDEN_RAW.slice(0, -1)}2`)).toBe("checksum mismatch");
  });

  it("rejects a token whose body was mutated by a single character", () => {
    const tampered = `${PREFIX}4${GOLDEN_RAW.slice(PREFIX.length + 1)}`;

    expect(RawToken.parse(PREFIX, tampered).getError().code).toBe("API_TOKEN_MALFORMED");
  });

  it("rejects a wrong prefix, a wrong length and a non-base58 character", () => {
    expect(problemOf(GOLDEN_RAW.replace(PREFIX, "other_"))).toBe("unexpected prefix");
    expect(problemOf(`${GOLDEN_RAW}x`)).toBe("unexpected length");
    expect(problemOf(`${PREFIX}0${GOLDEN_RAW.slice(PREFIX.length + 1)}`)).toBe(
      "non-base58 character",
    );
  });
});
