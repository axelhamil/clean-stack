import type { IGetPlanCatalogQuery, PlanCatalogItem } from "../queries/get-plan-catalog.query";

export class BillingCatalogService {
  constructor(private readonly catalog: IGetPlanCatalogQuery) {}

  async getCatalog(): Promise<PlanCatalogItem[]> {
    const catalog = await this.catalog.execute();

    return catalog.getValue();
  }
}
