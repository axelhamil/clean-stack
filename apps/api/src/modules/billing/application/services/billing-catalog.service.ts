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

          const free: PlanCatalogItem = {
            tier: "free",
            name: "Free",
            priceId: null,
            unitAmount: 0,
            currency: paid[0]?.currency ?? "usd",
            interval: null,
            marketingFeatures: [],
            rank: ENTITLEMENTS.free.rank,
            features: ENTITLEMENTS.free.features,
            maxMembers: ENTITLEMENTS.free.maxMembers,
          };

          const items = [free, ...paid].sort((a, b) => a.rank - b.rank);
          this.cache = { at: this.now(), items };
          return items;
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}
