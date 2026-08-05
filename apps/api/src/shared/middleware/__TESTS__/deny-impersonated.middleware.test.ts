import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { denyImpersonated } from "../deny-impersonated.middleware";

function ctx(session: unknown) {
  const store = new Map<string, unknown>([["session", session]]);
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => store.set(k, v),
  } as unknown as Parameters<typeof denyImpersonated>[0];
}

describe("denyImpersonated", () => {
  it("rejects a request made from an impersonated session", async () => {
    const c = ctx({ id: "s-1", impersonatedBy: "admin-1" });
    await expect(denyImpersonated(c, async () => {})).rejects.toMatchObject({ status: 403 });
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

    const readRes = await app.request("/subscription");
    expect(readRes.status).toBe(200);

    const writeRes = await app.request("/portal", { method: "POST" });
    expect(writeRes.status).toBe(403);
  });
});
