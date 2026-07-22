import { describe, expect, it } from "vitest";
import { EventTypes } from "../event-types";
import { PayloadByEventType } from "../payloads";
import { RETENTION_MAP } from "../retention-map";

describe("billing events", () => {
  it("declares the 4 billing event types", () => {
    expect(EventTypes.BILLING_SUBSCRIPTION_CREATED).toBe("billing.subscription.created");
    expect(EventTypes.BILLING_SUBSCRIPTION_UPDATED).toBe("billing.subscription.updated");
    expect(EventTypes.BILLING_SUBSCRIPTION_CANCELLED).toBe("billing.subscription.cancelled");
    expect(EventTypes.BILLING_PAYMENT_FAILED).toBe("billing.payment.failed");
  });

  it("validates a subscription.created payload with nullable actor", () => {
    const schema = PayloadByEventType[EventTypes.BILLING_SUBSCRIPTION_CREATED];
    const ok = schema.safeParse({
      organizationId: "org1",
      subscriptionId: "sub1",
      tier: "pro",
      status: "active",
      actorUserId: null,
      currentPeriodEnd: new Date().toISOString(),
    });
    expect(ok.success).toBe(true);
  });

  it("maps all billing events to compliance retention", () => {
    expect(RETENTION_MAP[EventTypes.BILLING_SUBSCRIPTION_CREATED]).toBe("compliance");
    expect(RETENTION_MAP[EventTypes.BILLING_SUBSCRIPTION_UPDATED]).toBe("compliance");
    expect(RETENTION_MAP[EventTypes.BILLING_SUBSCRIPTION_CANCELLED]).toBe("compliance");
    expect(RETENTION_MAP[EventTypes.BILLING_PAYMENT_FAILED]).toBe("compliance");
  });
});
