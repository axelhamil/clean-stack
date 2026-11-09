import { Option } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type {
  IStripeEventGateway,
  StripeSubscriptionState,
} from "../../application/ports/stripe-event.port";
import type {
  ISubscriptionSyncStore,
  SubscriptionSyncKey,
} from "../../application/ports/subscription-sync.port";

const UNVERIFIABLE = "The subscription sync could not be verified.";

function differs(a: StripeSubscriptionState, b: StripeSubscriptionState): boolean {
  return a.status !== b.status || a.cancelAtPeriodEnd !== b.cancelAtPeriodEnd;
}

function keyOf(id: string, metadata: Stripe.Metadata | null): SubscriptionSyncKey {
  return { stripeSubscriptionId: id, localId: Option.fromNullable(metadata?.subscriptionId) };
}

export class StripeSyncVerifier {
  constructor(
    private readonly subscriptions: ISubscriptionSyncStore,
    private readonly gateway: IStripeEventGateway,
    private readonly configuredPriceIds: () => Promise<readonly string[]>,
  ) {}

  async check(event: Stripe.Event): Promise<Option<string>> {
    switch (event.type) {
      case "checkout.session.completed":
        return this.checkCheckout(event.data.object);
      case "customer.subscription.created": {
        const subscription = event.data.object;
        const key = keyOf(subscription.id, subscription.metadata);

        return this.checkExists(key, () => this.missingRow(subscription));
      }
      case "customer.subscription.updated": {
        const { id, metadata, status, cancel_at_period_end } = event.data.object;

        return this.checkMatches(keyOf(id, metadata), {
          status,
          cancelAtPeriodEnd: cancel_at_period_end,
        });
      }
      case "customer.subscription.deleted":
        return this.checkCanceled(event.data.object);
      default:
        return Option.none();
    }
  }

  private checkCheckout(session: Stripe.Checkout.Session): Promise<Option<string>> {
    const hasReference = session.client_reference_id || session.metadata?.referenceId;
    const isHandled =
      session.mode === "subscription" &&
      typeof session.subscription === "string" &&
      session.metadata?.subscriptionId &&
      hasReference;
    if (!isHandled || typeof session.subscription !== "string") {
      return Promise.resolve(Option.none());
    }

    const missing = Option.some(`No local subscription row for ${session.subscription}.`);

    return this.checkExists(
      { stripeSubscriptionId: session.subscription, localId: Option.none() },
      () => Promise.resolve(missing),
    );
  }

  private async missingRow(subscription: Stripe.Subscription): Promise<Option<string>> {
    const priceIds = await this.configuredPriceIds();
    const isOurPlan = subscription.items.data.some(({ price }) => priceIds.includes(price.id));
    if (!isOurPlan) return Option.none();

    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const known = await this.subscriptions.isKnownCustomer(customerId);
    if (known.isFailure) return Option.some(UNVERIFIABLE);
    if (!known.getValue()) return Option.none();

    return Option.some(`No local subscription row for ${subscription.id}.`);
  }

  private async checkExists(
    key: SubscriptionSyncKey,
    whenMissing: () => Promise<Option<string>>,
  ): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState(key);
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    return found.getValue().isNone() ? whenMissing() : Option.none();
  }

  private async checkCanceled(subscription: Stripe.Subscription): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState({
      stripeSubscriptionId: subscription.id,
      localId: Option.none(),
    });
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    const row = found.getValue();
    if (row.isNone()) return this.missingRow(subscription);

    return row.unwrap().status === "canceled"
      ? Option.none()
      : this.againstStripe(subscription.id, row.unwrap());
  }

  private async checkMatches(
    key: SubscriptionSyncKey,
    expected: StripeSubscriptionState,
  ): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState(key);
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    const row = found.getValue();
    if (row.isNone()) return Option.none();

    return differs(row.unwrap(), expected)
      ? this.againstStripe(key.stripeSubscriptionId, row.unwrap())
      : Option.none();
  }

  private async againstStripe(id: string, row: StripeSubscriptionState): Promise<Option<string>> {
    const current = await this.gateway.currentSubscription(id);
    if (current.isFailure) return Option.some(UNVERIFIABLE);

    const atStripe = current.getValue();

    return differs(row, atStripe)
      ? Option.some(`Local status ${row.status}, Stripe ${atStripe.status} for ${id}.`)
      : Option.none();
  }
}
