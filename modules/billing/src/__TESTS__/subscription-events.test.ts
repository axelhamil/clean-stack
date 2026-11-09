import { describe, expect, it } from "bun:test";
import { EventTypes } from "@packages/events";
import {
  authorizeSubscriptionReference,
  subscriptionEventSource,
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

  it("announces the end of a subscription once, whichever Stripe event carries it", () => {
    const deleted = subscriptionEventSource("canceled", "evt_deleted", "sub_1");
    const updated = subscriptionEventSource("canceled", "evt_updated", "sub_1");

    expect(deleted).toBe(updated);
  });

  it("announces a status that can come back once per Stripe event", () => {
    const first = subscriptionEventSource("unpaid", "evt_1", "sub_1");
    const second = subscriptionEventSource("unpaid", "evt_2", "sub_1");

    expect(first).not.toBe(second);
  });
});
