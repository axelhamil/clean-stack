import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import { ENTITLEMENTS, type Feature, isTier, type Tier } from "../../config";
import type { IStripeCatalogSource } from "../ports/stripe-catalog.port";

export interface PlanCatalogItem {
  tier: Tier;
  name: string;
  priceId: string | null;
  unitAmount: number;
  currency: string;
  interval: string | null;
  marketingFeatures: string[];
  rank: number;
  features: Feature[];
  maxMembers: number;
}

const TTL_MS = 5 * 60 * 1000;

export class BillingCatalogService {
  private cache: { at: number; items: PlanCatalogItem[] } | null = null;

  constructor(
    private readonly source: IStripeCatalogSource,
    private readonly instrumentation: IInstrumentation,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private buildFreeEntry(currency = "usd"): PlanCatalogItem {
    return {
      tier: "free",
      name: "Free",
      priceId: null,
      unitAmount: 0,
      currency,
      interval: null,
      marketingFeatures: [],
      rank: ENTITLEMENTS.free.rank,
      features: ENTITLEMENTS.free.features,
      maxMembers: ENTITLEMENTS.free.maxMembers,
    };
  }

  async getCatalog(): Promise<PlanCatalogItem[]> {
    if (this.cache && this.now() - this.cache.at < TTL_MS) return this.cache.items;

    return this.instrumentation.startSpan(
      { name: "BillingCatalogService > getCatalog" },
      async () => {
        try {
          const prices = await this.source.listActivePrices();
          const paid: PlanCatalogItem[] = prices
            .filter((p) => isTier(p.tier) && p.tier !== "free")
            .map((p) => {
              const tier = p.tier as Tier;
              const ent = ENTITLEMENTS[tier];
              return {
                tier,
                name: p.productName,
                priceId: p.priceId,
                unitAmount: p.unitAmount,
                currency: p.currency,
                interval: p.interval,
                marketingFeatures: p.marketingFeatures,
                rank: ent.rank,
                features: ent.features,
                maxMembers: ent.maxMembers,
              };
            });

          const items = [this.buildFreeEntry(paid[0]?.currency), ...paid].sort(
            (a, b) => a.rank - b.rank,
          );
          this.cache = { at: this.now(), items };
          return items;
        } catch {
          // Adapter already captured to telemetry (§8). Degrade to free-only;
          // do not cache so the next call retries Stripe when it recovers.
          return [this.buildFreeEntry()];
        }
      },
    );
  }
}
