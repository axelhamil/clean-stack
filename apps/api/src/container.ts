import type { IUnitOfWork } from "@packages/ddd-kit";
import { TransactionService } from "@packages/drizzle";
import { container } from "inwire";
import { auditLogModule } from "./modules/audit-log/module";
import { healthModule } from "./modules/health/module";
import { rgpdModule } from "./modules/rgpd/module";
import { uploadsModule } from "./modules/uploads/module";
import { webhooksModule } from "./modules/webhooks/module";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import type { IAuditPort } from "./shared/ports/audit.port";
import type { IEmailService } from "./shared/ports/email.port";
import type { IOutboxRepository } from "./shared/ports/outbox.port";
import { AuditEventSubscriber } from "./shared/services/audit-event-subscriber";
import { DrizzleAuditRepository } from "./shared/services/drizzle-audit.service";
import { DrizzleOutboxRepository } from "./shared/services/drizzle-outbox.service";
import { ResendEmailService } from "./shared/services/email.service";
import { OutboxDispatcher } from "./shared/services/outbox-dispatcher.service";
import { WebhookFanoutSubscriber } from "./shared/services/webhook-fanout-subscriber";
import type { ITransaction } from "./shared/transaction";

declare module "inwire" {
  interface AppDeps {
    ITransactionService: IUnitOfWork<ITransaction>;
    IEmailService: IEmailService;
    IOutboxRepository: IOutboxRepository;
    IAuditPort: IAuditPort;
    AuditEventSubscriber: AuditEventSubscriber;
    WebhookFanoutSubscriber: WebhookFanoutSubscriber;
    OutboxDispatcher: OutboxDispatcher;
  }
}

export const di = container()
  .add("IOutboxRepository", (): IOutboxRepository => new DrizzleOutboxRepository())
  .add("IAuditPort", (): IAuditPort => new DrizzleAuditRepository())
  .add(
    "ITransactionService",
    (c) =>
      new TransactionService(async (events, tx) => {
        await c.IOutboxRepository.enqueue(events, { source: "app/api" }, tx);
      }),
  )
  .add("IEmailService", (): IEmailService => new ResendEmailService())
  .add("AuditEventSubscriber", () => new AuditEventSubscriber())
  .add("WebhookFanoutSubscriber", () => new WebhookFanoutSubscriber())
  .add(
    "OutboxDispatcher",
    (c) =>
      new OutboxDispatcher({
        outbox: c.IOutboxRepository,
        builtInSubscribers: [c.AuditEventSubscriber, c.WebhookFanoutSubscriber],
        logger,
        connectionString: env.DATABASE_URL,
      }),
  )
  .addModule(healthModule)
  .addModule(uploadsModule)
  .addModule(rgpdModule)
  .addModule(auditLogModule)
  .addModule(webhooksModule)
  .build();
