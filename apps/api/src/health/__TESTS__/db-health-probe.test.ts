import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { HealthCheckFn, IInstrumentation } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { mockPort } from "@packages/test/bun";
import type { IHealthCheckRegistry } from "../health.port";

let execute: () => Promise<unknown> = async () => [];

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  resolveExecutor: () => ({ execute: () => execute() }),
}));

const { DbHealthProbe } = await import("../infrastructure/db-health-probe");

const instrumentation = mockPort<IInstrumentation>();
const registry = mockPort<IHealthCheckRegistry>();

function registeredProbe(): HealthCheckFn {
  new DbHealthProbe(registry, instrumentation).onInit();
  const [, fn] = registry.register.mock.calls.at(-1) ?? [];
  if (!fn) throw new Error("db probe was not registered");

  return fn;
}

describe("DbHealthProbe", () => {
  beforeEach(() => {
    execute = async () => [];
    instrumentation.capture.mockReset();
    instrumentation.startSpan.mockReset();
    instrumentation.startSpan.mockImplementation((_options, callback) => callback());
    registry.register.mockReset();
  });

  it("passes when the database answers", async () => {
    const result = await registeredProbe()();

    expect(result.status).toBe("pass");
    expect(instrumentation.startSpan).toHaveBeenCalledWith(
      { name: "DbHealthProbe > probe" },
      expect.any(Function),
    );
  });

  it("fails and reports the error when the database is unreachable", async () => {
    const down = new Error("connection refused");
    execute = async () => {
      throw down;
    };

    const result = await registeredProbe()();

    expect(result.status).toBe("fail");
    expect(instrumentation.capture).toHaveBeenCalledWith(down);
  });
});
