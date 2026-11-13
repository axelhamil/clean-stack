import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { POLICY_VERSIONS } from "@packages/policies";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { policyStatusFrom } from "../../../application/services/policy-status.service";
import {
  createPolicyRoutes,
  type PolicyRoutesDeps,
} from "../../../infra/http/routes/policies/policies";

const CLIENT_IP = "198.51.100.7";

const acceptPolicies = mockPort<PolicyRoutesDeps["AcceptPoliciesUseCase"]>();
const policyStatus = mockPort<PolicyRoutesDeps["IPolicyStatusQuery"]>();

function makeApp() {
  const app = new Hono().route(
    "/legal",
    createPolicyRoutes({
      routeGuards: openRouteGuards({ userId: "user-1", clientIp: CLIENT_IP }),
      AcceptPoliciesUseCase: acceptPolicies,
      IPolicyStatusQuery: policyStatus,
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
    acceptPolicies.execute.mockReset();
    acceptPolicies.execute.mockResolvedValue(Result.ok({ accepted: ["terms"] }));
    policyStatus.execute.mockResolvedValue(Result.ok(policyStatusFrom(POLICY_VERSIONS)));
  });

  it("records the acceptance with the client IP the host resolved", async () => {
    const res = await makeApp().request("/legal/accept", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.66" },
      body: JSON.stringify({ types: ["terms"] }),
    });

    expect(res.status).toBe(200);
    const [input] = acceptPolicies.execute.mock.calls[0] ?? [];
    expect(input?.userId).toBe("user-1");
    expect(input?.types.toNull()).toEqual(["terms"]);
    expect(input?.ipAddress.toNull()).toBe(CLIENT_IP);
    expect(await res.json()).toEqual({
      privacy: { current: true, acceptedVersion: POLICY_VERSIONS.privacy },
      terms: { current: true, acceptedVersion: POLICY_VERSIONS.terms },
    });
  });

  it("refuses a policy type that does not exist", async () => {
    const res = await makeApp().request("/legal/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ types: ["cookies"] }),
    });

    expect(res.status).toBe(400);
    expect(acceptPolicies.execute).not.toHaveBeenCalled();
  });
});

describe("GET /legal", () => {
  it("renders a policy never accepted with a null version", async () => {
    policyStatus.execute.mockResolvedValue(
      Result.ok(policyStatusFrom({ privacy: POLICY_VERSIONS.privacy })),
    );

    const res = await makeApp().request("/legal");

    expect(await res.json()).toEqual({
      privacy: { current: true, acceptedVersion: POLICY_VERSIONS.privacy },
      terms: { current: false, acceptedVersion: null },
    });
  });
});
