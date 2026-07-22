import { defineModule } from "inwire";
import type { IQuotaUsageStore } from "./application/ports/quota-usage.port";
import { DrizzleQuotaUsageStore } from "./infrastructure/repositories/drizzle-quota-usage.store";

declare module "inwire" {
  interface AppDeps {
    IQuotaUsageStore: IQuotaUsageStore;
  }
}

export const quotaModule = defineModule()((b) =>
  b.add("IQuotaUsageStore", (c) => new DrizzleQuotaUsageStore(c.IInstrumentation)),
);
