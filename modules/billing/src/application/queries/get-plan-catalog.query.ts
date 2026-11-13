import type { Tier } from "@packages/access-control";
import type { IQuery } from "@packages/ddd-kit";
import type { Feature } from "../services/entitlement-policy.service";

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

export type IGetPlanCatalogQuery = IQuery<void, PlanCatalogItem[], never>;
