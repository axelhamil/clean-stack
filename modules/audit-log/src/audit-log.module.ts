import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { AuditLogSettings } from "./application/config/audit-log-settings";
import type { IAuditTrail } from "./application/ports/audit-trail.port";
import { AuditQueryService } from "./application/services/audit-query.service";
import { DrizzleAuditRepository } from "./infrastructure/repositories/drizzle-audit.service";
import { AuditEventSubscriber } from "./infrastructure/services/audit-event-subscriber";

export interface AuditLogPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  auditLogSettings: AuditLogSettings;
}

export const auditLogModule = defineModule<AuditLogPrerequisites>()((b) =>
  b
    .add(
      "IAuditTrail",
      (c): IAuditTrail => new DrizzleAuditRepository(c.IInstrumentation, c.ILogger),
    )
    .add("AuditQueryService", (c) => new AuditQueryService(c.IAuditTrail, c.IInstrumentation))
    .add(
      "AuditEventSubscriber",
      (c) =>
        new AuditEventSubscriber(
          c.ITransactionService,
          c.IInstrumentation,
          c.auditLogSettings.tamperEvidence,
        ),
    ),
);
