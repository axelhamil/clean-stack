import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mocks AVANT imports dynamiques
const mockedAddress = { address: "127.0.0.1" };
mock.module("hono/bun", () => ({
  getConnInfo: () => ({ remote: mockedAddress }),
}));

const warnSpy = mock(() => {});
mock.module("../logger", () => ({
  logger: {
    warn: warnSpy,
    info: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

// Imports dynamiques post-mock
const { requireCsrf } = await import("../middleware/csrf.middleware");
const { createErrorHandler } = await import("../middleware/error.middleware");

import { Hono } from "hono";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository } from "../ports/outbox.port";

function makeNoop(): IInstrumentation {
  return {
    startSpan: (_opts: unknown, cb: () => unknown) => cb(),
    capture: () => {},
    addBreadcrumb: () => {},
    setSpanAttributes: () => {},
  } as unknown as IInstrumentation;
}

const ALLOWED_ORIGINS = ["http://localhost:5173", "https://app.example.com"];

function makeOutbox(): IOutboxRepository {
  return {
    enqueue: mock(async () => {}),
    findPendingBatch: async () => [],
    markDispatched: async () => {},
    markFailed: async () => {},
  };
}

type CsrfEventPayload = {
  reason: string;
  origin: string | null;
  actorUserId: string | null;
  method: string;
  path: string;
  ip: string;
};

function firstPayload(outbox: IOutboxRepository): CsrfEventPayload | undefined {
  const [events] = ((outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] ?? []) as [
    Array<{ payload: CsrfEventPayload }>?,
  ];
  return events?.[0]?.payload;
}

type TestVars = { user: { id: string } | null };

function makeApp(opts: { withUser?: boolean; outbox?: IOutboxRepository } = {}) {
  const app = new Hono<{ Variables: TestVars }>();
  app.onError(createErrorHandler(makeNoop()));
  if (opts.withUser) {
    app.use("*", async (c, next) => {
      c.set("user", { id: "u1" });
      return next();
    });
  }
  app.use("*", requireCsrf({ outbox: opts.outbox, allowedOrigins: ALLOWED_ORIGINS }));
  app.get("/test", (c) => c.json({ ok: true }));
  app.on(["POST", "PUT", "PATCH", "DELETE"], "/test", (c) => c.json({ ok: true }));
  return app;
}

describe("csrf middleware", () => {
  beforeEach(() => {
    warnSpy.mockClear();
  });

  it("GET passe sans Origin", async () => {
    const app = makeApp();
    const res = await app.request("/test", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("POST avec Origin dans allowlist → 200", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(200);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("POST sans header Origin → 403 + event missing_origin", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SECURITY_CSRF_FORBIDDEN");
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(firstPayload(outbox)?.reason).toBe("missing_origin");
    expect(firstPayload(outbox)?.origin).toBeNull();
  });

  it("POST avec Origin: null (string) → 403 + reason missing_origin", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", {
      method: "POST",
      headers: { Origin: "null" },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SECURITY_CSRF_FORBIDDEN");
    expect(firstPayload(outbox)?.reason).toBe("missing_origin");
    expect(firstPayload(outbox)?.origin).toBeNull();
  });

  it("DELETE sans Origin → 403 (méthode unsafe)", async () => {
    const app = makeApp({ outbox: makeOutbox() });
    const res = await app.request("/test", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("PATCH hors allowlist → 403 (méthode unsafe)", async () => {
    const app = makeApp({ outbox: makeOutbox() });
    const res = await app.request("/test", {
      method: "PATCH",
      headers: { Origin: "https://evil.com" },
    });
    expect(res.status).toBe(403);
  });

  it("POST avec Authorization: Bearer → 200 (skip CSRF, pas de cookie ambiant)", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", {
      method: "POST",
      headers: { Authorization: "Bearer some-token" },
    });
    expect(res.status).toBe(200);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("POST avec Origin hors allowlist → 403 + reason origin_mismatch", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", {
      method: "POST",
      headers: { Origin: "https://evil.com" },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SECURITY_CSRF_FORBIDDEN");
    expect(firstPayload(outbox)?.reason).toBe("origin_mismatch");
    expect(firstPayload(outbox)?.origin).toBe("https://evil.com");
  });

  it("actorUserId = user.id si user en contexte", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ withUser: true, outbox });
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
    expect(firstPayload(outbox)?.actorUserId).toBe("u1");
  });

  it("actorUserId = null si pas de user", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
    expect(firstPayload(outbox)?.actorUserId).toBeNull();
  });

  it("payload contient ip, method, path", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
    expect(firstPayload(outbox)?.method).toBe("POST");
    expect(firstPayload(outbox)?.path).toBe("/test");
    expect(typeof firstPayload(outbox)?.ip).toBe("string");
  });

  it("outbox absent → pas de crash, warn factory-time", async () => {
    warnSpy.mockClear();
    const app = new Hono();
    app.onError(createErrorHandler(makeNoop()));
    app.use("*", requireCsrf({ allowedOrigins: ALLOWED_ORIGINS }));
    app.post("/test", (c) => c.json({ ok: true }));
    expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("403 → body error.code SECURITY_CSRF_FORBIDDEN", async () => {
    const outbox = makeOutbox();
    const app = makeApp({ outbox });
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("SECURITY_CSRF_FORBIDDEN");
    expect(body.error.message).toBeDefined();
  });
});
