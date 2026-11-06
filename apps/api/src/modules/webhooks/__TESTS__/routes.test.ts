import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
} from "../application/ports/webhook-delivery.port";
import type {
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../application/ports/webhook-endpoint.port";
import type { WebhookServiceError } from "../application/services/webhooks.service";
import { createWebhooksRoutes, type WebhooksRoutesDeps } from "../routes";

// ─── stub data ───────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const ENDPOINT_A = "ep-A";
const ENDPOINT_B = "ep-B";
const DELIVERY_OF_B = "del-cross";

const stubEndpointA: WebhookEndpointRecord = {
  id: ENDPOINT_A,
  organizationId: ORG_ID,
  url: "https://example.com/hook",
  secretCipher: "current-cipher",
  eventTypes: ["user.created"],
  enabled: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  previousSecretCipher: Option.some("previous-cipher"),
  previousSecretExpiresAt: Option.some(new Date("2099-01-01")),
  consecutiveFailures: 0,
  firstFailedAt: Option.none(),
  disabledAt: Option.none(),
};

// Delivery that belongs to endpoint B, not A
const crossDelivery: WebhookDeliveryRecord & { attemptHistory: WebhookDeliveryAttemptRecord[] } = {
  id: DELIVERY_OF_B,
  endpointId: ENDPOINT_B,
  outboxEventId: "outbox-1",
  eventType: "user.created",
  payload: { userId: "u1" },
  status: "success",
  attempts: 1,
  nextAttemptAt: Option.none<Date>(),
  lastError: Option.none<string>(),
  lastResponseStatus: Option.some(200),
  idempotencyKey: "idem-cross",
  createdAt: new Date("2024-01-01"),
  attemptHistory: [],
};

const mockFindEndpoint = mock(async () =>
  Result.ok<Option<WebhookEndpointRecord>, WebhookRepoError>(Option.some(stubEndpointA)),
);
const mockFindDelivery = mock(async (_deliveryId: string, endpointId: string, _orgId: string) =>
  Result.ok<Option<typeof crossDelivery>, WebhookServiceError>(
    endpointId === crossDelivery.endpointId ? Option.some(crossDelivery) : Option.none(),
  ),
);
const mockReplayDelivery = mock(async (..._args: unknown[]) =>
  Result.ok<Option<WebhookDeliveryRecord>, WebhookRepoError>(Option.none()),
);
const mockListEndpoints = mock(async () =>
  Result.ok<WebhookEndpointRecord[], WebhookRepoError>([stubEndpointA]),
);
const mockUpdateEndpoint = mock(async () =>
  Result.ok<Option<WebhookEndpointRecord>, WebhookRepoError>(Option.some(stubEndpointA)),
);
const mockRotateSecret = mock(async () =>
  Result.ok<
    Option<{ endpoint: WebhookEndpointRecord; plaintextSecret: string }>,
    WebhookServiceError
  >(Option.some({ endpoint: stubEndpointA, plaintextSecret: "whsec_new" })),
);

function makeApp() {
  const routes = createWebhooksRoutes({
    routeGuards: openRouteGuards({ userId: "user-1", orgId: ORG_ID }),
    WebhooksService: {
      ...mockPort<WebhooksRoutesDeps["WebhooksService"]>(),
      findEndpoint: mockFindEndpoint,
      findDelivery: mockFindDelivery,
      replayDelivery: mockReplayDelivery,
      listEndpoints: mockListEndpoints,
      updateEndpoint: mockUpdateEndpoint,
      rotateSecret: mockRotateSecret,
    },
  });
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test");
    await next();
  });
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  app.route("/webhooks", routes);
  return app;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("GET /webhooks/:id/deliveries/:deliveryId: endpoint-scope guard", () => {
  it("returns 404 when delivery belongs to a different endpoint in the same org", async () => {
    const app = makeApp();
    const res = await app.request(`/webhooks/${ENDPOINT_A}/deliveries/${DELIVERY_OF_B}`, {
      method: "GET",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Webhook delivery not found");
    expect(mockFindDelivery).toHaveBeenCalledWith(DELIVERY_OF_B, ENDPOINT_A, ORG_ID);
  });
});

describe("POST /webhooks/:id/deliveries/:deliveryId/replay: endpoint-scope guard", () => {
  it("returns 404 when replaying a delivery that belongs to a different endpoint", async () => {
    const app = makeApp();
    const res = await app.request(`/webhooks/${ENDPOINT_A}/deliveries/${DELIVERY_OF_B}/replay`, {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Webhook delivery not found");
  });

  it("hands the signed-in user to the service as the replay actor", async () => {
    mockReplayDelivery.mockClear();

    await makeApp().request(`/webhooks/${ENDPOINT_A}/deliveries/${DELIVERY_OF_B}/replay`, {
      method: "POST",
    });

    expect(mockReplayDelivery).toHaveBeenCalledWith(DELIVERY_OF_B, ENDPOINT_A, ORG_ID, "user-1");
  });
});

describe("endpoint serialization: no secret cipher leaves the server", () => {
  it("GET /webhooks omits both the current and the previous secret cipher", async () => {
    const res = await makeApp().request("/webhooks");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(body.items[0]).not.toHaveProperty("secretCipher");
    expect(body.items[0]).not.toHaveProperty("previousSecretCipher");
    expect(body.items[0]?.previousSecretExpiresAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("PATCH /webhooks/:id omits the previous secret cipher during the grace window", async () => {
    const res = await makeApp().request(`/webhooks/${ENDPOINT_A}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("secretCipher");
    expect(body).not.toHaveProperty("previousSecretCipher");
  });

  it("POST /webhooks/:id/rotate-secret returns the new plaintext secret and no cipher", async () => {
    const res = await makeApp().request(`/webhooks/${ENDPOINT_A}/rotate-secret`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.secret).toBe("whsec_new");
    expect(body).not.toHaveProperty("secretCipher");
    expect(body).not.toHaveProperty("previousSecretCipher");
  });
});
