import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const getSessionSpy = mock(async () => null);

mock.module("../../auth", () => ({
  auth: { api: { getSession: getSessionSpy } },
}));

const { sessionMiddleware, requireAuth } = await import("../auth.middleware");

type AuthEnv = {
  Variables: { user: { id: string } | null; session: { id: string } | null };
};

describe("sessionMiddleware", () => {
  it("should skip auth lookup on /api/auth/* and /internal/* (sets nulls, never calls auth.api.getSession)", async () => {
    getSessionSpy.mockClear();
    const app = new Hono<AuthEnv>()
      .use("*", sessionMiddleware)
      .get("/api/auth/login", (c) => c.json({ user: c.get("user"), session: c.get("session") }))
      .get("/internal/foo", (c) => c.json({ user: c.get("user"), session: c.get("session") }));

    const a = await app.request("/api/auth/login");
    const b = await app.request("/internal/foo");

    expect(await a.json()).toEqual({ user: null, session: null });
    expect(await b.json()).toEqual({ user: null, session: null });
    expect(getSessionSpy).not.toHaveBeenCalled();
  });
});

describe("requireAuth", () => {
  it("should reject with 401 when no user/session is set on the context", async () => {
    const app = new Hono<AuthEnv>()
      .use("*", async (c, next) => {
        c.set("user", null);
        c.set("session", null);
        await next();
      })
      .use("*", requireAuth)
      .get("/me", (c) => c.json({ ok: true }));
    expect((await app.request("/me")).status).toBe(401);
  });

  it("should pass through when user and session are present", async () => {
    const app = new Hono<AuthEnv>()
      .use("*", async (c, next) => {
        c.set("user", { id: "u1" });
        c.set("session", { id: "s1" });
        await next();
      })
      .use("*", requireAuth)
      .get("/me", (c) => c.json({ ok: true }));
    expect((await app.request("/me")).status).toBe(200);
  });
});
