import {
  type EntitlementsView,
  entitlementsForTier,
  isTier,
} from "../../../../shared/entitlements";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IPlanOverrideStore } from "../../../../shared/ports/plan-override.port";
import type { ISubscriptionReadStore } from "../ports/subscription-read.port";

const OVERRIDE_STATUS = "override";

function freeView(): EntitlementsView {
  return { tier: "free", status: "free", ...entitlementsForTier("free") };
}

export class EntitlementsService {
  constructor(
    private readonly store: ISubscriptionReadStore,
    private readonly overrides: IPlanOverrideStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async getEntitlements(orgId: string): Promise<EntitlementsView> {
    return this.instrumentation.startSpan(
      { name: "EntitlementsService > getEntitlements" },
      async () => {
        const override = await this.overrides.findActive(orgId);
        if (override.isFailure) {
          this.instrumentation.capture(new Error(override.getError().message));
          return freeView();
        }

        const result = await this.store.findActiveByReference(orgId);
        if (result.isFailure) {
          this.instrumentation.capture(new Error(result.getError().message));
          return freeView();
        }

        const row = result.getValue();
        const overrideTier = override
          .getValue()
          .map(({ tier }) => tier)
          .toNull();

        if (overrideTier !== null && isTier(overrideTier)) {
          const status = row.isSome() ? row.unwrap().status : OVERRIDE_STATUS;

          return { tier: overrideTier, status, ...entitlementsForTier(overrideTier) };
        }

        if (row.isNone()) return freeView();

        const { tier: rawTier, status } = row.unwrap();
        const tier = isTier(rawTier) ? rawTier : "free";

        return { tier, status, ...entitlementsForTier(tier) };
      },
    );
  }
}
