import { describe, expect, it, mock } from "bun:test";
import { ENTITLEMENTS } from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  IStripeCatalogSource,
  StripePriceLite,
} from "../application/ports/stripe-catalog.port";
import type { BillingError } from "../application/ports/subscription-read.port";
import { BillingCatalogService } from "../application/services/billing-catalog.service";

const proPrice: StripePriceLite = {
  priceId: "price_pro",
  tier: "pro",
  unitAmount: 2000,
  currency: "usd",
  interval: Option.some("month"),
  productName: "Pro",
  marketingFeatures: ["Audit log", "API access"],
};

function makeSource(prices: StripePriceLite[]): IStripeCatalogSource {
  return { listActivePrices: mock(async () => Result.ok<StripePriceLite[], BillingError>(prices)) };
}

describe("BillingCatalogService", () => {
  it("joins Stripe prices to code entitlements and prepends free, ordered by rank", async () => {
    const svc = new BillingCatalogService(makeSource([proPrice]), mockInstrumentation());
    const catalog = await svc.getCatalog();
    expect(catalog.map((c) => c.tier)).toEqual(["free", "pro"]);
    const pro = catalog[1];
    expect(pro?.priceId).toBe("price_pro");
    expect(pro?.features).toEqual(ENTITLEMENTS.pro.features);
    expect(pro?.maxMembers).toBe(ENTITLEMENTS.pro.maxMembers);
    expect(pro?.marketingFeatures).toEqual(["Audit log", "API access"]);
    const free = catalog[0];
    expect(free?.priceId).toBeNull();
  });

  it("skips prices whose tier is unknown in ENTITLEMENTS", async () => {
    const svc = new BillingCatalogService(
      makeSource([{ ...proPrice, tier: "legacy", priceId: "price_legacy" }]),
      mockInstrumentation(),
    );
    const catalog = await svc.getCatalog();
    expect(catalog.map((c) => c.tier)).toEqual(["free"]);
  });

  it("degrades to a free-only catalog when the source fails", async () => {
    const source: IStripeCatalogSource = {
      listActivePrices: mock(async () =>
        Result.fail<StripePriceLite[], BillingError>({
          code: "BILLING_PROVIDER_FAILURE",
          message: "stripe down",
        }),
      ),
    };
    const svc = new BillingCatalogService(source, mockInstrumentation());
    const catalog = await svc.getCatalog();
    expect(catalog.length).toBe(1);
    expect(catalog[0]?.tier).toBe("free");
    expect(catalog[0]?.priceId).toBeNull();
  });

  it("asks the source again after a failure instead of caching the degraded catalog", async () => {
    const source: IStripeCatalogSource = {
      listActivePrices: mock(async () =>
        Result.fail<StripePriceLite[], BillingError>({
          code: "BILLING_PROVIDER_FAILURE",
          message: "stripe down",
        }),
      ),
    };
    const svc = new BillingCatalogService(source, mockInstrumentation(), () => 1000);
    await svc.getCatalog();
    await svc.getCatalog();
    expect(source.listActivePrices).toHaveBeenCalledTimes(2);
  });

  it("caches within the TTL (single upstream call for two reads)", async () => {
    const source = makeSource([proPrice]);
    const svc = new BillingCatalogService(source, mockInstrumentation(), () => 1000);
    await svc.getCatalog();
    await svc.getCatalog();
    expect(source.listActivePrices).toHaveBeenCalledTimes(1);
  });
});
