import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { INotificationDigestStore } from "@modules/notifications/application/ports/notification-digest.port";
import { Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { sweepSpans } from "@packages/http/sweep-span";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { HTTPException } from "hono/http-exception";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";

const email = mockPort<IEmailService>();
const store = mockPort<INotificationDigestStore>();
const { unitOfWork, outcome } = mockUnitOfWork();

mock.module("../../../container", () => ({
  di: {
    ITransactionService: unitOfWork,
    IEmailService: email,
    INotificationDigestStore: store,
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
  locale: Option.fromNullable(locale),
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
    expect(digests[0]?.locale.toNull()).toBe("fr");
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

const run = () =>
  flushDueNotifications({
    batchSize: 500,
    dryRun: false,
    logger,
    spans: sweepSpans(new NoOpInstrumentation()),
  });

function givenLock(granted: boolean) {
  store.beginFlush.mockResolvedValue(Result.ok(granted));
  store.claimDue.mockResolvedValueOnce(
    Result.ok([{ ...row("u1", "billing", "n1"), emailStillWanted: true }]),
  );
  store.claimDue.mockResolvedValue(Result.ok([]));
  store.markSent.mockResolvedValue(Result.ok());
  store.dropUnwanted.mockResolvedValue(Result.ok());
}

beforeEach(() => {
  store.beginFlush.mockReset();
  store.claimDue.mockReset();
  store.markSent.mockReset();
  store.dropUnwanted.mockReset();
  email.sendTemplateBatch.mockReset();
  email.sendTemplateBatch.mockResolvedValue(Result.ok());
});

describe("flushDueNotifications single-flight", () => {
  test("given the advisory lock is held by another run, when a flush starts, then it skips and sends nothing", async () => {
    givenLock(false);

    const response = await run();

    expect(response).toEqual({ dryRun: false, skipped: true, flushed: 0, notifications: 0 });
    expect(store.claimDue).not.toHaveBeenCalled();
    expect(email.sendTemplateBatch).not.toHaveBeenCalled();
  });

  test("given the lock is granted inside the flush transaction, when a flush starts, then that transaction claims and mails the due rows", async () => {
    givenLock(true);

    const response = await run();

    expect(response).toEqual({ dryRun: false, skipped: false, flushed: 1, notifications: 1 });
    expect(store.markSent).toHaveBeenCalledWith(["n1"], expect.any(Date));
    expect(email.sendTemplateBatch).toHaveBeenCalledTimes(1);
  });
});

describe("flushDueNotifications when the digest cannot be enqueued", () => {
  test("given the e-mail queue refuses the batch, when a flush runs, then the unit rolls back by returning the failure and the run fails", async () => {
    givenLock(true);
    email.sendTemplateBatch.mockResolvedValue(
      Result.fail({ code: "EMAIL_PROVIDER_FAILURE", message: "queue down" }),
    );

    const failure = await run().catch((err: unknown) => err);
    const [settled] = await Promise.allSettled([unitOfWork.run.mock.results.at(-1)?.value]);

    expect(failure).toBeInstanceOf(HTTPException);
    expect(outcome()).toBe("rolled_back");
    expect(settled?.status).toBe("fulfilled");
  });
});
