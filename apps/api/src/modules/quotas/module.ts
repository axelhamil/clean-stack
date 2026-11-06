import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { IQuotaUsageStore } from "./application/ports/quota-usage.port";
import { DrizzleQuotaUsageStore } from "./infrastructure/repositories/drizzle-quota-usage.store";

export interface QuotaPrerequisites {
  IInstrumentation: IInstrumentation;
}

export const quotaModule = defineModule<QuotaPrerequisites>()((b) =>
  b.add(
    "IQuotaUsageStore",
    (c): IQuotaUsageStore => new DrizzleQuotaUsageStore(c.IInstrumentation),
  ),
);
