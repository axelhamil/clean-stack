import type { IUnitOfWork } from "@packages/ddd-kit";
import { TransactionService } from "@packages/drizzle";
import { container } from "inwire";
import { auditLogModule } from "./modules/audit-log/module";
import { healthModule } from "./modules/health/module";
import { policyModule } from "./modules/policies/module";
import { rgpdModule } from "./modules/rgpd/module";
import { uploadsModule } from "./modules/uploads/module";
import { webhooksModule } from "./modules/webhooks/module";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import type { IAuditPort } from "./shared/ports/audit.port";
import type { IEmailService } from "./shared/ports/email.port";
import type { IInstrumentation } from "./shared/ports/instrumentation.port";
import type { IOutboxRepository } from "./shared/ports/outbox.port";
import type { IPasswordBreachService } from "./shared/ports/password-breach.port";
import type { IRateLimiter } from "./shared/ports/rate-limiter.port";
import { AuditEventSubscriber } from "./shared/services/audit-event-subscriber";
import { DrizzleAuditRepository } from "./shared/services/drizzle-audit.service";
import { DrizzleOutboxRepository } from "./shared/services/drizzle-outbox.service";
import { ResendEmailService } from "./shared/services/email.service";
import { HibpPasswordBreachService } from "./shared/services/hibp-password-breach.service";
import { NoOpInstrumentation } from "./shared/services/noop-instrumentation";
import { OutboxDispatcher } from "./shared/services/outbox-dispatcher.service";
import { RateLimiterMemoryAdapter } from "./shared/services/rate-limiter-memory.adapter";
import { SentryInstrumentation } from "./shared/services/sentry-instrumentation";
import { WebhookFanoutSubscriber } from "./shared/services/webhook-fanout-subscriber";
import type { ITransaction } from "./shared/transaction";

declare module "inwire" {
  interface AppDeps {
    ITransactionService: IUnitOfWork<ITransaction>;
    IEmailService: IEmailService;
    IOutboxRepository: IOutboxRepository;
    IAuditPort: IAuditPort;
    IInstrumentation: IInstrumentation;
    IPasswordBreachService: IPasswordBreachService;
    IRateLimiter: IRateLimiter;
    AuditEventSubscriber: AuditEventSubscriber;
    WebhookFanoutSubscriber: WebhookFanoutSubscriber;
    OutboxDispatcher: OutboxDispatcher;
  }
}

export const di = container()
  .add(
    "IInstrumentation",
    (): IInstrumentation =>
      env.SENTRY_DSN ? new SentryInstrumentation() : new NoOpInstrumentation(),
  )
  .add(
    "IOutboxRepository",
    (c): IOutboxRepository => new DrizzleOutboxRepository(c.IInstrumentation),
  )
  .add("IAuditPort", (c): IAuditPort => new DrizzleAuditRepository(c.IInstrumentation))
  .add(
    "ITransactionService",
    (c) =>
      new TransactionService(async (events, tx) => {
        await c.IOutboxRepository.enqueue(events, { source: "app/api" }, tx);
      }),
  )
  .add("IEmailService", (c): IEmailService => new ResendEmailService(c.IInstrumentation))
  .add(
    "IPasswordBreachService",
    (c): IPasswordBreachService => new HibpPasswordBreachService(c.IInstrumentation),
  )
  .add("IRateLimiter", (c): IRateLimiter => new RateLimiterMemoryAdapter(c.IInstrumentation))
  .add("AuditEventSubscriber", (c) => new AuditEventSubscriber(c.IInstrumentation))
  .add("WebhookFanoutSubscriber", (c) => new WebhookFanoutSubscriber(c.IInstrumentation))
  .add(
    "OutboxDispatcher",
    (c) =>
      new OutboxDispatcher(
        c.IOutboxRepository,
        [c.AuditEventSubscriber, c.WebhookFanoutSubscriber],
        logger,
        env.DATABASE_URL,
        c.IInstrumentation,
      ),
  )
  .addModule(healthModule)
  .addModule(uploadsModule)
  .addModule(rgpdModule)
  .addModule(auditLogModule)
  .addModule(webhooksModule)
  .addModule(policyModule)
  .build();
