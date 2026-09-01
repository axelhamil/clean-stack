import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { IInstrumentation } from "../../ports/instrumentation.port";
import { createErrorHandler } from "../error.middleware";

const noopInstrumentation: IInstrumentation = {
  capture: () => {},
  startSpan: (_opts, cb) => cb() as ReturnType<typeof cb>,
  addBreadcrumb: () => {},
  setSpanAttributes: () => {},
};

let stale = false;

const mockHasAcceptedCurrent = mock(async () => Result.ok<boolean>(!stale));

mock.module("../../../container", () => ({
  di: {
    PolicyAcceptanceService: {
      hasAcceptedCurrent: mockHasAcceptedCurrent,
    },
  },
}));

const mockUpdateUserName = mock(async () => {});

mock.module("../../../auth-queries", () => ({
  updateUserName: mockUpdateUserName,
}));

const { requireCurrentPolicies } = await import("../policy.middleware");
const { mePublicRoutes } = await import("../../../public-api/v1/me.routes");

function appWithGuardedRoute() {
  const injectContext = createMiddleware(async (c, next) => {
    const header = c.req.header("x-test-context");
    const ctx = header ? JSON.parse(header) : {};
    c.set("user" as never, ctx.user ?? null);
    c.set("session" as never, ctx.session ?? null);
    await next();
  });
  const app = new Hono()
    .use("*", injectContext)
    .post("/guarded", requireCurrentPolicies, (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(noopInstrumentation));
  return app;
}

const staleUserSession = { user: { id: "user-stale" }, session: { impersonatedBy: null } };
const currentUserSession = { user: { id: "user-current" }, session: { impersonatedBy: null } };
const impersonatedStaleSession = {
  user: { id: "user-stale" },
  session: { impersonatedBy: "admin-1" },
};

describe("requireCurrentPolicies", () => {
  it("rejects a business mutation when a policy version is stale", async () => {
    stale = true;
    const app = appWithGuardedRoute();
    const res = await app.request("/guarded", {
      method: "POST",
      headers: { "x-test-context": JSON.stringify(staleUserSession) },
    });
    expect(res.status).toBe(409);
  });

  it("passes a user whose acceptances are current", async () => {
    stale = false;
    const app = appWithGuardedRoute();
    const res = await app.request("/guarded", {
      method: "POST",
      headers: { "x-test-context": JSON.stringify(currentUserSession) },
    });
    expect(res.status).toBe(200);
  });

  it("never blocks an impersonated session", async () => {
    stale = true;
    const app = appWithGuardedRoute();
    const res = await app.request("/guarded", {
      method: "POST",
      headers: { "x-test-context": JSON.stringify(impersonatedStaleSession) },
    });
    expect(res.status).toBe(200);
  });

  it("rejects when there is no authenticated user", async () => {
    stale = false;
    const app = appWithGuardedRoute();
    const res = await app.request("/guarded", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

function appWithPublicApiMe() {
  const injectTokenContext = createMiddleware(async (c, next) => {
    c.set("user" as never, {
      id: "user-stale",
      name: "Stale User",
      email: "stale@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    });
    c.set("tokenScopes" as never, ["read:profile", "write:profile"]);
    await next();
  });
  const app = new Hono().use("*", injectTokenContext).route("/", mePublicRoutes);
  app.onError(createErrorHandler(noopInstrumentation));
  return app;
}

describe("requireCurrentPolicies on /api/v1", () => {
  it("gates a public-api write for a user with stale acceptances", async () => {
    stale = true;
    const app = appWithPublicApiMe();
    const res = await app.request("/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(res.status).toBe(409);
  });

  it("leaves a public-api read ungated", async () => {
    stale = true;
    const app = appWithPublicApiMe();
    const res = await app.request("/");
    expect(res.status).toBe(200);
  });
});
