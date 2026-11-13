import { type IUseCase, Option, Result } from "@packages/ddd-kit";
import type {
  ISubscriptionSyncStore,
  SubscriptionSyncKey,
} from "../../ports/repositories/subscription-sync.port";
import type {
  IStripeEventGateway,
  StripeSubscriptionState,
} from "../../ports/services/stripe-event-gateway.port";
import type { IListConfiguredPriceIdsQuery } from "../../queries/list-configured-price-ids.query";
import type {
  StripeSubscriptionPlan,
  VerifyStripeSyncInput,
  VerifyStripeSyncOutput,
} from "./verify-stripe-sync.dto";

const UNVERIFIABLE = "The subscription sync could not be verified.";

function differs(a: StripeSubscriptionState, b: StripeSubscriptionState): boolean {
  return a.status !== b.status || a.cancelAtPeriodEnd !== b.cancelAtPeriodEnd;
}

export class VerifyStripeSyncUseCase
  implements IUseCase<VerifyStripeSyncInput, VerifyStripeSyncOutput, never>
{
  constructor(
    private readonly subscriptions: ISubscriptionSyncStore,
    private readonly gateway: IStripeEventGateway,
    private readonly configuredPriceIds: IListConfiguredPriceIdsQuery,
  ) {}

  async execute(input: VerifyStripeSyncInput): Promise<Result<VerifyStripeSyncOutput, never>> {
    return Result.ok(await this.mismatchOf(input));
  }

  private mismatchOf(input: VerifyStripeSyncInput): Promise<Option<string>> {
    switch (input.kind) {
      case "checkout-completed": {
        const missing = Option.some(`No local subscription row for ${input.stripeSubscriptionId}.`);

        return this.checkExists(
          { stripeSubscriptionId: input.stripeSubscriptionId, localId: Option.none() },
          () => Promise.resolve(missing),
        );
      }
      case "subscription-created":
        return this.checkExists(input.key, () => this.missingRow(input.plan));
      case "subscription-updated":
        return this.checkMatches(input.key, input.state);
      case "subscription-deleted":
        return this.checkCanceled(input.plan);
    }
  }

  private async missingRow(plan: StripeSubscriptionPlan): Promise<Option<string>> {
    const priceIds = (await this.configuredPriceIds.execute()).getValue();
    const isOurPlan = plan.priceIds.some((priceId) => priceIds.includes(priceId));
    if (!isOurPlan) return Option.none();

    const known = await this.subscriptions.isKnownCustomer(plan.customerId);
    if (known.isFailure) return Option.some(UNVERIFIABLE);
    if (!known.getValue()) return Option.none();

    return Option.some(`No local subscription row for ${plan.stripeSubscriptionId}.`);
  }

  private async checkExists(
    key: SubscriptionSyncKey,
    whenMissing: () => Promise<Option<string>>,
  ): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState(key);
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    return found.getValue().isNone() ? whenMissing() : Option.none();
  }

  private async checkCanceled(plan: StripeSubscriptionPlan): Promise<Option<string>> {
    const found = await this.subscriptions.findSyncState({
      stripeSubscriptionId: plan.stripeSubscriptionId,
      localId: Option.none(),
    });
    if (found.isFailure) return Option.some(UNVERIFIABLE);

    const row = found.getValue();
    if (row.isNone()) return this.missingRow(plan);

    return row.unwrap().status === "canceled"
      ? Option.none()
      : this.againstStripe(plan.stripeSubscriptionId, row.unwrap());
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
