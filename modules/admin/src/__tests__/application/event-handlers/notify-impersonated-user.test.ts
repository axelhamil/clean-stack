import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { EmailError, IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import type { Locale } from "@packages/i18n";
import { mockPort } from "@packages/test/bun";
import { notifyImpersonatedUser } from "../../../application/event-handlers/notify-impersonated-user";
import type { ILocaleReader } from "../../../application/ports/services/locale-reader.port";
import type { AdminUserDetail, IGetUserQuery } from "../../../application/queries/get-user.query";
import type { AdminQueryError } from "../../../application/queries/list-users.query";
import { NotifyImpersonatedUserUseCase } from "../../../application/usecases/notify-impersonated-user/notify-impersonated-user.usecase";

const sendTemplate = mock(async (): Promise<Result<void, EmailError>> => Result.ok());

const localeReader: ILocaleReader = { localeOf: mock(async (): Promise<Locale> => "fr") };

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

const TARGET: AdminUserDetail = {
  id: "u-2",
  email: "target@example.com",
  name: "Ada",
  banned: false,
  banReason: Option.none(),
  banExpires: Option.none(),
  twoFactorEnabled: false,
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  sessions: [],
  memberships: [],
};

function handlerWith(getUser: () => Promise<Result<Option<AdminUserDetail>, AdminQueryError>>) {
  const users = mockPort<IGetUserQuery>();
  users.execute.mockImplementation(getUser);
  const emails = mockPort<IEmailService>();
  emails.sendTemplate.mockImplementation(sendTemplate);

  return notifyImpersonatedUser({
    NotifyImpersonatedUserUseCase: new NotifyImpersonatedUserUseCase(
      users,
      emails,
      localeReader,
      "https://example.com/support",
    ),
  });
}

describe("notifyImpersonatedUser", () => {
  beforeEach(() => {
    sendTemplate.mockClear();
  });

  it("emails the impersonated user with the reason and the expiry", async () => {
    const handler = handlerWith(async () => Result.ok(Option.some(TARGET)));

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
    const handler = handlerWith(async () => Result.ok(Option.some(TARGET)));

    await expect(handler.handle(BASE_EVENT)).rejects.toThrow("EMAIL_PROVIDER_FAILURE");
  });

  it("given a redelivered event, when handled twice, then both sends carry the same idempotency key", async () => {
    const handler = handlerWith(async () => Result.ok(Option.some(TARGET)));
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
