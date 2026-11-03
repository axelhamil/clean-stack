import { describe, expect, mock, test } from "bun:test";
import { Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { sweepSpans } from "../sweep-span";

const sendTemplateBatch = mock(async () => Result.ok());
let flushTx: unknown;

mock.module("../../../container", () => ({
  di: {
    ITransactionService: {
      run: <T>(work: () => Promise<T>) => UnitOfWorkContext.run(flushTx, work),
    },
    IEmailService: { sendTemplateBatch },
  },
}));

const { beatOfFlush, buildDigests, digestIdempotencyKey, flushDueNotifications } = await import(
  "../flush-notification-emails.route"
);

const logger = { info: () => {}, error: () => {} } as never;

const row = (userId: string, category: string, id: string, locale: string | null = null) => ({
  id,
  userId,
  category,
  eventType: "billing.payment.failed",
  email: `${userId}@example.com`,
  locale,
  payload: {},
});

describe("buildDigests", () => {
  test("groups by user and by category", () => {
    const digests = buildDigests([
      row("u1", "billing", "n1"),
      row("u1", "billing", "n2"),
      row("u1", "org", "n3"),
      row("u2", "billing", "n4"),
    ]);

    expect(digests).toHaveLength(3);
    const billingU1 = digests.find((d) => d.userId === "u1" && d.category === "billing");
    expect(billingU1?.notificationIds).toEqual(["n1", "n2"]);
  });

  test("an empty batch produces no digest", () => {
    expect(buildDigests([])).toEqual([]);
  });

  test("keeps the recipient locale on the digest", () => {
    const digests = buildDigests([row("u1", "billing", "n1", "fr")]);
    expect(digests[0]?.locale).toBe("fr");
  });
});

describe("digestIdempotencyKey", () => {
  test("produces a fixed-length key whatever the number of ids", async () => {
    const key2 = await digestIdempotencyKey(["n1", "n2"]);
    const key500 = await digestIdempotencyKey(Array.from({ length: 500 }, (_, i) => `n${i}`));
    expect(key2).toHaveLength(64);
    expect(key500).toHaveLength(64);
  });
});

describe("beatOfFlush", () => {
  test("records a real run with what it flushed", () => {
    const beat = beatOfFlush({ dryRun: false, skipped: false, flushed: 3, notifications: 9 });

    expect(beat).toEqual({ outcome: "ok", count: 3 });
  });

  test("leaves the last real run in place when refused the lock or dry", () => {
    expect(beatOfFlush({ dryRun: false, skipped: true, flushed: 0, notifications: 0 })).toBe(
      undefined,
    );
    expect(beatOfFlush({ dryRun: true, flushed: 0, notifications: 0 })).toBe(undefined);
  });
});

function chainResolving(value: unknown): unknown {
  const chain: unknown = new Proxy(() => {}, {
    get: (_, prop) =>
      prop === "then" ? (resolve: (v: unknown) => void) => resolve(value) : () => chain,
  });
  return chain;
}

function fakeFlushTx(lockGranted: boolean) {
  const dueRow = { ...row("u1", "billing", "n1"), emailStillWanted: true };
  const select = mock(() => chainResolving([dueRow]));
  const tx = {
    execute: mock(async () => ({ rows: [{ locked: lockGranted }] })),
    select,
    update: () => chainResolving(undefined),
  };
  return { tx, select };
}

const run = () =>
  flushDueNotifications({
    batchSize: 500,
    dryRun: false,
    logger,
    spans: sweepSpans(new NoOpInstrumentation()),
  });

describe("flushDueNotifications single-flight", () => {
  test("given the advisory lock is held by another run, when a flush starts, then it skips and sends nothing", async () => {
    const { tx, select } = fakeFlushTx(false);
    flushTx = tx;
    sendTemplateBatch.mockClear();

    const response = await run();

    expect(response).toEqual({ dryRun: false, skipped: true, flushed: 0, notifications: 0 });
    expect(select).not.toHaveBeenCalled();
    expect(sendTemplateBatch).not.toHaveBeenCalled();
  });

  test("given the lock is granted inside the flush transaction, when a flush starts, then that transaction claims and mails the due rows", async () => {
    const { tx, select } = fakeFlushTx(true);
    flushTx = tx;
    sendTemplateBatch.mockClear();

    const response = await run();

    expect(response).toEqual({ dryRun: false, skipped: false, flushed: 1, notifications: 1 });
    expect(select).toHaveBeenCalled();
    expect(sendTemplateBatch).toHaveBeenCalledTimes(1);
  });
});
