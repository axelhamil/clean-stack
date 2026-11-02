import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { POLICY_TYPES } from "@packages/policies";
import { Hono } from "hono";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";

const accept = mock(async (_userId: string, _types: string[], _ip?: string) => Result.ok());
const status = Object.fromEntries(
  POLICY_TYPES.map((t) => [t, { current: true, acceptedVersion: "v1" }]),
);

mock.module("../../../container", () => ({
  di: {
    // requireAuth loads auth.ts, which resolves the plan catalog once at import.
    BillingCatalogService: { getCatalog: async () => [] },
    PolicyAcceptanceService: {
      accept,
      getStaleTypes: mock(async () => Result.ok([])),
      getStatus: mock(async () => Result.ok(status)),
    },
  },
}));

const { policyRoutes } = await import("../routes");

const SOCKET_ADDRESS = "198.51.100.7";
const bunServer = { requestIP: () => ({ address: SOCKET_ADDRESS, family: "IPv4", port: 443 }) };

function makeApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user" as never, { id: "user-1" } as never);
    c.set("session" as never, { id: "session-1", impersonatedBy: null } as never);
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/legal", policyRoutes);
  return app;
}

describe("POST /legal/accept", () => {
  beforeEach(() => {
    accept.mockClear();
  });

  it("records the socket address, not a client-supplied X-Forwarded-For, when no proxy is trusted", async () => {
    const res = await makeApp().request(
      "/legal/accept",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.66" },
        body: JSON.stringify({ types: ["terms"] }),
      },
      bunServer,
    );

    expect(res.status).toBe(200);
    expect(accept).toHaveBeenCalledWith("user-1", ["terms"], SOCKET_ADDRESS);
  });
});
