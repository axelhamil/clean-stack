import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { EmailError } from "../../../shared/ports/email.port";
import { notifyImpersonatedUser } from "../application/event-handlers/notify-impersonated-user";

const sendTemplate = mock(async (): Promise<Result<void, EmailError>> => Result.ok());

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
    supportUrl: "https://example.com/support",
  } as never);
}

describe("notifyImpersonatedUser", () => {
  beforeEach(() => {
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

  it("given a failing account lookup, when handled, then it throws so the delivery is retried", async () => {
    const handler = handlerWith(async () =>
      Result.fail({ code: "ADMIN_QUERY_PROVIDER_FAILURE", message: "db error" }),
    );

    await expect(handler.handle(BASE_EVENT)).rejects.toThrow("ADMIN_QUERY_PROVIDER_FAILURE");

    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("given a failing email send, when handled, then it throws so the delivery is retried", async () => {
    sendTemplate.mockImplementationOnce(async () =>
      Result.fail({ code: "EMAIL_PROVIDER_FAILURE" as const, message: "boom" }),
    );
    const handler = handlerWith(async () =>
      Result.ok(Option.some({ email: "target@example.com", name: "Ada" })),
    );

    await expect(handler.handle(BASE_EVENT)).rejects.toThrow("EMAIL_PROVIDER_FAILURE");
  });

  it("given a redelivered event, when handled twice, then both sends carry the same idempotency key", async () => {
    const handler = handlerWith(async () =>
      Result.ok(Option.some({ email: "target@example.com", name: "Ada" })),
    );
    const event = { ...BASE_EVENT, eventId: "evt-42" };

    await handler.handle(event);
    await handler.handle(event);

    const keys = sendTemplate.mock.calls.map((call) => (call as unknown[])[3]);
    expect(keys).toEqual([
      { locale: "fr", idempotencyKey: "notify-impersonated-user:evt-42" },
      { locale: "fr", idempotencyKey: "notify-impersonated-user:evt-42" },
    ]);
  });
});
