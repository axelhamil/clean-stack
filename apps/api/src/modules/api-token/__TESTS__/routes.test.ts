import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import type { ApiTokenRecord } from "../../../shared/ports/api-token.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { type ApiTokenRoutesDeps, createApiTokenRoutes } from "../routes";

const RECORD: ApiTokenRecord = {
  id: "tok-1",
  userId: "user-1",
  organizationId: Option.none(),
  name: "ci",
  scopes: ["read:profile"],
  tokenHmac: "hmac-secret-must-not-leak",
  pepperVersion: 1,
  tokenStart: "clean_tok.....",
  lastUsedAt: Option.none(),
  expiresAt: Option.none(),
  revokedAt: Option.none(),
  revokedReason: Option.none(),
  createdAt: new Date("2024-01-01"),
};

const RAW = "clean_raw_token_value_never_persisted";

const tokens = mockPort<ApiTokenRoutesDeps["ApiTokenService"]>();
const mockCreate = tokens.create;
const mockList = tokens.list;
const mockRevoke = tokens.revoke;

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue(Result.ok({ record: RECORD, raw: RAW }));
  mockList.mockReset();
  mockList.mockResolvedValue(Result.ok([RECORD]));
  mockRevoke.mockReset();
  mockRevoke.mockResolvedValue(Result.ok());
});

const refuseImpersonation: RouteGuard = async () => {
  throw new HTTPException(403, { message: "impersonating" });
};

const tokenJson = z.looseObject({
  id: z.string(),
  tokenHmac: z.unknown().optional(),
  pepperVersion: z.unknown().optional(),
});
const createdBody = z.object({ token: z.string(), record: tokenJson });
const listBody = z.object({ items: z.array(tokenJson) });
const errorBody = z.object({ error: z.object({ code: z.string() }) });

function makeApp(guards: RouteGuards = openRouteGuards({ userId: "user-1" })) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route(
    "/settings/tokens",
    createApiTokenRoutes({ routeGuards: guards, ApiTokenService: tokens }),
  );
  return app;
}

const inActiveOrg = openRouteGuards({ userId: "user-1", orgId: "org-active" });

describe("POST /settings/tokens: create", () => {
  it("returns 201 with raw token and safe record (no tokenHmac, no pepperVersion)", async () => {
    const app = makeApp();
    const res = await app.request("/settings/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "ci",
        scopes: ["read:profile"],
        organizationId: null,
        expiresInDays: null,
      }),
    });
    expect(res.status).toBe(201);
    const body = createdBody.parse(await res.json());
    expect(body.token).toBe(RAW);
    expect(body.record.id).toBe("tok-1");
    expect(body.record.tokenHmac).toBeUndefined();
    expect(body.record.pepperVersion).toBeUndefined();
  });

  it("answers not found when the token targets an organization other than the active one", async () => {
    const app = makeApp(inActiveOrg);
    const res = await app.request("/settings/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "ci",
        scopes: ["read:profile"],
        organizationId: "org-other",
        expiresInDays: null,
      }),
    });
    expect(res.status).toBe(404);
    expect(errorBody.parse(await res.json()).error.code).toBe("API_TOKEN_ORGANIZATION_NOT_FOUND");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when the session is impersonated", async () => {
    const app = makeApp({
      ...openRouteGuards({ userId: "user-1" }),
      denyImpersonated: refuseImpersonation,
    });
    const res = await app.request("/settings/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "ci",
        scopes: ["read:profile"],
        organizationId: null,
        expiresInDays: null,
      }),
    });
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("GET /settings/tokens: list", () => {
  it("never exposes tokenHmac or the raw token value", async () => {
    const app = makeApp();
    const res = await app.request("/settings/tokens", { method: "GET" });
    expect(res.status).toBe(200);
    const body = listBody.parse(await res.json());
    const [item] = body.items;
    expect(item).toBeDefined();
    expect(item?.tokenHmac).toBeUndefined();
    expect(item?.pepperVersion).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(RECORD.tokenHmac);
    expect(JSON.stringify(body)).not.toContain(RAW);
  });
});

describe("DELETE /settings/tokens/:id: wrong owner returns 404", () => {
  it("returns 404 when the service reports API_TOKEN_NOT_FOUND", async () => {
    mockRevoke.mockResolvedValueOnce(
      Result.fail({ code: "API_TOKEN_NOT_FOUND", message: "Token not found." }),
    );
    const app = makeApp();
    const res = await app.request("/settings/tokens/tok-other", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("session → visibility scope", () => {
  it("lists the active organization's tokens together with the caller's personal ones", async () => {
    const app = makeApp(inActiveOrg);

    const res = await app.request("/settings/tokens", { method: "GET" });

    expect(res.status).toBe(200);
    expect(mockList.mock.calls[0]?.[0]).toEqual({
      kind: "orgAndPersonal",
      userId: "user-1",
      organizationId: "org-active",
    });
  });

  it("falls back to personal-only when the session carries no active organization", async () => {
    const app = makeApp();

    await app.request("/settings/tokens", { method: "GET" });

    expect(mockList.mock.calls[0]?.[0]).toEqual({ kind: "personal", userId: "user-1" });
  });

  it("revokes under the same widened scope, so a personal token stays revocable", async () => {
    const app = makeApp(inActiveOrg);

    const res = await app.request("/settings/tokens/tok-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(mockRevoke.mock.calls[0]?.[1]).toEqual({
      kind: "orgAndPersonal",
      userId: "user-1",
      organizationId: "org-active",
    });
  });
});
