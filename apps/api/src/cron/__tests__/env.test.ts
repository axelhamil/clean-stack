import { describe, expect, it } from "bun:test";
import { DEFAULT_INTERNAL_FETCH_TIMEOUT_MS } from "../../shared/internal-routes/internal-fetch";
import { cronEnvSchema } from "../env";

const VALID = {
  API_URL: "http://api:3000",
  INTERNAL_SIGNING_KEY: "k".repeat(32),
};

describe("cronEnvSchema", () => {
  it("falls back to the default fetch timeout when none is set", () => {
    const env = cronEnvSchema.parse(VALID);

    expect(env.INTERNAL_FETCH_TIMEOUT_MS).toBe(DEFAULT_INTERNAL_FETCH_TIMEOUT_MS);
  });

  it("refuses to start without the API url", () => {
    expect(cronEnvSchema.safeParse({ ...VALID, API_URL: undefined }).success).toBe(false);
  });

  it("refuses a signing key shorter than 32 characters", () => {
    expect(cronEnvSchema.safeParse({ ...VALID, INTERNAL_SIGNING_KEY: "short" }).success).toBe(
      false,
    );
  });

  it("refuses a fetch timeout under one second", () => {
    expect(cronEnvSchema.safeParse({ ...VALID, INTERNAL_FETCH_TIMEOUT_MS: "500" }).success).toBe(
      false,
    );
  });
});
