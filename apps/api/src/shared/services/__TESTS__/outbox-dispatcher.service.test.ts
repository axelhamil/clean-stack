import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realDrizzle from "@packages/drizzle";
import { FakePgListenClient } from "./fake-pg-listen-client";

let transactionCalls = 0;

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  db: {
    execute: async () => undefined,
    transaction: async () => {
      transactionCalls++;
      throw new Error("connection refused");
    },
  },
}));

const { OutboxDispatcher } = await import("../outbox-dispatcher.service");

const fakeOutbox = {
  enqueue: async () => {},
  findPendingBatch: async () => [],
  markDispatched: async () => {},
  markFailed: async () => {},
};

function makeDispatcher() {
  const errors: string[] = [];
  const captured: unknown[] = [];
  const logger = {
    info() {},
    warn() {},
    debug() {},
    error: (_obj: unknown, msg: string) => errors.push(msg),
  };
  const instrumentation = {
    startSpan: <T>(_: unknown, fn: () => T) => fn(),
    capture: (err: unknown) => captured.push(err),
    addBreadcrumb() {},
    setSpanAttributes() {},
  };
  const client = new FakePgListenClient();
  const dispatcher = new OutboxDispatcher(
    fakeOutbox,
    [],
    logger as never,
    "postgres://unused",
    instrumentation,
    { createClient: () => client },
  );
  return { dispatcher, client, errors, captured };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("OutboxDispatcher", () => {
  beforeEach(() => {
    transactionCalls = 0;
  });

  test("a first drain that fails is logged and reported instead of crashing the process", async () => {
    const { dispatcher, errors, captured } = makeDispatcher();

    await dispatcher.start();
    await wait(10);

    expect(errors).toContain("outbox drain failed (start)");
    expect(captured).toHaveLength(1);

    await dispatcher.stop();
  });

  test("a NOTIFY on the listen connection triggers a drain", async () => {
    const { dispatcher, client, errors } = makeDispatcher();
    await dispatcher.start();
    await wait(10);
    const before = transactionCalls;

    client.deliver("event-1");
    await wait(10);

    expect(transactionCalls).toBe(before + 1);
    expect(errors).toContain("outbox drain failed (notify)");

    await dispatcher.stop();
  });
});
