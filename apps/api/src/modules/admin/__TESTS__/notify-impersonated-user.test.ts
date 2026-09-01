import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import * as realEvents from "@packages/events";
import { EventTypes } from "@packages/events";
import { z } from "zod";

const capture = mock(() => {});
const sendTemplate = mock(async () => Result.ok());

// mock.module leaks: drizzle-outbox.service.test.ts stubs ALL @packages/events payload
// schemas with { safeParse: () => ({ success: true, data: {} }) }. When this file runs
// after it, AdminImpersonationStartedPayload.safeParse returns empty data and
// new Date(undefined).toLocaleString() throws — sendTemplate is never reached.
// Re-mock with the real schema so the handler validates correctly regardless of run order.
const ActorRef = z.object({ actorUserId: z.string() });
const UserRef = z.object({ userId: z.string() });
const RealAdminImpersonationStartedPayload = ActorRef.merge(UserRef).extend({
  reason: z.string().min(1),
  ticketRef: z.string().optional(),
  ip: z.string().nullable(),
  expiresAt: z.string(),
});

// Superset rule: expose ALL EventTypes values so files loaded after this mock
// (e.g. scanning.routes.ts) don't receive undefined for unrelated event types.
// The real catalog, never a hand-kept copy: `mock.module` leaks across the whole
// process, so a stale copy here silently blanks every event type added since it
// was written — in *other* test files, wherever they happen to run after this one.
const FULL_EVENT_TYPES = EventTypes;

mock.module("@packages/events", () => ({
  // Spread first: a partial mock of this module leaks process-wide and turns
  // every export it forgets into `undefined` in unrelated test files.
  ...realEvents,
  EventTypes: FULL_EVENT_TYPES,
  AdminImpersonationStartedPayload: RealAdminImpersonationStartedPayload,
}));

const { notifyImpersonatedUser } = await import(
  "../application/event-handlers/notify-impersonated-user"
);

const instrumentation = {
  capture,
  startSpan: mock(() => {}),
  addBreadcrumb: mock(() => {}),
  setSpanAttributes: mock(() => {}),
};

const profileStore = (locale?: string) => ({
  findLocale: mock(async () => ({
    isSuccess: true,
    isFailure: false,
    getValue: () => ({ toUndefined: () => locale }),
  })),
});

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
      IProfileStore: profileStore("fr"),
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
        // The dates must be formatted in the recipient's locale, not in a
        // hardcoded one: "5 août 2026" is the French rendering.
        startedAt: expect.stringContaining("août"),
      }),
      { locale: "fr" },
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
      IProfileStore: profileStore("fr"),
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
      IProfileStore: profileStore("fr"),
      IInstrumentation: instrumentation,
      supportUrl: "https://example.com/support",
    } as never);

    await handler.handle(BASE_EVENT);

    expect(sendTemplate).not.toHaveBeenCalled();
  });
});
