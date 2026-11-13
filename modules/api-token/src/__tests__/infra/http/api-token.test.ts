import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import type { RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type ApiTokenRoutesDeps,
  createApiTokenRoutes,
} from "../../../infra/http/routes/api-token/api-token";
import { apiToken } from "../../fixtures";

const TOKEN = apiToken({ tokenHmac: "hmac-secret-must-not-leak" });
const RAW = "clean_raw_token_value_never_persisted";

let create = mockPort<ApiTokenRoutesDeps["CreateApiTokenUseCase"]>();
let revoke = mockPort<ApiTokenRoutesDeps["RevokeApiTokenUseCase"]>();
let list = mockPort<ApiTokenRoutesDeps["IListApiTokensQuery"]>();

beforeEach(() => {
  create = mockPort<ApiTokenRoutesDeps["CreateApiTokenUseCase"]>();
  revoke = mockPort<ApiTokenRoutesDeps["RevokeApiTokenUseCase"]>();
  list = mockPort<ApiTokenRoutesDeps["IListApiTokensQuery"]>();
  create.execute.mockResolvedValue(Result.ok({ token: TOKEN, raw: RAW }));
  revoke.execute.mockResolvedValue(Result.ok());
  list.execute.mockResolvedValue(Result.ok([TOKEN]));
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
  app.onError(
    createErrorHandler({
      instrumentation: mockInstrumentation(),
      logger: mockPort<ILogger>(),
      isProduction: false,
    }),
  );
  app.route(
    "/settings/tokens",
    createApiTokenRoutes({
      routeGuards: guards,
      CreateApiTokenUseCase: create,
      RevokeApiTokenUseCase: revoke,
      IListApiTokensQuery: list,
    }),
  );
  return app;
}

const inActiveOrg = openRouteGuards({ userId: "user-1", orgId: "org-active" });

const postToken = (
  app: Hono<{ Variables: { requestId: string } }>,
  organizationId: string | null,
) =>
  app.request("/settings/tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "ci",
      scopes: ["read:profile"],
      organizationId,
      expiresInDays: null,
    }),
  });

describe("POST /settings/tokens: create", () => {
  it("returns 201 with the raw token and a record without secret material", async () => {
    const res = await postToken(makeApp(), null);

    expect(res.status).toBe(201);
    const body = createdBody.parse(await res.json());
    expect(body.token).toBe(RAW);
    expect(body.record.id).toBe("tok-1");
    expect(body.record.tokenHmac).toBeUndefined();
    expect(body.record.pepperVersion).toBeUndefined();
    expect(create.execute).toHaveBeenCalledWith({
      userId: "user-1",
      actorUserId: "user-1",
      name: "ci",
      scopes: ["read:profile"],
      organizationId: null,
      expiresInDays: null,
    });
  });

  it("answers not found when the token targets an organization other than the active one", async () => {
    const res = await postToken(makeApp(inActiveOrg), "org-other");

    expect(res.status).toBe(404);
    expect(errorBody.parse(await res.json()).error.code).toBe("API_TOKEN_ORGANIZATION_NOT_FOUND");
    expect(create.execute).not.toHaveBeenCalled();
  });

  it("returns 403 when the session is impersonated", async () => {
    const app = makeApp({
      ...openRouteGuards({ userId: "user-1" }),
      denyImpersonated: refuseImpersonation,
    });

    const res = await postToken(app, null);

    expect(res.status).toBe(403);
    expect(create.execute).not.toHaveBeenCalled();
  });
});

describe("GET /settings/tokens: list", () => {
  it("never exposes the digest or the raw token value", async () => {
    const res = await makeApp().request("/settings/tokens", { method: "GET" });

    expect(res.status).toBe(200);
    const body = listBody.parse(await res.json());
    const [item] = body.items;
    expect(item).toBeDefined();
    expect(item?.tokenHmac).toBeUndefined();
    expect(item?.pepperVersion).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(TOKEN.get("tokenHmac"));
  });
});

describe("DELETE /settings/tokens/:id", () => {
  it("returns 404 when the token is out of the caller's reach", async () => {
    revoke.execute.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_NOT_FOUND", message: "Token not found." }),
    );

    const res = await makeApp().request("/settings/tokens/tok-other", { method: "DELETE" });

    expect(res.status).toBe(404);
  });

  it("refuses a malformed id before reaching the use case", async () => {
    const res = await makeApp().request("/settings/tokens/not%20an%20id", { method: "DELETE" });

    expect(res.status).toBe(400);
    expect(revoke.execute).not.toHaveBeenCalled();
  });
});

describe("session to visibility scope", () => {
  it("lists the active organization's tokens together with the caller's personal ones", async () => {
    const res = await makeApp(inActiveOrg).request("/settings/tokens", { method: "GET" });

    expect(res.status).toBe(200);
    expect(list.execute).toHaveBeenCalledWith({
      owner: { kind: "orgAndPersonal", userId: "user-1", organizationId: "org-active" },
    });
  });

  it("falls back to personal-only when the session carries no active organization", async () => {
    await makeApp().request("/settings/tokens", { method: "GET" });

    expect(list.execute).toHaveBeenCalledWith({ owner: { kind: "personal", userId: "user-1" } });
  });

  it("revokes under the same widened scope, so a personal token stays revocable", async () => {
    const res = await makeApp(inActiveOrg).request("/settings/tokens/tok-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(revoke.execute).toHaveBeenCalledWith({
      id: "tok-1",
      owner: { kind: "orgAndPersonal", userId: "user-1", organizationId: "org-active" },
      actorUserId: "user-1",
    });
  });
});
