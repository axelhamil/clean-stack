import { type IQuery, Result } from "@packages/ddd-kit";
import { planCatalogOf } from "../../application/mappers/plan-catalog.mapper";
import type { BillingError } from "../../application/ports/repositories/subscription-read.port";
import type { IStripeCatalogSource } from "../../application/ports/services/stripe-catalog.port";
import type { PlanCatalogItem } from "../../application/queries/get-plan-catalog.query";

export type ILivePlanCatalogQuery = IQuery<void, PlanCatalogItem[], BillingError>;

export class StripePlanCatalogQuery implements ILivePlanCatalogQuery {
  constructor(private readonly source: IStripeCatalogSource) {}

  async execute(): Promise<Result<PlanCatalogItem[], BillingError>> {
    const prices = await this.source.listActivePrices();
    if (prices.isFailure) return Result.fail(prices.getError());

    return Result.ok(planCatalogOf(prices.getValue()));
  }
}
