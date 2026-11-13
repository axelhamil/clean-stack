import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import { createErrorHandler } from "@packages/http/error-handler";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { z } from "zod";
import type {
  WebhookDeliveryRecord,
  WebhookDeliveryWithAttempts,
} from "../../../application/ports/repositories/webhook-delivery.port";
import {
  DELIVERY_NOT_FOUND,
  ENDPOINT_NOT_FOUND,
  type WebhookEndpointRecord,
} from "../../../application/ports/repositories/webhook-endpoint.port";
import {
  createWebhooksRoutes,
  type WebhooksRoutesDeps,
} from "../../../infra/http/routes/webhooks/webhooks";

const ORG_ID = "org-1";
const USER_ID = "user-1";

const ENDPOINT: WebhookEndpointRecord = {
  id: "ep-A",
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

const DELIVERY: WebhookDeliveryRecord = {
  id: "del-1",
  endpointId: "ep-A",
  outboxEventId: "outbox-1",
  eventType: "user.created",
  payload: { userId: "u1" },
  status: "success",
  attempts: 1,
  nextAttemptAt: Option.none(),
  lastError: Option.none(),
  lastResponseStatus: Option.some(200),
  idempotencyKey: "outbox-1:ep-A",
  createdAt: new Date("2024-01-01"),
};

const DELIVERY_DETAIL: WebhookDeliveryWithAttempts = {
  ...DELIVERY,
  attemptHistory: [
    {
      id: "att-1",
      deliveryId: "del-1",
      attemptNumber: 1,
      requestHeaders: Option.some({ "content-type": "application/json" }),
      requestBody: Option.some("{}"),
      responseStatus: Option.some(200),
      responseHeaders: Option.none(),
      responseBody: Option.none(),
      durationMs: Option.some(12),
      error: Option.none(),
      createdAt: new Date("2024-01-01"),
    },
  ],
};

let deps = makeDeps();

function makeDeps() {
  return {
    CreateEndpointUseCase: mockPort<WebhooksRoutesDeps["CreateEndpointUseCase"]>(),
    UpdateEndpointUseCase: mockPort<WebhooksRoutesDeps["UpdateEndpointUseCase"]>(),
    DeleteEndpointUseCase: mockPort<WebhooksRoutesDeps["DeleteEndpointUseCase"]>(),
    SendTestDeliveryUseCase: mockPort<WebhooksRoutesDeps["SendTestDeliveryUseCase"]>(),
    RotateEndpointSecretUseCase: mockPort<WebhooksRoutesDeps["RotateEndpointSecretUseCase"]>(),
    ReplayDeliveryUseCase: mockPort<WebhooksRoutesDeps["ReplayDeliveryUseCase"]>(),
    IListEndpointsQuery: mockPort<WebhooksRoutesDeps["IListEndpointsQuery"]>(),
    IListDeliveriesQuery: mockPort<WebhooksRoutesDeps["IListDeliveriesQuery"]>(),
    IGetDeliveryQuery: mockPort<WebhooksRoutesDeps["IGetDeliveryQuery"]>(),
  };
}

beforeEach(() => {
  deps = makeDeps();
  deps.IListEndpointsQuery.execute.mockResolvedValue(Result.ok([ENDPOINT]));
  deps.UpdateEndpointUseCase.execute.mockResolvedValue(Result.ok(ENDPOINT));
  deps.RotateEndpointSecretUseCase.execute.mockResolvedValue(
    Result.ok({ endpoint: ENDPOINT, plaintextSecret: "whsec_new" }),
  );
  deps.ReplayDeliveryUseCase.execute.mockResolvedValue(Result.ok(DELIVERY));
  deps.IGetDeliveryQuery.execute.mockResolvedValue(Result.ok(DELIVERY_DETAIL));
});

function makeApp() {
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
    "/webhooks",
    createWebhooksRoutes({
      routeGuards: openRouteGuards({ userId: USER_ID, orgId: ORG_ID }),
      ...deps,
    }),
  );
  return app;
}

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const objectBody = z.record(z.string(), z.unknown());
const listBody = z.object({ items: z.array(objectBody) });

describe("not found keeps its http contract", () => {
  it("answers 404 with the endpoint message when the endpoint is absent from the organization", async () => {
    deps.IListDeliveriesQuery.execute.mockResolvedValue(Result.fail(ENDPOINT_NOT_FOUND));

    const res = await makeApp().request("/webhooks/ep-B/deliveries");

    expect(res.status).toBe(404);
    expect(errorBody.parse(await res.json()).error).toMatchObject({
      code: "HTTP_404",
      message: "Webhook endpoint not found",
    });
  });

  it("answers 404 with the delivery message when the delivery belongs to another endpoint", async () => {
    deps.IGetDeliveryQuery.execute.mockResolvedValue(Result.fail(DELIVERY_NOT_FOUND));

    const res = await makeApp().request("/webhooks/ep-A/deliveries/del-other");

    expect(res.status).toBe(404);
    expect(errorBody.parse(await res.json()).error.message).toBe("Webhook delivery not found");
    const [input] = deps.IGetDeliveryQuery.execute.mock.calls.map(([call]) => call);
    expect(input).toEqual({ deliveryId: "del-other", endpointId: "ep-A", organizationId: ORG_ID });
  });

  it("keeps any other failure on its own error code", async () => {
    deps.CreateEndpointUseCase.execute.mockResolvedValue(
      Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: "destination is not public" }),
    );

    const res = await makeApp().request("/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/hook", eventTypes: ["user.created"] }),
    });

    expect(res.status).toBe(403);
    expect(errorBody.parse(await res.json()).error.code).toBe("WEBHOOK_URL_FORBIDDEN");
  });
});

describe("route inputs", () => {
  it("refuses a malformed endpoint id before reaching the use case", async () => {
    const res = await makeApp().request("/webhooks/not%20an%20id/rotate-secret", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(deps.RotateEndpointSecretUseCase.execute).not.toHaveBeenCalled();
  });

  it("refuses a malformed delivery id before reaching the use case", async () => {
    const res = await makeApp().request("/webhooks/ep-A/deliveries/bad%24id/replay", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect(deps.ReplayDeliveryUseCase.execute).not.toHaveBeenCalled();
  });

  it("hands the signed-in user to the replay as its actor", async () => {
    const res = await makeApp().request("/webhooks/ep-A/deliveries/del-1/replay", {
      method: "POST",
    });

    expect(res.status).toBe(201);
    const [input] = deps.ReplayDeliveryUseCase.execute.mock.calls.map(([call]) => call);
    expect(input).toEqual({
      deliveryId: "del-1",
      endpointId: "ep-A",
      organizationId: ORG_ID,
      actorUserId: USER_ID,
    });
  });
});

describe("no secret cipher leaves the server", () => {
  it("lists endpoints without the current or the previous cipher", async () => {
    const res = await makeApp().request("/webhooks");

    expect(res.status).toBe(200);
    const [item] = listBody.parse(await res.json()).items;
    expect(item).not.toHaveProperty("secretCipher");
    expect(item).not.toHaveProperty("previousSecretCipher");
    expect(item?.previousSecretExpiresAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("updates an endpoint without returning the previous cipher during the grace window", async () => {
    const res = await makeApp().request("/webhooks/ep-A", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.status).toBe(200);
    const body = objectBody.parse(await res.json());
    expect(body).not.toHaveProperty("secretCipher");
    expect(body).not.toHaveProperty("previousSecretCipher");
  });

  it("returns the new plaintext secret once on rotation and no cipher", async () => {
    const res = await makeApp().request("/webhooks/ep-A/rotate-secret", { method: "POST" });

    expect(res.status).toBe(200);
    const body = objectBody.parse(await res.json());
    expect(body.secret).toBe("whsec_new");
    expect(body).not.toHaveProperty("secretCipher");
    expect(body).not.toHaveProperty("previousSecretCipher");
  });
});

describe("delivery serialization", () => {
  it("returns a delivery with its attempt history and absent values as null", async () => {
    const res = await makeApp().request("/webhooks/ep-A/deliveries/del-1");

    expect(res.status).toBe(200);
    const body = objectBody.parse(await res.json());
    expect(body).toMatchObject({
      id: "del-1",
      payload: { userId: "u1" },
      nextAttemptAt: null,
      lastResponseStatus: 200,
      attemptHistory: [
        { attemptNumber: 1, responseStatus: 200, responseHeaders: null, durationMs: 12 },
      ],
    });
  });

  it("lists deliveries without their payload", async () => {
    deps.IListDeliveriesQuery.execute.mockResolvedValue(
      Result.ok({ items: [DELIVERY], nextCursor: Option.none() }),
    );

    const res = await makeApp().request("/webhooks/ep-A/deliveries");

    expect(res.status).toBe(200);
    const body = z
      .object({ items: z.array(objectBody), nextCursor: z.null() })
      .parse(await res.json());
    expect(body.items[0]).not.toHaveProperty("payload");
  });
});
