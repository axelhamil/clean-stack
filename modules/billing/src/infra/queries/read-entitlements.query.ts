import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type { IPlanOverrideReader } from "../../application/ports/repositories/plan-override.port";
import type { ISubscriptionReadStore } from "../../application/ports/repositories/subscription-read.port";
import type { EntitlementsReadError } from "../../application/ports/services/entitlements-reader.port";
import type { EntitlementsInput } from "../../application/queries/get-entitlements.query";
import type { IReadEntitlementsQuery } from "../../application/queries/read-entitlements.query";
import {
  type EntitlementsView,
  viewOf,
} from "../../application/services/entitlement-policy.service";
import { readEntitlementSources } from "./entitlement-sources";

export class StrictEntitlementsQuery implements IReadEntitlementsQuery {
  constructor(
    private readonly subscriptions: ISubscriptionReadStore,
    private readonly overrides: IPlanOverrideReader,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute({
    organizationId,
  }: EntitlementsInput): Promise<Result<EntitlementsView, EntitlementsReadError>> {
    return this.instrumentation.startSpan(
      { name: "StrictEntitlementsQuery > execute" },
      async () => {
        const [override, subscription, customer] = await readEntitlementSources(
          this.overrides,
          this.subscriptions,
          organizationId,
        );
        if (override.isFailure) return Result.fail(override.getError());
        if (subscription.isFailure) return Result.fail(subscription.getError());
        if (customer.isFailure) return Result.fail(customer.getError());

        return Result.ok(
          viewOf(subscription.getValue(), override.getValue(), customer.getValue().isSome()),
        );
      },
    );
  }
}
