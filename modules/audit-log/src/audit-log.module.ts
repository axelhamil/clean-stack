import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { AuditLogSettings } from "./application/config/audit-log-settings";
import type { IAuditLogRepository } from "./application/ports/repositories/audit-log.port";
import type { IAuditHasher } from "./application/ports/services/audit-hasher.port";
import type { IListAuditEventsQuery } from "./application/queries/list-audit-events.query";
import type { IVerifyAuditChainQuery } from "./application/queries/verify-audit-chain.query";
import { AuditQueryService } from "./application/services/audit-query.service";
import { ListAuditEventsUseCase } from "./application/usecases/list-audit-events/list-audit-events.usecase";
import { RecordAuditEntryUseCase } from "./application/usecases/record-audit-entry/record-audit-entry.usecase";
import { AuditEventSubscriber } from "./infra/adapters/audit-event-subscriber.adapter";
import { sha256AuditHasher } from "./infra/adapters/sha256-audit-hasher.adapter";
import { DrizzleListAuditEventsQuery } from "./infra/queries/list-audit-events.query";
import { DrizzleVerifyAuditChainQuery } from "./infra/queries/verify-audit-chain.query";
import { DrizzleAuditLogRepository } from "./infra/repos/drizzle/audit-log.repository";

export interface AuditLogPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  auditLogSettings: AuditLogSettings;
}

export const auditLogModule = defineModule<AuditLogPrerequisites>()((b) =>
  b
    .add(
      "IAuditLogRepository",
      (c): IAuditLogRepository => new DrizzleAuditLogRepository(c.IInstrumentation, c.ILogger),
    )
    .add("IAuditHasher", (): IAuditHasher => sha256AuditHasher)
    .add(
      "IListAuditEventsQuery",
      (c): IListAuditEventsQuery => new DrizzleListAuditEventsQuery(c.IInstrumentation, c.ILogger),
    )
    .add(
      "IVerifyAuditChainQuery",
      (c): IVerifyAuditChainQuery =>
        new DrizzleVerifyAuditChainQuery(c.IAuditHasher, c.IInstrumentation, c.ILogger),
    )
    .add(
      "RecordAuditEntryUseCase",
      (c) =>
        new RecordAuditEntryUseCase(
          c.IAuditLogRepository,
          c.IAuditHasher,
          c.ITransactionService,
          c.auditLogSettings,
        ),
    )
    .add(
      "ListAuditEventsUseCase",
      (c) => new ListAuditEventsUseCase(c.IListAuditEventsQuery, c.IOutboxRepository),
    )
    .add(
      "AuditQueryService",
      (c) => new AuditQueryService(c.IListAuditEventsQuery, c.IVerifyAuditChainQuery),
    )
    .add(
      "AuditEventSubscriber",
      (c) => new AuditEventSubscriber(c.RecordAuditEntryUseCase, c.IInstrumentation),
    ),
);
