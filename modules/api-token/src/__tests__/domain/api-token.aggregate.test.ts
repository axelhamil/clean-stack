import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { apiToken } from "../fixtures";

const NOW = new Date("2025-01-01T12:00:00Z");

describe("ApiToken.isUsable", () => {
  it("accepts a live token without expiry", () => {
    expect(apiToken().isUsable(NOW)).toBe(true);
  });

  it("accepts a token until its expiry instant", () => {
    expect(apiToken({ expiresAt: Option.some(NOW) }).isUsable(NOW)).toBe(true);
  });

  it("refuses a token past its expiry", () => {
    const expired = apiToken({ expiresAt: Option.some(new Date(NOW.getTime() - 1)) });

    expect(expired.isUsable(NOW)).toBe(false);
  });

  it("refuses a revoked token", () => {
    const token = apiToken();
    token.revoke("user", "user-1", NOW);

    expect(token.isUsable(NOW)).toBe(false);
  });
});
