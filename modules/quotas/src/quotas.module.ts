import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { IQuotaUsageStore } from "./application/ports/repositories/quota-usage.port";
import type { IQuotaCounter } from "./application/ports/services/quota-counter.port";
import type { IQuotaLock } from "./application/ports/services/quota-lock.port";
import { ReserveQuotaUseCase } from "./application/usecases/reserve-quota/reserve-quota.usecase";
import { AdvisoryQuotaLock } from "./infra/adapters/advisory-quota-lock.adapter";
import { type QuotaTables, ScopedRowCounter } from "./infra/adapters/scoped-row-counter.adapter";
import { DrizzleQuotaUsageRepository } from "./infra/repos/drizzle/quota-usage.repository";

export interface QuotaPrerequisites {
  IInstrumentation: IInstrumentation;
  quotaTables: QuotaTables;
}

export const quotaModule = defineModule<QuotaPrerequisites>()((b) =>
  b
    .add(
      "IQuotaUsageStore",
      (c): IQuotaUsageStore => new DrizzleQuotaUsageRepository(c.IInstrumentation),
    )
    .add("IQuotaLock", (c): IQuotaLock => new AdvisoryQuotaLock(c.IInstrumentation))
    .add(
      "IQuotaCounter",
      (c): IQuotaCounter => new ScopedRowCounter(c.quotaTables, c.IInstrumentation),
    )
    .add("ReserveQuotaUseCase", (c) => new ReserveQuotaUseCase(c.IQuotaLock, c.IQuotaCounter)),
);
