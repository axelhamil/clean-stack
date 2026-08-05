import type { Option } from "@packages/ddd-kit";

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
  listActivePrices(): Promise<StripePriceLite[]>;
}
