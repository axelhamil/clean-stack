import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { ProfileError } from "../../../shared/ports/profile.port";

const { unitOfWork, outcome } = mockUnitOfWork();

const mockFindLocale = mock(
  async (_userId: string): Promise<Result<Option<Locale>, ProfileError>> =>
    Result.ok(Option.none()),
);
const writeTransactions: unknown[] = [];
const mockSetLocale = mock(
  async (_userId: string, _locale: Locale): Promise<Result<void, ProfileError>> => {
    writeTransactions.push(UnitOfWorkContext.transaction());
    return Result.ok();
  },
);
const enqueueTransactions: unknown[] = [];
const outbox = mockPort<IOutboxRepository>();

function recordEnqueueTransaction() {
  outbox.enqueue.mockImplementation(async () => {
    enqueueTransactions.push(UnitOfWorkContext.transaction());
  });
}

mock.module("../../../container", () => ({
  di: {
    IProfileStore: { findLocale: mockFindLocale, setLocale: mockSetLocale },
    IOutboxRepository: outbox,
    ITransactionService: unitOfWork,
    PolicyAcceptanceService: { hasAcceptedCurrent: mock(async () => Result.ok(true)) },
  },
}));

let currentSession: Record<string, unknown> = {};

const realAuthMiddleware = await import("../../../shared/middleware/auth.middleware");
mock.module("../../../shared/middleware/auth.middleware", () => ({
  ...realAuthMiddleware,
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    c.set("session", currentSession);
    await next();
  },
}));

const { profileRoutes } = await import("../routes");
const { Hono } = await import("hono");
const { createErrorHandler } = await import("../../../shared/middleware/error.middleware");
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

const app = new Hono<{ Variables: { requestId: string } }>()
  .use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  })
  .route("/me", profileRoutes);
app.onError(createErrorHandler(new NoOpInstrumentation()));

function putLocale(locale: string) {
  return app.request("/me/locale", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale }),
  });
}

function emittedPayload() {
  return enqueuedEvents(outbox)[0]?.payload;
}

async function lastRunSettlement() {
  const [settled] = await Promise.allSettled([unitOfWork.run.mock.results.at(-1)?.value]);

  return settled?.status;
}

describe("PUT /me/locale", () => {
  beforeEach(() => {
    currentSession = {};
    mockFindLocale.mockClear();
    mockSetLocale.mockClear();
    outbox.enqueue.mockReset();
    recordEnqueueTransaction();
    unitOfWork.run.mockClear();
    writeTransactions.length = 0;
    enqueueTransactions.length = 0;
  });

  it("rejects a locale outside the supported set", async () => {
    const res = await putLocale("de");

    expect(res.status).toBe(400);
    expect(mockSetLocale).not.toHaveBeenCalled();
  });

  it("emits previousLocale as null when the user never chose one", async () => {
    const res = await putLocale("fr");

    expect(res.status).toBe(200);
    expect(emittedPayload()).toEqual({ userId: "user-1", locale: "fr", previousLocale: null });
  });

  it("carries the prior locale when one existed", async () => {
    mockFindLocale.mockImplementationOnce(async () => Result.ok(Option.some("en")));

    await putLocale("fr");

    expect(emittedPayload()).toEqual({ userId: "user-1", locale: "fr", previousLocale: "en" });
  });

  it("writes the locale and emits the event inside one committed unit of work", async () => {
    await putLocale("fr");

    expect(outcome()).toBe("committed");
    expect(mockSetLocale).toHaveBeenCalledWith("user-1", "fr");
    const [writeTx] = writeTransactions;
    const [enqueueTx] = enqueueTransactions;
    expect(writeTx).toBeDefined();
    expect(enqueueTx).toBe(writeTx);
  });

  it("emits nothing when the write fails", async () => {
    mockSetLocale.mockImplementationOnce(async () =>
      Result.fail({ code: "PROFILE_PROVIDER_FAILURE", message: "db down" }),
    );

    const res = await putLocale("fr");

    expect(res.status).toBe(502);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("rolls the unit back by returning the failure, not by throwing", async () => {
    mockFindLocale.mockImplementationOnce(async () =>
      Result.fail({ code: "PROFILE_PROVIDER_FAILURE", message: "db down" }),
    );

    const res = await putLocale("fr");

    expect(res.status).toBe(502);
    expect(outcome()).toBe("rolled_back");
    expect(await lastRunSettlement()).toBe("fulfilled");
  });

  it("refuses an impersonated session", async () => {
    currentSession = { impersonatedBy: "admin-1" };

    const res = await putLocale("fr");

    expect(res.status).toBe(403);
    expect(mockSetLocale).not.toHaveBeenCalled();
  });
});
