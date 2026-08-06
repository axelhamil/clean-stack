import { describe, expect, it } from "vitest";
import { ALL_EVENT_TYPES, EventTypes } from "../event-types";
import {
  WebhookDeliveryExhaustedPayload,
  WebhookEndpointDisabledPayload,
  WebhookEndpointSecretRotatedPayload,
  WebhookTestPayload,
} from "../payloads";
import { RETENTION_MAP } from "../retention-map";

describe("webhook SOTA events", () => {
  it("catalog contains exactly 65 event types", () => {
    expect(ALL_EVENT_TYPES).toHaveLength(65);
  });

  it("declares the 4 new event constants", () => {
    expect(EventTypes.WEBHOOK_TEST).toBe("webhook.test");
    expect(EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED).toBe("webhook.endpoint.secret_rotated");
    expect(EventTypes.WEBHOOK_ENDPOINT_DISABLED).toBe("webhook.endpoint.disabled");
    expect(EventTypes.WEBHOOK_DELIVERY_EXHAUSTED).toBe("webhook.delivery.exhausted");
  });

  it("test payload requires org + endpoint + actor", () => {
    expect(
      WebhookTestPayload.safeParse({ organizationId: "o1", endpointId: "e1", actorUserId: "u1" })
        .success,
    ).toBe(true);
    expect(WebhookTestPayload.safeParse({ organizationId: "o1", endpointId: "e1" }).success).toBe(
      false,
    );
  });

  it("secret-rotated payload requires actor", () => {
    expect(
      WebhookEndpointSecretRotatedPayload.safeParse({
        organizationId: "o1",
        endpointId: "e1",
        actorUserId: "u1",
      }).success,
    ).toBe(true);
    expect(
      WebhookEndpointSecretRotatedPayload.safeParse({ organizationId: "o1", endpointId: "e1" })
        .success,
    ).toBe(false);
  });

  it("disabled + exhausted payloads allow a null system actor", () => {
    expect(
      WebhookEndpointDisabledPayload.safeParse({
        organizationId: "o1",
        endpointId: "e1",
        actorUserId: null,
        reason: "delivery_failures",
        consecutiveFailures: 7,
      }).success,
    ).toBe(true);
    expect(
      WebhookDeliveryExhaustedPayload.safeParse({
        organizationId: "o1",
        endpointId: "e1",
        deliveryId: "d1",
        eventType: "user.created",
        attempts: 7,
        actorUserId: null,
      }).success,
    ).toBe(true);
  });

  it("retention: rotated=compliance, others=operational", () => {
    expect(RETENTION_MAP[EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED]).toBe("compliance");
    expect(RETENTION_MAP[EventTypes.WEBHOOK_TEST]).toBe("operational");
    expect(RETENTION_MAP[EventTypes.WEBHOOK_ENDPOINT_DISABLED]).toBe("operational");
    expect(RETENTION_MAP[EventTypes.WEBHOOK_DELIVERY_EXHAUSTED]).toBe("operational");
  });
});
