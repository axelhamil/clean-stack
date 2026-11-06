import type { IInstrumentation } from "@packages/ddd-kit";
import { ENTITLEMENTS, type Feature, isTier, type Tier } from "../../../../shared/entitlements";
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
  maxMembers: number | null;
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

  async configuredPriceIds(): Promise<string[]> {
    const catalog = await this.getCatalog();

    return catalog.flatMap(({ priceId }) => (priceId === null ? [] : [priceId]));
  }

  async getCatalog(): Promise<PlanCatalogItem[]> {
    if (this.cache && this.now() - this.cache.at < TTL_MS) return this.cache.items;

    return this.instrumentation.startSpan(
      { name: "BillingCatalogService > getCatalog" },
      async () => {
        const prices = await this.source.listActivePrices();
        // Adapter already captured to telemetry (§8). Degrade to free-only;
        // do not cache so the next call retries Stripe when it recovers.
        if (prices.isFailure) return [this.buildFreeEntry()];

        const paid: PlanCatalogItem[] = prices.getValue().flatMap((p) => {
          const tier = p.tier;
          if (!isTier(tier) || tier === "free") return [];

          const ent = ENTITLEMENTS[tier];
          return [
            {
              tier,
              name: p.productName,
              priceId: p.priceId,
              unitAmount: p.unitAmount,
              currency: p.currency,
              interval: p.interval.isSome() ? p.interval.unwrap() : null,
              marketingFeatures: p.marketingFeatures,
              rank: ent.rank,
              features: ent.features,
              maxMembers: ent.maxMembers,
            },
          ];
        });

        const items = [this.buildFreeEntry(paid[0]?.currency), ...paid].sort(
          (a, b) => a.rank - b.rank,
        );
        this.cache = { at: this.now(), items };
        return items;
      },
    );
  }
}
