import { describe, expect, it } from "bun:test";
import type { IInstrumentation } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { InMemoryHealthCheckRegistry } from "../infrastructure/in-memory-health-check-registry";

describe("InMemoryHealthCheckRegistry.runAll", () => {
  it("reports a check that throws and marks it failed", async () => {
    const instrumentation = mockPort<IInstrumentation>();
    const registry = new InMemoryHealthCheckRegistry(instrumentation);
    const crash = new Error("probe crashed");
    registry.register(
      "cache:redis",
      async () => {
        throw crash;
      },
      { critical: false },
    );

    const report = await registry.runAll();

    expect(report.checks[0]?.result).toEqual({ status: "fail", output: "probe crashed" });
    expect(report.status).toBe("warn");
    expect(instrumentation.capture).toHaveBeenCalledWith(crash);
  });
});
