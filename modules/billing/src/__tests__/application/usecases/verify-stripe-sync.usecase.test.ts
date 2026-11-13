import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type Stripe from "stripe";
import type {
  ISubscriptionSyncStore,
  SubscriptionSyncState,
} from "../../../application/ports/repositories/subscription-sync.port";
import type { IStripeEventGateway } from "../../../application/ports/services/stripe-event-gateway.port";
import type { IListConfiguredPriceIdsQuery } from "../../../application/queries/list-configured-price-ids.query";
import { VerifyStripeSyncUseCase } from "../../../application/usecases/verify-stripe-sync/verify-stripe-sync.usecase";
import { syncMismatchOf } from "../../../infra/adapters/stripe-sync-event.adapter";

const ACTIVE = { status: "active", cancelAtPeriodEnd: false };

function eventOf(type: string, object: Record<string, unknown>) {
  const event: unknown = { id: "evt_1", type, data: { object } };

  return event as Stripe.Event;
}

const updatedTo = (status: string) =>
  eventOf("customer.subscription.updated", {
    id: "sub_1",
    status,
    cancel_at_period_end: false,
    metadata: {},
  });

const OUR_PRICE = "price_ours";
const subscriptionObject = (price = OUR_PRICE) => ({
  id: "sub_1",
  status: "canceled",
  customer: "cus_1",
  metadata: {},
  items: { data: [{ price: { id: price } }] },
});

function setup(
  row: SubscriptionSyncState | null,
  atStripe: SubscriptionSyncState = ACTIVE,
  customerKnown = true,
) {
  const store = mockPort<ISubscriptionSyncStore>();
  store.findSyncState.mockImplementation(async () => Result.ok(Option.fromNullable(row)));
  store.isKnownCustomer.mockImplementation(async () => Result.ok(customerKnown));

  const gateway = mockPort<IStripeEventGateway>();
  gateway.currentSubscription.mockImplementation(async () => Result.ok(atStripe));

  const priceIds = mockPort<IListConfiguredPriceIdsQuery>();
  priceIds.execute.mockResolvedValue(Result.ok([OUR_PRICE]));

  const useCase = new VerifyStripeSyncUseCase(store, gateway, priceIds);
  const check = (event: Stripe.Event) => syncMismatchOf(useCase, event);

  return { store, gateway, check };
}

describe("VerifyStripeSyncUseCase fed by a Stripe event", () => {
  it("has nothing to say when the row holds what the event carries", async () => {
    const { check, gateway } = setup(ACTIVE);

    const mismatch = await check(updatedTo("active"));

    expect(mismatch.isNone()).toBe(true);
    expect(gateway.currentSubscription).not.toHaveBeenCalled();
  });

  it("reports the swallowed sync: the row differs from the event and from Stripe today", async () => {
    const { check } = setup(ACTIVE, { status: "canceled", cancelAtPeriodEnd: false });

    const mismatch = await check(updatedTo("canceled"));

    expect(mismatch.unwrap()).toContain("active");
    expect(mismatch.unwrap()).toContain("canceled");
  });

  it("raises no alarm for a stale event: the row already holds Stripe's current state", async () => {
    const current = { status: "canceled", cancelAtPeriodEnd: false };
    const { check } = setup(current, current);

    const mismatch = await check(updatedTo("active"));

    expect(mismatch.isNone()).toBe(true);
  });

  it("expects a deleted subscription to read canceled", async () => {
    const { check } = setup(ACTIVE, { status: "canceled", cancelAtPeriodEnd: false });

    const mismatch = await check(eventOf("customer.subscription.deleted", subscriptionObject()));

    expect(mismatch.isSome()).toBe(true);
  });

  it("only asks a created subscription to exist, the checkout completes it later", async () => {
    const created = eventOf("customer.subscription.created", {
      ...subscriptionObject(),
      metadata: { subscriptionId: "local-1" },
    });

    const incomplete = setup({ status: "incomplete", cancelAtPeriodEnd: false });
    const missing = setup(null);

    expect((await incomplete.check(created)).isNone()).toBe(true);
    expect((await missing.check(created)).isSome()).toBe(true);
    expect(incomplete.store.findSyncState).toHaveBeenCalledWith({
      stripeSubscriptionId: "sub_1",
      localId: Option.some("local-1"),
    });
  });

  it("raises no alarm for a subscription the plugin refuses on purpose", async () => {
    const created = (price: string) =>
      eventOf("customer.subscription.created", subscriptionObject(price));
    const deleted = eventOf("customer.subscription.deleted", subscriptionObject("price_other"));

    expect((await setup(null).check(created("price_other"))).isNone()).toBe(true);
    expect((await setup(null).check(deleted)).isNone()).toBe(true);
    expect((await setup(null, ACTIVE, false).check(created(OUR_PRICE))).isNone()).toBe(true);
  });

  it("still reports a missing row for a known customer on a configured plan", async () => {
    const deleted = eventOf("customer.subscription.deleted", subscriptionObject());

    expect((await setup(null).check(deleted)).isSome()).toBe(true);
  });

  it("leaves a missing row to the created event when an update arrives before it", async () => {
    const { check } = setup(null);

    const mismatch = await check(updatedTo("active"));

    expect(mismatch.isNone()).toBe(true);
  });

  it("reports a completed checkout whose subscription never landed", async () => {
    const { check } = setup(null);

    const mismatch = await check(
      eventOf("checkout.session.completed", {
        mode: "subscription",
        subscription: "sub_1",
        client_reference_id: "org-1",
        metadata: { subscriptionId: "local-1" },
      }),
    );

    expect(mismatch.isSome()).toBe(true);
  });

  it("leaves a checkout the plugin does not handle alone", async () => {
    const { check, store } = setup(null);

    const mismatch = await check(
      eventOf("checkout.session.completed", { mode: "payment", subscription: null, metadata: {} }),
    );

    expect(mismatch.isNone()).toBe(true);
    expect(store.findSyncState).not.toHaveBeenCalled();
  });

  it("records an unverifiable sync rather than claiming it worked", async () => {
    const { check, store } = setup(ACTIVE);
    store.findSyncState.mockImplementation(async () =>
      Result.fail({ code: "BILLING_PROVIDER_FAILURE", message: "db down" }),
    );

    const mismatch = await check(updatedTo("active"));

    expect(mismatch.isSome()).toBe(true);
  });

  it("says nothing about an event that only means received", async () => {
    const { check, store } = setup(null);

    const mismatch = await check(eventOf("invoice.paid", { id: "in_1" }));

    expect(mismatch.isNone()).toBe(true);
    expect(store.findSyncState).not.toHaveBeenCalled();
  });
});
