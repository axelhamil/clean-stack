import { describe, expect, it, mock } from "bun:test";

mock.module("@sentry/bun", () => ({
  init: mock(() => {}),
  pinoIntegration: mock(() => ({})),
  startSpan: mock(async (_opts: unknown, cb: () => unknown) => cb()),
  withScope: mock((_cb: (scope: unknown) => void) => {}),
  captureException: mock((_err: unknown) => {}),
  addBreadcrumb: mock((_crumb: unknown) => {}),
  setTag: mock((_key: string, _value: string) => {}),
  setUser: mock((_user: unknown) => {}),
  setContext: mock((_key: string, _ctx: unknown) => {}),
}));

const { scrubEvent } = await import("../services/sentry-init");

describe("scrubEvent", () => {
  it("strips PII request fields and preserves other request data", () => {
    const event = {
      request: {
        cookies: "session=abc",
        data: { password: "secret" },
        query_string: "token=xyz",
        headers: {
          cookie: "session=abc",
          Cookie: "session=abc",
          authorization: "Bearer token",
          Authorization: "Bearer token",
          "x-csrf-token": "csrf-value",
          "content-type": "application/json",
        },
      },
    };

    const result = scrubEvent(event as unknown as Parameters<typeof scrubEvent>[0]);

    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.data).toBeUndefined();
    expect(result.request?.query_string).toBeUndefined();

    const headers = result.request?.headers as Record<string, string | undefined>;
    expect(headers.cookie).toBeUndefined();
    expect(headers.Cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(headers["x-csrf-token"]).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
  });

  it("strips PII user fields but preserves user.id", () => {
    const event = {
      user: {
        id: "keep-me",
        email: "a@b.c",
        username: "u",
        ip_address: "1.1.1.1",
      },
    };

    const result = scrubEvent(event as unknown as Parameters<typeof scrubEvent>[0]);

    expect(result.user?.id).toBe("keep-me");
    expect(result.user?.email).toBeUndefined();
    expect(result.user?.username).toBeUndefined();
    expect(result.user?.ip_address).toBeUndefined();
  });

  it("handles events with no request or user fields without throwing", () => {
    const event = { message: "bare event" };
    expect(() => scrubEvent(event as unknown as Parameters<typeof scrubEvent>[0])).not.toThrow();
    const result = scrubEvent(event as unknown as Parameters<typeof scrubEvent>[0]);
    expect(result.message).toBe("bare event");
  });

  it("combined: strips all PII and preserves user.id", () => {
    const event = {
      request: {
        cookies: "x",
        data: { body: "y" },
        query_string: "q=z",
        headers: {
          cookie: "x",
          Cookie: "x",
          authorization: "x",
          Authorization: "x",
          "x-csrf-token": "x",
          "content-type": "application/json",
        },
      },
      user: {
        id: "keep-me",
        email: "a@b.c",
        username: "u",
        ip_address: "1.1.1.1",
      },
    };

    const result = scrubEvent(event as unknown as Parameters<typeof scrubEvent>[0]);

    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.data).toBeUndefined();
    expect(result.request?.query_string).toBeUndefined();
    const h = result.request?.headers as Record<string, string | undefined>;
    expect(h.cookie).toBeUndefined();
    expect(h.Cookie).toBeUndefined();
    expect(h.authorization).toBeUndefined();
    expect(h.Authorization).toBeUndefined();
    expect(h["x-csrf-token"]).toBeUndefined();
    // whitelist check: innocent headers must survive the scrub
    expect(h["content-type"]).toBe("application/json");

    expect(result.user?.id).toBe("keep-me");
    expect(result.user?.email).toBeUndefined();
    expect(result.user?.username).toBeUndefined();
    expect(result.user?.ip_address).toBeUndefined();
  });
});
