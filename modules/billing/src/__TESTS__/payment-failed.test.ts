import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import { paymentFailureOf } from "../infrastructure/adapters/stripe-payment-failure";

function invoiceEvent(type: string, status: string, referenceId?: string) {
  const event: unknown = {
    id: "evt_1",
    type,
    data: {
      object: {
        id: "in_1",
        status,
        parent: {
          subscription_details: { subscription: "sub_1", metadata: { referenceId } },
        },
      },
    },
  };

  return event as Stripe.Event;
}

describe("paymentFailureOf", () => {
  it("announces an invoice still unpaid", () => {
    const failure = paymentFailureOf(invoiceEvent("invoice.payment_failed", "open", "org-1"));

    const { organizationId, subscriptionId, invoiceId } = failure.unwrap();
    expect({ organizationId, subscriptionId: subscriptionId.unwrapOr("none"), invoiceId }).toEqual({
      organizationId: "org-1",
      subscriptionId: "sub_1",
      invoiceId: "in_1",
    });
  });

  it("announces nothing once the invoice was paid", () => {
    const failure = paymentFailureOf(invoiceEvent("invoice.payment_failed", "paid", "org-1"));

    expect(failure.isNone()).toBe(true);
  });

  it("announces nothing for another event or an invoice with no organization", () => {
    expect(paymentFailureOf(invoiceEvent("invoice.paid", "paid", "org-1")).isNone()).toBe(true);
    expect(paymentFailureOf(invoiceEvent("invoice.payment_failed", "open")).isNone()).toBe(true);
  });
});
