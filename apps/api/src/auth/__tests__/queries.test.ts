import { describe, expect, it, mock } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";

const outage = new Error("connection refused");

const realDrizzle = await import("@packages/drizzle");
mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  lockForTransaction: async () => {
    throw outage;
  },
}));

const { createAuthQueries } = await import("../queries");

describe("createAuthQueries", () => {
  it("reports a failing query to telemetry under its span and still throws it", async () => {
    const instrumentation = mockInstrumentation();

    await expect(createAuthQueries(instrumentation).lockSeatsOf("org-1")).rejects.toBe(outage);

    expect(instrumentation.capture).toHaveBeenCalledWith(outage);
    expect(instrumentation.startSpan).toHaveBeenCalledWith(
      { name: "AuthQueries > lockSeatsOf" },
      expect.any(Function),
    );
  });
});
