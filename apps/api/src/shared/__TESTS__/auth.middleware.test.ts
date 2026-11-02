import { describe, expect, it, mock, spyOn } from "bun:test";
import { Hono } from "hono";

const getSessionSpy = mock(
  async (): Promise<{
    user: { id: string };
    session: { id: string; impersonatedBy: string | null };
  } | null> => null,
);

const realAuth = await import("../../auth");
mock.module("../../auth", () => ({
  ...realAuth,
  auth: { api: { getSession: getSessionSpy } },
}));

const { sessionMiddleware, requireAuth } = await import("../middleware/auth.middleware");
const { di } = await import("../../container");

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

describe("sessionMiddleware under impersonation", () => {
  const target = { id: "target" };
  const impersonated = { id: "s1", impersonatedBy: "staff" };

  function appWith(holds: boolean) {
    getSessionSpy.mockImplementation(async () => ({ user: target, session: impersonated }));
    const spy = spyOn(di.StaffAccessService, "impersonatorHolds").mockImplementation(
      async () => holds,
    );
    const app = new Hono<AuthEnv>()
      .use("*", sessionMiddleware)
      .get("*", (c) => c.json({ user: c.get("user") }));

    return { app, spy };
  }

  it("refuses the session once the impersonator lost the permission", async () => {
    const { app, spy } = appWith(false);

    const res = await app.request("/me");

    expect(await res.json()).toEqual({ user: null });
    expect(spy).toHaveBeenCalledWith("staff");
  });

  it("keeps the session while the impersonator holds the permission", async () => {
    const { app } = appWith(true);

    expect(await (await app.request("/me")).json()).toEqual({ user: target });
  });

  it("still lets a refused impersonator stop, so nobody is stuck in the session", async () => {
    const { app } = appWith(false);

    const res = await app.request("/admin/impersonation/stop");

    expect(await res.json()).toEqual({ user: target });
  });

  it("reads nothing for a session that is not impersonated", async () => {
    const { app, spy } = appWith(false);
    spy.mockClear();
    getSessionSpy.mockImplementation(async () => ({
      user: target,
      session: { id: "s1", impersonatedBy: null },
    }));

    await app.request("/me");

    expect(spy).not.toHaveBeenCalled();
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
