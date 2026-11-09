import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type ILogger, Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import type { RouteGuard } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import type { Locale } from "@packages/i18n";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ProfileError } from "../application/ports/profile.port";
import { createProfileRoutes } from "../infrastructure/http/profile.routes";

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

let impersonating = false;

const refuseImpersonation: RouteGuard = async (_c, next) => {
  if (impersonating) throw new HTTPException(403, { message: "impersonating" });
  await next();
};

const app = new Hono<{ Variables: { requestId: string } }>()
  .use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  })
  .route(
    "/me",
    createProfileRoutes({
      routeGuards: {
        ...openRouteGuards({ userId: "user-1" }),
        denyImpersonated: refuseImpersonation,
      },
      ITransactionService: unitOfWork,
      IOutboxRepository: outbox,
      IProfileStore: { findLocale: mockFindLocale, setLocale: mockSetLocale },
    }),
  );
app.onError(
  createErrorHandler({
    instrumentation: mockInstrumentation(),
    logger: mockPort<ILogger>(),
    isProduction: false,
  }),
);

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
    impersonating = false;
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
    impersonating = true;

    const res = await putLocale("fr");

    expect(res.status).toBe(403);
    expect(mockSetLocale).not.toHaveBeenCalled();
  });
});
