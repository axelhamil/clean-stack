import type { StaffAccess } from "@packages/access-control";
import type { ILogger } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import type { RouteGuards } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { z } from "zod";
import { type AdminRoutesDeps, mountAdminRoutes } from "./mount-admin-routes";

export const ACTOR_ID = "actor-1";

export const MANAGER: StaffAccess = {
  role: "manager",
  permissions: ["users.read", "users.moderate", "staff.manage"],
  mfaOk: true,
};

export const errorBody = z.object({ error: z.object({ code: z.string() }) });

export function staffGuards(overrides: Partial<RouteGuards> = {}): RouteGuards {
  return { ...openRouteGuards({ userId: ACTOR_ID, staff: MANAGER }), ...overrides };
}

export function adminApp(services: Partial<AdminRoutesDeps>, guards: RouteGuards = staffGuards()) {
  const app = new Hono<{ Variables: { requestId: string } }>()
    .use("*", async (c, next) => {
      c.set("requestId", "req-test");
      await next();
    })
    .route("/", mountAdminRoutes(guards, services));
  app.onError(
    createErrorHandler({
      instrumentation: mockInstrumentation(),
      logger: mockPort<ILogger>(),
      isProduction: false,
    }),
  );

  return app;
}

export function send(
  app: ReturnType<typeof adminApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function errorCodeOf(res: Response): Promise<string> {
  return errorBody.parse(await res.json()).error.code;
}
