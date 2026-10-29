import { describe, expect, it } from "bun:test";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "./mock-instrumentation";

interface Clock {
  now(): number;
  load(key: string): Promise<string>;
}

describe("mockPort", () => {
  it("mockPort returns the same mock for the same method", () => {
    const clock = mockPort<Clock>();

    clock.now();

    expect(clock.now).toBe(clock.now);
    expect(clock.now).toHaveBeenCalledTimes(1);
  });

  it("awaiting a mockPort resolves to the port itself, not a hang", async () => {
    const clock = mockPort<Clock>();

    const awaited = await Promise.resolve(clock);

    expect(awaited).toBe(clock);
  });

  it("mockPort stubs a method result with mockResolvedValue", async () => {
    const clock = mockPort<Clock>();
    clock.load.mockResolvedValue("cached");

    const loaded = await clock.load("key");

    expect(loaded).toBe("cached");
    expect(clock.load).toHaveBeenCalledWith("key");
  });
});

describe("mockInstrumentation", () => {
  it("mockInstrumentation startSpan returns the work value and propagates its rejection", async () => {
    const instrumentation = mockInstrumentation();
    const failure = new Error("boom");

    const value = await instrumentation.startSpan({ name: "Repo > read" }, async () => 42);
    const rejected = instrumentation.startSpan({ name: "Repo > write" }, async () => {
      throw failure;
    });

    expect(value).toBe(42);
    await expect(rejected).rejects.toBe(failure);
    expect(instrumentation.startSpan).toHaveBeenCalledTimes(2);
  });
});
