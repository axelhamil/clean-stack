import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type IDomainEvent,
  NoOpInstrumentation,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createErrorHandler } from "../../shared/middleware/error.middleware";
import type { UserAccountError } from "../../shared/ports/user-account.port";

const { unitOfWork, outcome } = mockUnitOfWork();

const enqueueTransactions: unknown[] = [];
const mockEnqueue = mock(async (_events: IDomainEvent[], _meta: unknown) => {
  enqueueTransactions.push(UnitOfWorkContext.transaction());
});
const writeTransactions: unknown[] = [];
const mockSetName = mock(async (_userId: string, _name: string) => {
  writeTransactions.push(UnitOfWorkContext.transaction());
  return Result.ok<UserAccountError>();
});

mock.module("../../container", () => ({
  di: {
    PolicyAcceptanceService: { hasAcceptedCurrent: mock(async () => Result.ok(true)) },
    IOutboxRepository: { enqueue: mockEnqueue },
    ITransactionService: unitOfWork,
    IUserAccountStore: { setName: mockSetName },
  },
}));

const { mePublicRoutes } = await import("../v1/me.routes");

const injectTokenContext = createMiddleware(async (c, next) => {
  c.set("user" as never, { id: "user-1", name: "Old Name" });
  c.set("tokenScopes" as never, ["read:profile", "write:profile"]);
  await next();
});

const app = new Hono().use("*", injectTokenContext).route("/", mePublicRoutes);
app.onError(createErrorHandler(new NoOpInstrumentation()));

describe("PATCH /api/v1/me", () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    mockSetName.mockClear();
    writeTransactions.length = 0;
    enqueueTransactions.length = 0;
  });

  it("emits USER_PROFILE_UPDATED with the changed name, like the session path", async () => {
    const res = await app.request("/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(200);
    expect(outcome()).toBe("committed");
    const [writeTx] = writeTransactions;
    const [events] = mockEnqueue.mock.calls[0] ?? [];
    const [tx] = enqueueTransactions;
    expect(tx).toBeDefined();
    expect(tx).toBe(writeTx);
    expect(events?.[0]?.eventType).toBe(EventTypes.USER_PROFILE_UPDATED);
    expect(events?.[0]?.payload).toEqual({ userId: "user-1", changes: { name: "New Name" } });
  });

  it("rolls the event back and fails when the name cannot be saved", async () => {
    mockSetName.mockImplementationOnce(async () =>
      Result.fail<void, UserAccountError>({
        code: "USER_ACCOUNT_PROVIDER_FAILURE",
        message: "down",
      }),
    );

    const res = await app.request("/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(502);
    expect(outcome()).toBe("rolled_back");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
