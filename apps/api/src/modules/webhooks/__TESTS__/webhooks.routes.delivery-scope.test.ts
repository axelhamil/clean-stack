import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { WebhookDeliveryRecord } from "../application/ports/webhook-delivery.port";
import type { WebhookRepoError } from "../application/ports/webhook-endpoint.port";

// ─── stub data ───────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const ENDPOINT_A = "ep-A";
const ENDPOINT_B = "ep-B";
const DELIVERY_OF_B = "del-cross";

const stubEndpointA = {
  id: ENDPOINT_A,
  organizationId: ORG_ID,
  url: "https://example.com/hook",
  secretCipher: "encrypted",
  eventTypes: ["user.created"],
  enabled: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  previousSecretCipher: Option.none<string>(),
  previousSecretExpiresAt: Option.none<Date>(),
  consecutiveFailures: 0,
  firstFailedAt: Option.none<Date>(),
  disabledAt: Option.none<Date>(),
};

// Delivery that belongs to endpoint B, not A
const crossDelivery = {
  id: DELIVERY_OF_B,
  endpointId: ENDPOINT_B,
  outboxEventId: "outbox-1",
  eventType: "user.created",
  payload: { userId: "u1" },
  status: "delivered" as const,
  attempts: 1,
  nextAttemptAt: Option.none<Date>(),
  lastError: Option.none<string>(),
  lastResponseStatus: Option.some(200),
  idempotencyKey: "idem-cross",
  createdAt: new Date("2024-01-01"),
  attemptHistory: [],
};

const mockFindEndpoint = mock(async () => Option.some(stubEndpointA));
const mockFindDelivery = mock(async () => Option.some(crossDelivery));
const mockReplayDelivery = mock(async () =>
  Result.ok<Option<WebhookDeliveryRecord>, WebhookRepoError>(Option.none()),
);

// ─── module mocks (must be declared before dynamic import) ───────────────────

mock.module("../../../container", () => ({
  di: {
    WebhooksService: {
      findEndpoint: mockFindEndpoint,
      findDelivery: mockFindDelivery,
      replayDelivery: mockReplayDelivery,
    },
  },
}));

mock.module("../../../shared/middleware/auth.middleware", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireAuth: async (c: any, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    c.set("session", { activeOrganizationId: ORG_ID, activeOrganizationRole: "owner" });
    await next();
  },
  AuthVariables: {},
}));

mock.module("../../../shared/middleware/org.middleware", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  requireOrg: async (c: any, next: () => Promise<void>) => {
    c.set("orgId", ORG_ID);
    await next();
  },
  requireOrgPermission: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// Dynamic import AFTER mocks are registered
const { webhooksRoutes } = await import("../routes");
const { Hono } = await import("hono");
const { createErrorHandler } = await import("../../../shared/middleware/error.middleware");
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/webhooks", webhooksRoutes);
  return app;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("GET /webhooks/:id/deliveries/:deliveryId — endpoint-scope guard", () => {
  it("returns 404 when delivery belongs to a different endpoint in the same org", async () => {
    const app = makeApp();
    const res = await app.request(`/webhooks/${ENDPOINT_A}/deliveries/${DELIVERY_OF_B}`, {
      method: "GET",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Webhook delivery not found");
  });
});

describe("POST /webhooks/:id/deliveries/:deliveryId/replay — endpoint-scope guard", () => {
  it("returns 404 when replaying a delivery that belongs to a different endpoint", async () => {
    const app = makeApp();
    const res = await app.request(`/webhooks/${ENDPOINT_A}/deliveries/${DELIVERY_OF_B}/replay`, {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Webhook delivery not found");
  });
});
