import { defineModule } from "inwire";
import type { IConsentStore } from "./application/ports/consent.port";
import { ConsentService } from "./application/services/consent.service";
import { DrizzleConsentStore } from "./infrastructure/repositories/drizzle-consent.store";

declare module "inwire" {
  interface AppDeps {
    IConsentStore: IConsentStore;
    ConsentService: ConsentService;
  }
}

export const consentModule = defineModule()((b) =>
  b
    .add("IConsentStore", (c) => new DrizzleConsentStore(c.IInstrumentation))
    .add(
      "ConsentService",
      (c) =>
        new ConsentService(
          c.IConsentStore,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
        ),
    ),
);
