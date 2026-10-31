import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import {
  StripeEventGateway,
  type StripeEventsClient,
} from "../infrastructure/adapters/stripe-event.gateway";

const SECRETS = { secretKey: "sk_test_x", webhookSecret: "whsec_x" };

function eventOf(type: string, object: unknown) {
  return { id: "evt_1", type, data: { object } };
}

function gatewayOver(event: unknown, current: unknown) {
  const client: StripeEventsClient = {
    events: { retrieve: async () => event as Stripe.Event },
    subscriptions: { retrieve: async () => current as Stripe.Subscription },
    webhooks: { generateTestHeaderStringAsync: async () => "t=1,v1=signature" },
  };
  const gateway = new StripeEventGateway(client, SECRETS, new NoOpInstrumentation());

  return { gateway };
}

describe("StripeEventGateway", () => {
  it("never replays an old subscription snapshot over the current state", async () => {
    const { gateway } = gatewayOver(
      eventOf("customer.subscription.updated", { id: "sub_1", status: "active" }),
      { id: "sub_1", status: "canceled" },
    );

    const copy = await gateway.retrieve("evt_1");

    expect(JSON.parse(copy.getValue().payload).data.object.status).toBe("canceled");
  });

  it("keeps any other event as Stripe stored it", async () => {
    const { gateway } = gatewayOver(eventOf("invoice.payment_failed", { id: "in_1" }), null);

    const copy = await gateway.retrieve("evt_1");

    expect(JSON.parse(copy.getValue().payload).data.object.id).toBe("in_1");
  });

  it("reports a delivery the handler refused", async () => {
    const gateway = new StripeEventGateway(gatewayClient(), SECRETS, new NoOpInstrumentation());

    const result = await gateway.redeliver(
      { payload: "{}" },
      async () => new Response(null, { status: 400 }),
    );

    expect(result.getError().code).toBe("ADMIN_STRIPE_PROVIDER_FAILURE");
  });

  it("is not configured without both Stripe secrets", () => {
    const gateway = new StripeEventGateway(
      gatewayClient(),
      { secretKey: "sk_test_x", webhookSecret: undefined },
      new NoOpInstrumentation(),
    );

    expect(gateway.isConfigured()).toBe(false);
  });
});

function gatewayClient(): StripeEventsClient {
  return {
    events: { retrieve: async () => eventOf("x", {}) as Stripe.Event },
    subscriptions: { retrieve: async () => ({}) as Stripe.Subscription },
    webhooks: { generateTestHeaderStringAsync: async () => "" },
  };
}
