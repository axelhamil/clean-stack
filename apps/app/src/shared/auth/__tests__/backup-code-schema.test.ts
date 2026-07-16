import { describe, expect, it } from "vitest";
import { backupCodeVerifySchema } from "../auth.schema";

describe("backupCodeVerifySchema", () => {
  it("strips whitespace but preserves dashes", () => {
    const parsed = backupCodeVerifySchema.parse({ code: " abcde-12345 ", trustDevice: false });
    expect(parsed.code).toBe("abcde-12345");
  });

  it("auto-inserts dash on 10-alphanum input", () => {
    const parsed = backupCodeVerifySchema.parse({ code: "abcde12345", trustDevice: false });
    expect(parsed.code).toBe("abcde-12345");
  });

  it("strips embedded spaces and preserves dash", () => {
    const parsed = backupCodeVerifySchema.parse({ code: "ab cde-12 345", trustDevice: false });
    expect(parsed.code).toBe("abcde-12345");
  });

  it("rejects codes too short after normalization", () => {
    const result = backupCodeVerifySchema.safeParse({ code: "a-b c", trustDevice: false });
    expect(result.success).toBe(false);
  });
});
