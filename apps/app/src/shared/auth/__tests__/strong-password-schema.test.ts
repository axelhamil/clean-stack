import { PASSWORD_LENGTH } from "@packages/access-control";
import { describe, expect, it } from "vitest";
import { strongPasswordSchema } from "../auth.schema";

describe("strongPasswordSchema", () => {
  it.each([
    [PASSWORD_LENGTH.min - 1, false],
    [PASSWORD_LENGTH.min, true],
    [PASSWORD_LENGTH.max, true],
    [PASSWORD_LENGTH.max + 1, false],
  ])("a password of %i characters is accepted: %s", (length, expected) => {
    expect(strongPasswordSchema.safeParse("a".repeat(length)).success).toBe(expected);
  });
});
