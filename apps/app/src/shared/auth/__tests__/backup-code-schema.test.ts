import { describe, expect, it } from "vitest";
import { backupCodeVerifySchema } from "../auth.schema";

describe("backupCodeVerifySchema", () => {
  it("strips dashes and whitespace from the code", () => {
    const parsed = backupCodeVerifySchema.parse({ code: " abcde-12345 ", trustDevice: false });
    expect(parsed.code).toBe("abcde12345");
  });

  it("rejects codes too short after normalization", () => {
    const result = backupCodeVerifySchema.safeParse({ code: "a-b c", trustDevice: false });
    expect(result.success).toBe(false);
  });
});
