import { Option, Result } from "@packages/ddd-kit";
import {
  type EntitlementsView,
  entitlementsForTier,
  isTier,
} from "../../../../shared/entitlements";
import type { EntitlementsReadError } from "../../../../shared/ports/entitlements-reader.port";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  ActivePlanOverride,
  IPlanOverrideReader,
} from "../../../../shared/ports/plan-override.port";
import type { ISubscriptionReadStore, SubscriptionRow } from "../ports/subscription-read.port";

const OVERRIDE_STATUS = "override";

function freeView(hasSubscription = false): EntitlementsView {
  return { tier: "free", status: "free", hasSubscription, ...entitlementsForTier("free") };
}

function viewOf(
  subscription: Option<SubscriptionRow>,
  override: Option<ActivePlanOverride>,
  hasSubscription: boolean,
): EntitlementsView {
  const overrideTier = override.map(({ tier }) => tier).toNull();

  if (overrideTier !== null && isTier(overrideTier)) {
    const status = subscription.isSome() ? subscription.unwrap().status : OVERRIDE_STATUS;

    return { tier: overrideTier, status, hasSubscription, ...entitlementsForTier(overrideTier) };
  }

  if (subscription.isNone()) return freeView(hasSubscription);

  const { tier: rawTier, status } = subscription.unwrap();
  const tier = isTier(rawTier) ? rawTier : "free";

  return { tier, status, hasSubscription, ...entitlementsForTier(tier) };
}

export class EntitlementsService {
  constructor(
    private readonly store: ISubscriptionReadStore,
    private readonly overrides: IPlanOverrideReader,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async getEntitlements(orgId: string): Promise<EntitlementsView> {
    return this.instrumentation.startSpan(
      { name: "EntitlementsService > getEntitlements" },
      async () => {
        const [override, subscription, customer] = await this.readSources(orgId);
        if (customer.isFailure)
          this.instrumentation.capture(new Error(customer.getError().message));
        const hasSubscription = customer.isSuccess && customer.getValue().isSome();

        if (subscription.isFailure) {
          this.instrumentation.capture(new Error(subscription.getError().message));
          return freeView();
        }

        if (override.isFailure) {
          this.instrumentation.capture(new Error(override.getError().message));
          return viewOf(subscription.getValue(), Option.none(), hasSubscription);
        }

        return viewOf(subscription.getValue(), override.getValue(), hasSubscription);
      },
    );
  }

  async readEntitlements(orgId: string): Promise<Result<EntitlementsView, EntitlementsReadError>> {
    return this.instrumentation.startSpan(
      { name: "EntitlementsService > readEntitlements" },
      async () => {
        const [override, subscription, customer] = await this.readSources(orgId);
        if (override.isFailure) return Result.fail(override.getError());
        if (subscription.isFailure) return Result.fail(subscription.getError());
        if (customer.isFailure) return Result.fail(customer.getError());

        return Result.ok(
          viewOf(subscription.getValue(), override.getValue(), customer.getValue().isSome()),
        );
      },
    );
  }

  private readSources(orgId: string) {
    return Promise.all([
      this.overrides.findActive(orgId),
      this.store.findActiveByReference(orgId),
      this.store.findCustomerIdByReference(orgId),
    ]);
  }
}
