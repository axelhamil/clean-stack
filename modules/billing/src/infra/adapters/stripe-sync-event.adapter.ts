import { type IUseCase, Option } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type { SubscriptionSyncKey } from "../../application/ports/repositories/subscription-sync.port";
import type {
  StripeSubscriptionPlan,
  VerifyStripeSyncInput,
  VerifyStripeSyncOutput,
} from "../../application/usecases/verify-stripe-sync/verify-stripe-sync.dto";

export type VerifyStripeSync = Pick<
  IUseCase<VerifyStripeSyncInput, VerifyStripeSyncOutput, never>,
  "execute"
>;

function keyOf(id: string, metadata: Stripe.Metadata | null): SubscriptionSyncKey {
  return { stripeSubscriptionId: id, localId: Option.fromNullable(metadata?.subscriptionId) };
}

function planOf(subscription: Stripe.Subscription): StripeSubscriptionPlan {
  const customer = subscription.customer;

  return {
    stripeSubscriptionId: subscription.id,
    customerId: typeof customer === "string" ? customer : customer.id,
    priceIds: subscription.items.data.map(({ price }) => price.id),
  };
}

function checkoutOf(session: Stripe.Checkout.Session): Option<VerifyStripeSyncInput> {
  const hasReference = session.client_reference_id || session.metadata?.referenceId;
  const isHandled =
    session.mode === "subscription" && session.metadata?.subscriptionId && hasReference;
  if (!isHandled || typeof session.subscription !== "string") return Option.none();

  return Option.some({ kind: "checkout-completed", stripeSubscriptionId: session.subscription });
}

export function syncInputOf(event: Stripe.Event): Option<VerifyStripeSyncInput> {
  switch (event.type) {
    case "checkout.session.completed":
      return checkoutOf(event.data.object);
    case "customer.subscription.created": {
      const subscription = event.data.object;

      return Option.some({
        kind: "subscription-created",
        key: keyOf(subscription.id, subscription.metadata),
        plan: planOf(subscription),
      });
    }
    case "customer.subscription.updated": {
      const { id, metadata, status, cancel_at_period_end } = event.data.object;

      return Option.some({
        kind: "subscription-updated",
        key: keyOf(id, metadata),
        state: { status, cancelAtPeriodEnd: cancel_at_period_end },
      });
    }
    case "customer.subscription.deleted":
      return Option.some({ kind: "subscription-deleted", plan: planOf(event.data.object) });
    default:
      return Option.none();
  }
}

export async function syncMismatchOf(
  verifyStripeSync: VerifyStripeSync,
  event: Stripe.Event,
): Promise<Option<string>> {
  const input = syncInputOf(event);
  if (input.isNone()) return Option.none();

  return (await verifyStripeSync.execute(input.unwrap())).getValue();
}
