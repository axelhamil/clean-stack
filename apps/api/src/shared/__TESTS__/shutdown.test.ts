import { afterEach, describe, expect, it, mock } from "bun:test";
import { mockPort } from "@packages/test/bun";
import type { Logger } from "pino";
import { drainHttpServer, installShutdown, runShutdown, type ShutdownStep } from "../shutdown";

const never = () => new Promise<void>(() => {});

function given() {
  const logger = mockPort<Logger>();
  const exit = mock<(code: number) => void>();
  const ran: string[] = [];
  const finished: string[] = [];

  const step = (
    name: string,
    behavior: () => Promise<void> = async () => {},
    timeoutMs?: number,
  ): ShutdownStep => ({
    name,
    ...(timeoutMs !== undefined && { timeoutMs }),
    run: async () => {
      ran.push(name);
      await behavior();
      finished.push(name);
    },
  });

  const flushOnDeadline = mock(async () => {
    ran.push("deadline flush");
  });

  const stop = (steps: ShutdownStep[], deadlineMs = 1_000) =>
    runShutdown(steps, { deadlineMs, logger, exit, flushOnDeadline });

  const loggedSteps = () =>
    logger.error.mock.calls.map(([fields]) =>
      typeof fields === "object" && fields !== null && "step" in fields ? fields.step : undefined,
    );

  return { logger, exit, ran, finished, step, stop, flushOnDeadline, loggedSteps };
}

describe("runShutdown", () => {
  it("steps run in order, one after the other", async () => {
    const { ran, finished, step, stop } = given();
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

    await stop([step("http", slow), step("workers"), step("database-pool")]);

    expect(ran).toEqual(["http", "workers", "database-pool"]);
    expect(finished).toEqual(["http", "workers", "database-pool"]);
  });

  it("a step that throws is logged and the next one still runs, exit code is 1", async () => {
    const { exit, ran, step, stop, loggedSteps } = given();

    await stop([step("workers", () => Promise.reject(new Error("boom"))), step("database-pool")]);

    expect(ran).toEqual(["workers", "database-pool"]);
    expect(loggedSteps()).toEqual(["workers"]);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("a step that exceeds its timeout is abandoned and exit code is 1", async () => {
    const { exit, ran, finished, step, stop, loggedSteps } = given();

    await stop([step("http", never, 10), step("database-pool")]);

    expect(ran).toEqual(["http", "database-pool"]);
    expect(finished).toEqual(["database-pool"]);
    expect(loggedSteps()).toEqual(["http"]);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("a step bound to a timed-out step is skipped and logged, the next one still runs", async () => {
    const { exit, ran, logger, step, stop } = given();

    await stop([
      step("workers", never, 10),
      { ...step("database-pool"), skipAfterTimeoutOf: "workers" },
      step("telemetry-flush"),
    ]);

    expect(ran).toEqual(["workers", "telemetry-flush"]);
    expect(logger.warn.mock.calls).toEqual([
      [{ step: "database-pool", timedOut: "workers" }, "shutdown step skipped"],
    ]);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("a step bound to a step that finished runs", async () => {
    const { exit, ran, step, stop } = given();

    await stop([step("workers"), { ...step("database-pool"), skipAfterTimeoutOf: "workers" }]);

    expect(ran).toEqual(["workers", "database-pool"]);
    expect(exit.mock.calls).toEqual([[0]]);
  });

  it("the global deadline exits 1 and runs the flush", async () => {
    const { exit, ran, step, stop, flushOnDeadline } = given();

    await stop([step("http", never, 500), step("database-pool")], 20);

    expect(ran).toEqual(["http", "deadline flush"]);
    expect(flushOnDeadline).toHaveBeenCalledTimes(1);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("all steps done exits 0", async () => {
    const { exit, step, stop } = given();

    await stop([step("http"), step("database-pool")]);

    expect(exit.mock.calls).toEqual([[0]]);
  });
});

describe("drainHttpServer", () => {
  function fakeServer(inFlight: Promise<void>) {
    const stops: boolean[] = [];
    const server = {
      stop: async (closeActiveConnections = false) => {
        stops.push(closeActiveConnections);
        if (!closeActiveConnections) await inFlight;
      },
    };

    return { server, stops };
  }

  it("a slow in-flight request completes and nothing is cut", async () => {
    let completed = false;
    const inFlight = new Promise<void>((resolve) =>
      setTimeout(() => {
        completed = true;
        resolve();
      }, 20),
    );
    const { server, stops } = fakeServer(inFlight);

    await drainHttpServer(server, 400);

    expect(completed).toBe(true);
    expect(stops).toEqual([false]);
  });

  it("a never-ending stream is cut and the step stays within its budget", async () => {
    const { server, stops } = fakeServer(never());
    const startedAt = performance.now();

    await drainHttpServer(server, 400);

    expect(stops).toEqual([false, true]);
    expect(performance.now() - startedAt).toBeLessThan(400);
  });
});

describe("installShutdown", () => {
  let uninstall: () => void = () => {};

  afterEach(() => uninstall());

  it("a second signal exits 1 at once", () => {
    const { logger, exit, step } = given();
    uninstall = installShutdown([step("http", never, 1_000)], {
      deadlineMs: 5_000,
      logger,
      exit,
    });

    process.emit("SIGTERM");
    process.emit("SIGTERM");

    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("an uninstalled shutdown no longer reacts to signals", () => {
    const { logger, exit, step } = given();
    const listenersBefore = process.listenerCount("SIGTERM");
    installShutdown([step("http")], { deadlineMs: 5_000, logger, exit })();

    expect(process.listenerCount("SIGTERM")).toBe(listenersBefore);
  });
});
