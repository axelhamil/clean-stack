import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";

const capture = mock(() => {});
const sendTemplate = mock(async () => Result.ok());

const { notifyImpersonatedUser } = await import(
  "../application/event-handlers/notify-impersonated-user"
);

const instrumentation = { capture, startSpan: mock(() => {}), addBreadcrumb: mock(() => {}) };

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

describe("notifyImpersonatedUser", () => {
  it("envoie l'e-mail à l'utilisateur impersonné avec la raison et l'échéance", async () => {
    const handler = notifyImpersonatedUser({
      IEmailService: { sendTemplate },
      AdminQueryService: {
        getUser: mock(async () => ({
          isSuccess: true,
          isFailure: false,
          getValue: () => ({
            isNone: () => false,
            unwrap: () => ({ email: "target@example.com", name: "Ada" }),
          }),
        })),
      },
      IInstrumentation: instrumentation,
      supportUrl: "https://example.com/support",
    } as never);

    await handler.handle(BASE_EVENT);

    expect(sendTemplate).toHaveBeenCalledWith(
      "impersonation_started",
      "target@example.com",
      expect.objectContaining({
        userName: "Ada",
        reason: "ticket #42",
        supportUrl: "https://example.com/support",
      }),
    );
    expect(capture).not.toHaveBeenCalled();
  });

  it("ne tente pas d'envoyer l'e-mail si l'utilisateur est introuvable", async () => {
    sendTemplate.mockClear();

    const handler = notifyImpersonatedUser({
      IEmailService: { sendTemplate },
      AdminQueryService: {
        getUser: mock(async () => ({
          isSuccess: true,
          isFailure: false,
          getValue: () => ({
            isNone: () => true,
            unwrap: () => {
              throw new Error("none");
            },
          }),
        })),
      },
      IInstrumentation: instrumentation,
      supportUrl: "https://example.com/support",
    } as never);

    await handler.handle({
      ...BASE_EVENT,
      aggregateId: "u-99",
      payload: { ...BASE_EVENT.payload, userId: "u-99" },
    });

    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("ne tente pas d'envoyer l'e-mail si la lecture du compte échoue", async () => {
    sendTemplate.mockClear();

    const handler = notifyImpersonatedUser({
      IEmailService: { sendTemplate },
      AdminQueryService: {
        getUser: mock(async () => ({
          isSuccess: false,
          isFailure: true,
          getError: () => ({ code: "ADMIN_QUERY_PROVIDER_FAILURE", message: "db error" }),
        })),
      },
      IInstrumentation: instrumentation,
      supportUrl: "https://example.com/support",
    } as never);

    await handler.handle(BASE_EVENT);

    expect(sendTemplate).not.toHaveBeenCalled();
  });
});
