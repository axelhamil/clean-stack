import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IPolicyAcceptanceStore } from "./application/ports/policy-acceptance.port";
import { PolicyAcceptanceService } from "./application/services/policy-acceptance.service";
import { DrizzlePolicyAcceptanceStore } from "./infrastructure/repositories/drizzle-policy-acceptance.store";

export interface PolicyPrerequisites {
  IInstrumentation: IInstrumentation;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
}

export const policyModule = defineModule<PolicyPrerequisites>()((b) =>
  b
    .add(
      "IPolicyAcceptanceStore",
      (c): IPolicyAcceptanceStore => new DrizzlePolicyAcceptanceStore(c.IInstrumentation),
    )
    .add(
      "PolicyAcceptanceService",
      (c) =>
        new PolicyAcceptanceService(
          c.IPolicyAcceptanceStore,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
        ),
    ),
);
