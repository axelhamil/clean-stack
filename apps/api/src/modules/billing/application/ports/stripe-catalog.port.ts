export interface StripePriceLite {
  priceId: string;
  tier: string;
  unitAmount: number;
  currency: string;
  interval: string | null;
  productName: string;
  marketingFeatures: string[];
}

export interface IStripeCatalogSource {
  listActivePrices(): Promise<StripePriceLite[]>;
}
