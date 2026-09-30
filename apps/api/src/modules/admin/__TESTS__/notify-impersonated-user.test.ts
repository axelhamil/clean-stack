import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { notifyImpersonatedUser } from "../application/event-handlers/notify-impersonated-user";

const capture = mock(() => {});
const sendTemplate = mock(async () => Result.ok());

const instrumentation = {
  capture,
  startSpan: mock(() => {}),
  addBreadcrumb: mock(() => {}),
  setSpanAttributes: mock(() => {}),
};

const profileStore = { findLocale: mock(async () => Result.ok(Option.some("fr"))) };

const BASE_EVENT = {
  eventType: EventTypes.ADMIN_IMPERSONATION_STARTED,
  dateOccurred: new Date("2026-08-05T08:00:00.000Z"),
  aggregateId: "u-2",
  payload: {
    actorUserId: "admin-1",
    userId: "u-2",
    reason: "ticket #42",
    ip: "1.2.3.4",
    expiresAt: "2026-08-05T10:00:00.000Z",
  },
};

function handlerWith(getUser: () => Promise<unknown>) {
  return notifyImpersonatedUser({
    IEmailService: { sendTemplate },
    AdminQueryService: { getUser: mock(getUser) },
    IProfileStore: profileStore,
    IInstrumentation: instrumentation,
    supportUrl: "https://example.com/support",
  } as never);
}

describe("notifyImpersonatedUser", () => {
  beforeEach(() => {
    capture.mockClear();
    sendTemplate.mockClear();
  });

  it("emails the impersonated user with the reason and the expiry", async () => {
    const handler = handlerWith(async () =>
      Result.ok(Option.some({ email: "target@example.com", name: "Ada" })),
    );

    await handler.handle(BASE_EVENT);

    expect(sendTemplate).toHaveBeenCalledWith(
      "impersonation_started",
      "target@example.com",
      expect.objectContaining({
        userName: "Ada",
        reason: "ticket #42",
        supportUrl: "https://example.com/support",
        // The dates must be formatted in the recipient's locale, not in a
        // hardcoded one: "5 août 2026" is the French rendering.
        startedAt: expect.stringContaining("août"),
      }),
      { locale: "fr" },
    );
    expect(capture).not.toHaveBeenCalled();
  });

  it("sends nothing when the user cannot be found", async () => {
    const handler = handlerWith(async () => Result.ok(Option.none()));

    await handler.handle({
      ...BASE_EVENT,
      aggregateId: "u-99",
      payload: { ...BASE_EVENT.payload, userId: "u-99" },
    });

    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("sends nothing when the account lookup fails", async () => {
    const handler = handlerWith(async () =>
      Result.fail({ code: "ADMIN_QUERY_PROVIDER_FAILURE", message: "db error" }),
    );

    await handler.handle(BASE_EVENT);

    expect(sendTemplate).not.toHaveBeenCalled();
  });
});
