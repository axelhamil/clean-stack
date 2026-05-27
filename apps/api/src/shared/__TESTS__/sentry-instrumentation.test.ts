import { describe, expect, it, mock } from "bun:test";

const startSpanMock = mock(async (_opts: unknown, cb: () => unknown) => cb());
const withScopeMock = mock((cb: (scope: unknown) => void) => {
  cb(scopeMock);
});
const captureExceptionMock = mock((_err: unknown) => {});
const addBreadcrumbMock = mock((_crumb: unknown) => {});
const setTagMock = mock((_key: string, _value: string) => {});
const setUserMock = mock((_user: unknown) => {});
const setContextMock = mock((_key: string, _ctx: unknown) => {});

const scopeMock = {
  setTag: setTagMock,
  setUser: setUserMock,
  setContext: setContextMock,
};

mock.module("@sentry/bun", () => ({
  startSpan: startSpanMock,
  withScope: withScopeMock,
  captureException: captureExceptionMock,
  addBreadcrumb: addBreadcrumbMock,
  init: mock(() => {}),
  pinoIntegration: mock(() => ({})),
  setTag: setTagMock,
  setUser: setUserMock,
  setContext: setContextMock,
}));

const { SentryInstrumentation } = await import("../services/sentry-instrumentation");

describe("SentryInstrumentation", () => {
  describe("startSpan", () => {
    it("delegates to Sentry.startSpan with same options and callback result", async () => {
      startSpanMock.mockClear();
      const sentry = new SentryInstrumentation();
      const options = { name: "test > method", op: "db.query" };
      const cb = async () => 42;

      const result = await sentry.startSpan(options, cb);

      expect(result).toBe(42);
      expect(startSpanMock).toHaveBeenCalledTimes(1);
      const [calledOpts] = startSpanMock.mock.calls[0] as [{ name: string; op: string }, unknown];
      expect(calledOpts.name).toBe(options.name);
      expect(calledOpts.op).toBe(options.op);
    });
  });

  describe("capture", () => {
    it("opens a withScope, sets all tags and user, then calls captureException", () => {
      withScopeMock.mockClear();
      captureExceptionMock.mockClear();
      setTagMock.mockClear();
      setUserMock.mockClear();
      setContextMock.mockClear();

      const sentry = new SentryInstrumentation();
      const err = new Error("boom");
      const context = {
        requestId: "req-1",
        userId: "user-1",
        orgId: "org-1",
        path: "/test",
        method: "GET",
        metadata: { key: "value" },
      };

      sentry.capture(err, context);

      expect(withScopeMock).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock).toHaveBeenCalledWith(err);

      expect(setTagMock).toHaveBeenCalledWith("requestId", "req-1");
      expect(setTagMock).toHaveBeenCalledWith("orgId", "org-1");
      expect(setTagMock).toHaveBeenCalledWith("path", "/test");
      expect(setTagMock).toHaveBeenCalledWith("method", "GET");

      expect(setUserMock).toHaveBeenCalledWith({ id: "user-1" });
      expect(setContextMock).toHaveBeenCalledWith("metadata", { key: "value" });
    });

    it("skips optional tags when context fields are absent", () => {
      withScopeMock.mockClear();
      captureExceptionMock.mockClear();
      setTagMock.mockClear();
      setUserMock.mockClear();
      setContextMock.mockClear();

      const sentry = new SentryInstrumentation();
      const err = new Error("bare");

      sentry.capture(err);

      expect(captureExceptionMock).toHaveBeenCalledWith(err);
      expect(setTagMock).not.toHaveBeenCalled();
      expect(setUserMock).not.toHaveBeenCalled();
      expect(setContextMock).not.toHaveBeenCalled();
    });
  });

  describe("addBreadcrumb", () => {
    it("delegates to Sentry.addBreadcrumb with identical fields", () => {
      addBreadcrumbMock.mockClear();
      const sentry = new SentryInstrumentation();
      const crumb = {
        category: "http",
        message: "GET /api/test",
        level: "info" as const,
        data: { status: 200 },
      };

      sentry.addBreadcrumb(crumb);

      expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbMock).toHaveBeenCalledWith({
        category: "http",
        message: "GET /api/test",
        level: "info",
        data: { status: 200 },
      });
    });
  });
});
