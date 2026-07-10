export type Tier = "free" | "pro" | "business";
export type Feature = "audit_log" | "api" | "sso";

export type PlanCatalogItem = {
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
};

export type EntitlementsView = {
  rank: number;
  features: Feature[];
  maxMembers: number | null;
  tier: Tier;
  status: string;
};
