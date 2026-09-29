import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type IDomainEvent, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import * as realAuthQueries from "../../auth-queries";

const mockEnqueue = mock(async (_events: IDomainEvent[]) => {});
const mockUpdateUserName = mock(async (_userId: string, _name: string) => {});

mock.module("../../container", () => ({
  di: {
    PolicyAcceptanceService: { hasAcceptedCurrent: mock(async () => Result.ok(true)) },
    IOutboxRepository: { enqueue: mockEnqueue },
  },
}));

mock.module("../../auth-queries", () => ({
  ...realAuthQueries,
  updateUserName: mockUpdateUserName,
}));

const { mePublicRoutes } = await import("../v1/me.routes");

const injectTokenContext = createMiddleware(async (c, next) => {
  c.set("user" as never, { id: "user-1", name: "Old Name" });
  c.set("tokenScopes" as never, ["read:profile", "write:profile"]);
  await next();
});

const app = new Hono().use("*", injectTokenContext).route("/", mePublicRoutes);

describe("PATCH /api/v1/me", () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    mockUpdateUserName.mockClear();
  });

  it("emits USER_PROFILE_UPDATED with the changed name, like the session path", async () => {
    const res = await app.request("/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateUserName).toHaveBeenCalledWith("user-1", "New Name");

    const [events] = mockEnqueue.mock.calls[0] ?? [];
    expect(events?.[0]?.eventType).toBe(EventTypes.USER_PROFILE_UPDATED);
    expect(events?.[0]?.payload).toEqual({ userId: "user-1", changes: { name: "New Name" } });
  });
});
