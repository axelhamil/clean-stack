import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import { type EntitlementsView, entitlementsForTier, isTier } from "../../config";
import type { ISubscriptionReadStore } from "../ports/subscription-read.port";

export class EntitlementsService {
  constructor(
    private readonly store: ISubscriptionReadStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async getEntitlements(orgId: string): Promise<EntitlementsView> {
    return this.instrumentation.startSpan(
      { name: "EntitlementsService > getEntitlements" },
      async () => {
        const result = await this.store.findActiveByReference(orgId);
        if (result.isFailure) {
          this.instrumentation.capture(new Error(result.getError().message));
          return { tier: "free", status: "free", ...entitlementsForTier("free") };
        }
        const row = result.getValue();
        if (row.isNone()) return { tier: "free", status: "free", ...entitlementsForTier("free") };
        const { tier: rawTier, status } = row.unwrap();
        const tier = isTier(rawTier) ? rawTier : "free";
        return { tier, status, ...entitlementsForTier(tier) };
      },
    );
  }
}
