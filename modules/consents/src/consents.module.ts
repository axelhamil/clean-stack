import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { IConsentRepository } from "./application/ports/repositories/consent.port";
import type { IGetActiveConsentQuery } from "./application/queries/get-active-consent.query";
import { ConsentService } from "./application/services/consent.service";
import { ConsentLedger } from "./application/services/consent-ledger.service";
import { ReconcileConsentUseCase } from "./application/usecases/reconcile-consent/reconcile-consent.usecase";
import { RecordConsentUseCase } from "./application/usecases/record-consent/record-consent.usecase";
import { WithdrawConsentUseCase } from "./application/usecases/withdraw-consent/withdraw-consent.usecase";
import { LedgerActiveConsentQuery } from "./infra/queries/get-active-consent.query";
import { DrizzleConsentRepository } from "./infra/repos/drizzle/consent.repository";

export interface ConsentPrerequisites {
  IInstrumentation: IInstrumentation;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
}

export const consentModule = defineModule<ConsentPrerequisites>()((b) =>
  b
    .add(
      "IConsentRepository",
      (c): IConsentRepository => new DrizzleConsentRepository(c.IInstrumentation),
    )
    .add(
      "ConsentLedger",
      (c) =>
        new ConsentLedger(
          c.IConsentRepository,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
        ),
    )
    .add("RecordConsentUseCase", (c) => new RecordConsentUseCase(c.ConsentLedger))
    .add("WithdrawConsentUseCase", (c) => new WithdrawConsentUseCase(c.ConsentLedger))
    .add(
      "ReconcileConsentUseCase",
      (c) =>
        new ReconcileConsentUseCase(
          c.IConsentRepository,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
        ),
    )
    .add(
      "IGetActiveConsentQuery",
      (c): IGetActiveConsentQuery => new LedgerActiveConsentQuery(c.IConsentRepository),
    )
    .add("ConsentService", (c) => new ConsentService(c.ReconcileConsentUseCase)),
);
