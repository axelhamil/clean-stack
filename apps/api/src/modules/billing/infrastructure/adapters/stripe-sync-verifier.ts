import { Option } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type {
  IStripeEventGateway,
  StripeSubscriptionState,
} from "../../../../shared/ports/stripe-event.port";
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
  ) {}

  async check(event: Stripe.Event): Promise<Option<string>> {
    switch (event.type) {
      case "checkout.session.completed":
        return this.checkCheckout(event.data.object);
      case "customer.subscription.created": {
        const { id, metadata } = event.data.object;

        return this.checkExists(keyOf(id, metadata));
      }
      case "customer.subscription.updated": {
        const { id, metadata, status, cancel_at_period_end } = event.data.object;

        return this.checkMatches(keyOf(id, metadata), {
          status,
          cancelAtPeriodEnd: cancel_at_period_end,
        });
      }
      case "customer.subscription.deleted": {
        const { id } = event.data.object;
        const key = { stripeSubscriptionId: id, localId: Option.none<string>() };

        return this.checkCanceled(key);
      }
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

    return this.checkExists({
      stripeSubscriptionId: session.subscription,
      localId: Option.none(),
    });
  }

  private async checkExists(key: SubscriptionSyncKey): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState(key);
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    return found.getValue().isNone()
      ? Option.some(`No local subscription row for ${key.stripeSubscriptionId}.`)
      : Option.none();
  }

  private async checkCanceled(key: SubscriptionSyncKey): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState(key);
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    const row = found.getValue();
    if (row.isNone()) {
      return Option.some(`No local subscription row for ${key.stripeSubscriptionId}.`);
    }

    return row.unwrap().status === "canceled"
      ? Option.none()
      : this.againstStripe(key.stripeSubscriptionId, row.unwrap());
  }

  private async checkMatches(
    key: SubscriptionSyncKey,
    expected: StripeSubscriptionState,
  ): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState(key);
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    const row = found.getValue();
    if (row.isNone()) {
      return Option.some(`No local subscription row for ${key.stripeSubscriptionId}.`);
    }

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
