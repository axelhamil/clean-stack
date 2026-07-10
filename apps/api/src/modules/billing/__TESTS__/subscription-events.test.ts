import { describe, expect, it } from "bun:test";
import { EventTypes } from "@packages/events";
import {
  authorizeSubscriptionReference,
  subscriptionEventType,
} from "../application/subscription-events";

describe("subscription events", () => {
  it("authorizes only owners to act on a subscription reference", () => {
    expect(authorizeSubscriptionReference("owner")).toBe(true);
    expect(authorizeSubscriptionReference("admin")).toBe(false);
    expect(authorizeSubscriptionReference("member")).toBe(false);
    expect(authorizeSubscriptionReference(undefined)).toBe(false);
  });

  it("maps Stripe status to the right event type", () => {
    expect(subscriptionEventType("active")).toBe(EventTypes.BILLING_SUBSCRIPTION_UPDATED);
    expect(subscriptionEventType("canceled")).toBe(EventTypes.BILLING_SUBSCRIPTION_CANCELLED);
    expect(subscriptionEventType("trialing")).toBe(EventTypes.BILLING_SUBSCRIPTION_UPDATED);
  });
});
