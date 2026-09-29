import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";
import type { ProfileError } from "../../../shared/ports/profile.port";

const TX = { sentinel: "transaction" };

const mockFindLocale = mock(
  async (_userId: string, _tx?: unknown): Promise<Result<Option<Locale>, ProfileError>> =>
    Result.ok(Option.none()),
);
const mockSetLocale = mock(
  async (_userId: string, _locale: Locale, _tx?: unknown): Promise<Result<void, ProfileError>> =>
    Result.ok(),
);
const mockEnqueue = mock(async (_events: unknown, _meta: unknown, _tx?: unknown) => {});

mock.module("../../../container", () => ({
  di: {
    IProfileStore: { findLocale: mockFindLocale, setLocale: mockSetLocale },
    IOutboxRepository: { enqueue: mockEnqueue },
    ITransactionService: {
      run: async (callback: (tx: unknown) => Promise<unknown>) => callback(TX),
    },
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
  const [events] = (mockEnqueue.mock.calls[0] ?? []) as [{ payload: unknown }[]?];
  return events?.[0]?.payload;
}

describe("PUT /me/locale", () => {
  beforeEach(() => {
    currentSession = {};
    mockFindLocale.mockClear();
    mockSetLocale.mockClear();
    mockEnqueue.mockClear();
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

  it("writes the locale and emits the event in the same transaction", async () => {
    await putLocale("fr");

    expect(mockSetLocale.mock.calls[0]?.[2]).toBe(TX);
    expect(mockEnqueue.mock.calls[0]?.[2]).toBe(TX);
  });

  it("emits nothing when the write fails", async () => {
    mockSetLocale.mockImplementationOnce(async () =>
      Result.fail({ code: "PROFILE_PROVIDER_FAILURE", message: "db down" }),
    );

    const res = await putLocale("fr");

    expect(res.status).toBe(502);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("refuses an impersonated session", async () => {
    currentSession = { impersonatedBy: "admin-1" };

    const res = await putLocale("fr");

    expect(res.status).toBe(403);
    expect(mockSetLocale).not.toHaveBeenCalled();
  });
});
