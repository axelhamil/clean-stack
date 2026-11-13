import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IPolicyAcceptanceRepository } from "./application/ports/repositories/policy-acceptance.port";
import type { IPolicyStatusQuery } from "./application/queries/policy-status.query";
import { PolicyAcceptanceService } from "./application/services/policy-acceptance.service";
import { AcceptPoliciesUseCase } from "./application/usecases/accept-policies/accept-policies.usecase";
import { DrizzlePolicyStatusQuery } from "./infra/queries/policy-status.query";
import { DrizzlePolicyAcceptanceRepository } from "./infra/repos/drizzle/policy-acceptance.repository";

export interface PolicyPrerequisites {
  IInstrumentation: IInstrumentation;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
}

export const policyModule = defineModule<PolicyPrerequisites>()((b) =>
  b
    .add(
      "IPolicyAcceptanceRepository",
      (c): IPolicyAcceptanceRepository => new DrizzlePolicyAcceptanceRepository(c.IInstrumentation),
    )
    .add(
      "IPolicyStatusQuery",
      (c): IPolicyStatusQuery => new DrizzlePolicyStatusQuery(c.IInstrumentation),
    )
    .add(
      "AcceptPoliciesUseCase",
      (c) =>
        new AcceptPoliciesUseCase(
          c.IPolicyAcceptanceRepository,
          c.IPolicyStatusQuery,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
        ),
    )
    .add(
      "PolicyAcceptanceService",
      (c) => new PolicyAcceptanceService(c.AcceptPoliciesUseCase, c.IPolicyStatusQuery),
    ),
);
