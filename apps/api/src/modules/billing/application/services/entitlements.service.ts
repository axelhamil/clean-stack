import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import { type EntitlementsView, entitlementsForTier, isTier } from "../../config";
import type { ISubscriptionReadStore } from "../ports/subscription-read.port";

export class EntitlementsService {
  constructor(
    private readonly store: ISubscriptionReadStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async getEntitlements(orgId: string): Promise<EntitlementsView> {
    const result = await this.store.findActiveByReference(orgId);
    if (result.isFailure) {
      this.instrumentation.capture(new Error(result.getError().message));
      return { tier: "free", status: "free", ...entitlementsForTier("free") };
    }
    const row = result.getValue();
    if (!row) return { tier: "free", status: "free", ...entitlementsForTier("free") };
    const tier = isTier(row.tier) ? row.tier : "free";
    return { tier, status: row.status, ...entitlementsForTier(tier) };
  }
}
