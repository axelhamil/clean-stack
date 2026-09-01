import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { IInstrumentation } from "../../ports/instrumentation.port";
import { denyImpersonated } from "../deny-impersonated.middleware";
import { createErrorHandler } from "../error.middleware";

const noopInstrumentation: IInstrumentation = {
  capture: () => {},
  startSpan: (_opts, cb) => cb() as ReturnType<typeof cb>,
  addBreadcrumb: () => {},
  setSpanAttributes: () => {},
};

function ctx(session: unknown) {
  const store = new Map<string, unknown>([["session", session]]);
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => store.set(k, v),
  } as unknown as Parameters<typeof denyImpersonated>[0];
}

function appWithGuardedRoute() {
  const impersonatedSession = { id: "s-1", impersonatedBy: "admin-1" };
  const injectSession = createMiddleware(async (c, next) => {
    c.set("session" as never, impersonatedSession);
    await next();
  });
  const app = new Hono()
    .use("*", injectSession)
    .post("/guarded", denyImpersonated, (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(noopInstrumentation));
  return app;
}

describe("denyImpersonated", () => {
  it("rejects a request made from an impersonated session with an addressable code", async () => {
    const c = ctx({ id: "s-1", impersonatedBy: "admin-1" });
    await expect(denyImpersonated(c, async () => {})).rejects.toMatchObject({
      code: "IMPERSONATION_ACTION_FORBIDDEN",
    });
  });

  it("passes a regular session through", async () => {
    const c = ctx({ id: "s-1", impersonatedBy: null });
    let called = false;
    await denyImpersonated(c, async () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("lets an impersonated session reach a read handler while blocking its mutation sibling", async () => {
    const impersonatedSession = { id: "s-1", impersonatedBy: "admin-1" };
    const injectSession = createMiddleware(async (c, next) => {
      c.set("session" as never, impersonatedSession);
      await next();
    });
    const app = new Hono()
      .use("*", injectSession)
      .get("/subscription", (c) => c.json({ tier: "free" }))
      .post("/portal", denyImpersonated, (c) => c.json({ url: "https://billing.example.com" }));
    app.onError(createErrorHandler(noopInstrumentation));

    const readRes = await app.request("/subscription");
    expect(readRes.status).toBe(200);

    const writeRes = await app.request("/portal", { method: "POST" });
    expect(writeRes.status).toBe(403);
  });

  it("rejects with an addressable business code, not a bare HTTP status", async () => {
    const app = appWithGuardedRoute();
    const res = await app.request("/guarded", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { code: "IMPERSONATION_ACTION_FORBIDDEN" },
    });
  });
});
