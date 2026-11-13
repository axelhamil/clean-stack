import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import type { RouteGuard } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createProfileRoutes,
  type ProfileRoutesDeps,
} from "../../../infra/http/routes/profile/profile";

let setLocale = mockPort<ProfileRoutesDeps["SetLocaleUseCase"]>();
let impersonating = false;

beforeEach(() => {
  setLocale = mockPort<ProfileRoutesDeps["SetLocaleUseCase"]>();
  setLocale.execute.mockResolvedValue(Result.ok());
  impersonating = false;
});

const refuseImpersonation: RouteGuard = async (_c, next) => {
  if (impersonating) throw new HTTPException(403, { message: "impersonating" });
  await next();
};

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>()
    .use("*", async (c, next) => {
      c.set("requestId", "req-test");
      await next();
    })
    .route(
      "/me",
      createProfileRoutes({
        routeGuards: {
          ...openRouteGuards({ userId: "user-1" }),
          denyImpersonated: refuseImpersonation,
        },
        SetLocaleUseCase: setLocale,
      }),
    );
  app.onError(
    createErrorHandler({
      instrumentation: mockInstrumentation(),
      logger: mockPort<ILogger>(),
      isProduction: false,
    }),
  );

  return app;
}

function putLocale(locale: string) {
  return makeApp().request("/me/locale", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale }),
  });
}

describe("PUT /me/locale", () => {
  it("sets the locale of the signed-in user", async () => {
    const res = await putLocale("fr");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setLocale.execute).toHaveBeenCalledWith({ userId: "user-1", locale: "fr" });
  });

  it("rejects a locale outside the supported set", async () => {
    const res = await putLocale("de");

    expect(res.status).toBe(400);
    expect(setLocale.execute).not.toHaveBeenCalled();
  });

  it("answers with the status of the failure the use case returns", async () => {
    setLocale.execute.mockResolvedValue(
      Result.fail({ code: "PROFILE_PROVIDER_FAILURE", message: "db down" }),
    );

    const res = await putLocale("fr");

    expect(res.status).toBe(502);
  });

  it("refuses an impersonated session", async () => {
    impersonating = true;

    const res = await putLocale("fr");

    expect(res.status).toBe(403);
    expect(setLocale.execute).not.toHaveBeenCalled();
  });
});
