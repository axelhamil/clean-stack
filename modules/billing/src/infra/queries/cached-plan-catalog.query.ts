import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { freePlanOf } from "../../application/mappers/plan-catalog.mapper";
import type {
  IGetPlanCatalogQuery,
  PlanCatalogItem,
} from "../../application/queries/get-plan-catalog.query";
import type { ILivePlanCatalogQuery } from "./plan-catalog.query";

const TTL_MS = 5 * 60 * 1000;

export class CachedPlanCatalogQuery implements IGetPlanCatalogQuery {
  private cache: { at: number; items: PlanCatalogItem[] } | null = null;

  constructor(
    private readonly live: ILivePlanCatalogQuery,
    private readonly instrumentation: IInstrumentation,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async execute(): Promise<Result<PlanCatalogItem[], never>> {
    if (this.cache && this.now() - this.cache.at < TTL_MS) return Result.ok(this.cache.items);

    return this.instrumentation.startSpan(
      { name: "CachedPlanCatalogQuery > execute" },
      async () => {
        const catalog = await this.live.execute();
        if (catalog.isFailure) return Result.ok([freePlanOf()]);

        const items = catalog.getValue();
        this.cache = { at: this.now(), items };

        return Result.ok(items);
      },
    );
  }
}
