import { describe, expect, it } from "bun:test";
import { idParamSchema } from "../id-param";

describe("idParamSchema", () => {
  it.each([
    ["a uuidv7", "019a7c3e-5b2f-7d41-9c3a-2f6e8b1d4a90"],
    ["a random uuid", "3f2b8c1e-9d4a-4e6f-b7a2-1c5d8e9f0a3b"],
    ["an auth library id", "Xk9fQ2mLp7RtZ4vB8nW1cY6hJ3sD5gA0"],
    ["a Stripe event id", "evt_1QxYzAbCdEfGhIjK"],
  ])("accepts %s", (_label, id) => {
    expect(idParamSchema.parse({ id })).toEqual({ id });
  });

  it.each([
    ["an empty id", ""],
    ["a padded id", " abc "],
    ["a path traversal", "../users"],
    ["a quoted id", "abc'--"],
    ["an encoded slash", "abc%2Fdef"],
    ["an oversized id", "a".repeat(129)],
  ])("rejects %s", (_label, id) => {
    expect(idParamSchema.safeParse({ id }).success).toBe(false);
  });
});
