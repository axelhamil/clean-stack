import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type { IPlanOverrideReader } from "../../application/ports/repositories/plan-override.port";
import type { ISubscriptionReadStore } from "../../application/ports/repositories/subscription-read.port";
import type {
  EntitlementsInput,
  IGetEntitlementsQuery,
} from "../../application/queries/get-entitlements.query";
import {
  type EntitlementsView,
  freeView,
  viewOf,
} from "../../application/services/entitlement-policy.service";
import { readEntitlementSources } from "./entitlement-sources";

export class FailClosedEntitlementsQuery implements IGetEntitlementsQuery {
  constructor(
    private readonly subscriptions: ISubscriptionReadStore,
    private readonly overrides: IPlanOverrideReader,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute({ organizationId }: EntitlementsInput): Promise<Result<EntitlementsView, never>> {
    return this.instrumentation.startSpan(
      { name: "FailClosedEntitlementsQuery > execute" },
      async () => {
        const [override, subscription, customer] = await readEntitlementSources(
          this.overrides,
          this.subscriptions,
          organizationId,
        );
        if (customer.isFailure) {
          this.instrumentation.capture(new Error(customer.getError().message));
        }
        const hasSubscription = customer.isSuccess && customer.getValue().isSome();

        if (subscription.isFailure) {
          this.instrumentation.capture(new Error(subscription.getError().message));
          return Result.ok(freeView());
        }

        if (override.isFailure) {
          this.instrumentation.capture(new Error(override.getError().message));
          return Result.ok(viewOf(subscription.getValue(), Option.none(), hasSubscription));
        }

        return Result.ok(viewOf(subscription.getValue(), override.getValue(), hasSubscription));
      },
    );
  }
}
