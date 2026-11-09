import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { createPolicyRoutes, type PolicyRoutesDeps } from "../infrastructure/http/policies.routes";

const CLIENT_IP = "198.51.100.7";
const CURRENT = { current: true, acceptedVersion: "v1" };

const policies = mockPort<PolicyRoutesDeps["PolicyAcceptanceService"]>();

function makeApp() {
  const app = new Hono().route(
    "/legal",
    createPolicyRoutes({
      routeGuards: openRouteGuards({ userId: "user-1", clientIp: CLIENT_IP }),
      PolicyAcceptanceService: policies,
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

describe("POST /legal/accept", () => {
  beforeEach(() => {
    policies.accept.mockReset();
    policies.accept.mockResolvedValue(Result.ok());
    policies.getStatus.mockResolvedValue(Result.ok({ terms: CURRENT, privacy: CURRENT }));
  });

  it("records the acceptance with the client IP the host resolved", async () => {
    const res = await makeApp().request("/legal/accept", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.66" },
      body: JSON.stringify({ types: ["terms"] }),
    });

    expect(res.status).toBe(200);
    expect(policies.accept).toHaveBeenCalledWith("user-1", ["terms"], CLIENT_IP);
  });
});
