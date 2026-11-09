import type { Option, Result } from "@packages/ddd-kit";
import type { BillingError } from "./subscription-read.port";

export interface StripePriceLite {
  priceId: string;
  tier: string;
  unitAmount: number;
  currency: string;
  interval: Option<string>;
  productName: string;
  marketingFeatures: string[];
}

export interface IStripeCatalogSource {
  listActivePrices(): Promise<Result<StripePriceLite[], BillingError>>;
}
