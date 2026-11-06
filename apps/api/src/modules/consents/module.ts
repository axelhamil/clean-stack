import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IConsentStore } from "./application/ports/consent.port";
import { ConsentService } from "./application/services/consent.service";
import { DrizzleConsentStore } from "./infrastructure/repositories/drizzle-consent.store";

export interface ConsentPrerequisites {
  IInstrumentation: IInstrumentation;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
}

export const consentModule = defineModule<ConsentPrerequisites>()((b) =>
  b
    .add("IConsentStore", (c): IConsentStore => new DrizzleConsentStore(c.IInstrumentation))
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
