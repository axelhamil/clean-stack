import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { entitlementsForTier, type Tier } from "../../../shared/entitlements";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";

let tier: Tier = "business";
const disconnect = mock(async () => Result.ok());
const issueToken = mock(async () =>
  Result.ok({ token: "scim-token", expiresAt: new Date("2027-01-01T00:00:00Z") }),
);

mock.module("../../../container", () => ({
  di: {
    // requireAuth loads auth.ts, which resolves the plan catalog once at import.
    BillingCatalogService: { getCatalog: async () => [] },
    PolicyAcceptanceService: { hasAcceptedCurrent: async () => Result.ok(true) },
    EntitlementsService: {
      getEntitlements: async () => ({ tier, status: "active", ...entitlementsForTier(tier) }),
    },
  },
}));

mock.module("../../../shared/services/scim-connection.service", () => ({
  ScimConnectionService: class {
    find = async () => Result.ok(Option.none());
    issueToken = issueToken;
    disconnect = disconnect;
  },
}));

const { organizationSettingsRoutes } = await import("../routes");

function makeApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user" as never, { id: "owner-1" } as never);
    c.set(
      "session" as never,
      {
        id: "session-1",
        impersonatedBy: null,
        activeOrganizationId: "org-1",
        activeOrganizationRole: "owner",
      } as never,
    );
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/settings/organization", organizationSettingsRoutes);
  return app;
}

describe("/settings/organization/scim-connection after the plan lost SSO", () => {
  beforeEach(() => {
    tier = "free";
    disconnect.mockClear();
    issueToken.mockClear();
  });

  it("still lets the owner disconnect the directory", async () => {
    const res = await makeApp().request("/settings/organization/scim-connection", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("still shows the owner the connection status", async () => {
    const res = await makeApp().request("/settings/organization/scim-connection");

    expect(res.status).toBe(200);
  });

  it("refuses to issue a new token", async () => {
    const res = await makeApp().request("/settings/organization/scim-connection", {
      method: "POST",
    });

    expect(res.status).toBe(402);
    expect(issueToken).not.toHaveBeenCalled();
  });
});
