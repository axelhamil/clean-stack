import { Result } from "@packages/ddd-kit";
import type { IGetPlanCatalogQuery } from "../../application/queries/get-plan-catalog.query";
import type { IListConfiguredPriceIdsQuery } from "../../application/queries/list-configured-price-ids.query";

export class CatalogConfiguredPriceIdsQuery implements IListConfiguredPriceIdsQuery {
  constructor(private readonly catalog: IGetPlanCatalogQuery) {}

  async execute(): Promise<Result<string[], never>> {
    const catalog = (await this.catalog.execute()).getValue();

    return Result.ok(catalog.flatMap(({ priceId }) => (priceId === null ? [] : [priceId])));
  }
}
