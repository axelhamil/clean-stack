import { defineModule } from "inwire";
import type { IPolicyAcceptanceStore } from "./application/ports/policy-acceptance.port";
import { PolicyAcceptanceService } from "./application/services/policy-acceptance.service";
import { DrizzlePolicyAcceptanceStore } from "./infrastructure/repositories/drizzle-policy-acceptance.store";

declare module "inwire" {
  interface AppDeps {
    IPolicyAcceptanceStore: IPolicyAcceptanceStore;
    PolicyAcceptanceService: PolicyAcceptanceService;
  }
}

export const policyModule = defineModule()((b) =>
  b
    .add("IPolicyAcceptanceStore", (c) => new DrizzlePolicyAcceptanceStore(c.IInstrumentation))
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
