import type { EventHandler, IUnitOfWork } from "@packages/ddd-kit";
import { getRateLimitDbClient, TransactionService } from "@packages/drizzle";
import { ALL_EVENT_TYPES } from "@packages/events";
import { container } from "inwire";
import { adminModule } from "./modules/admin/module";
import { apiTokenModule } from "./modules/api-token/module";
import { auditLogModule } from "./modules/audit-log/module";
import { billingModule } from "./modules/billing/module";
import { consentModule } from "./modules/consents/module";
import { healthModule } from "./modules/health/module";
import { notificationsModule } from "./modules/notifications/module";
import { policyModule } from "./modules/policies/module";
import { profileModule } from "./modules/profile/module";
import { quotaModule } from "./modules/quotas/module";
import { rgpdModule } from "./modules/rgpd/module";
import { uploadsModule } from "./modules/uploads/module";
import { webhooksModule } from "./modules/webhooks/module";
import type { OutermostUnitOfWork } from "./shared/auth/unit-of-work-adapter";
import { env } from "./shared/env";
import { buildEventDispatcher } from "./shared/event-handlers";
import { logger } from "./shared/logger";
import type { IAuditPort } from "./shared/ports/audit.port";
import type { ICaptchaService } from "./shared/ports/captcha.port";
import type { IDisposableEmailService } from "./shared/ports/disposable-email.port";
import type { IEmailService } from "./shared/ports/email.port";
import type { IEmailQueue } from "./shared/ports/email-queue.port";
import type { IInstrumentation } from "./shared/ports/instrumentation.port";
import type { IIpGeoService } from "./shared/ports/ip-geo.port";
import type { IOutboxRepository } from "./shared/ports/outbox.port";
import type { IPasswordBreachService } from "./shared/ports/password-breach.port";
import type { IRateLimiter, IRateLimitUsage } from "./shared/ports/rate-limiter.port";
import type { ISessionGeoStore } from "./shared/ports/session-geo.port";
import type { ITotpVerifier } from "./shared/ports/totp-verifier.port";
import { AuditEventSubscriber } from "./shared/services/audit-event-subscriber";
import { backupCodeUsedNotifier } from "./shared/services/backup-code-used-notifier";
import { DisposableEmailService } from "./shared/services/disposable-email.service";
import { DrizzleAuditRepository } from "./shared/services/drizzle-audit.service";
import { DrizzleEmailQueue } from "./shared/services/drizzle-email-queue.service";
import { DrizzleOutboxRepository } from "./shared/services/drizzle-outbox.service";
import { DrizzleSessionGeoStore } from "./shared/services/drizzle-session-geo.store";
import { DrizzleTotpVerifier } from "./shared/services/drizzle-totp-verifier";
import { QueuedEmailService } from "./shared/services/email.service";
import { EmailDeliveryWorker } from "./shared/services/email-delivery-worker.service";
import { HeaderIpGeoService } from "./shared/services/header-ip-geo.service";
import { HibpPasswordBreachService } from "./shared/services/hibp-password-breach.service";
import { LoggingInstrumentation } from "./shared/services/logging-instrumentation";
import { NoopCaptchaService } from "./shared/services/noop-captcha.service";
import { NotificationFanoutSubscriber } from "./shared/services/notification-fanout-subscriber";
import { NotificationStreamHub } from "./shared/services/notification-stream-hub";
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_STOP_SETTLE_MARGIN_MS,
  OutboxDispatcher,
} from "./shared/services/outbox-dispatcher.service";
import { OutboxRelay } from "./shared/services/outbox-relay";
import {
  RateLimiterFlexibleAdapter,
  storeFactoryFor,
} from "./shared/services/rate-limiter-flexible.adapter";
import { SecuritySignalsService } from "./shared/services/security-signals.service";
import { SentryInstrumentation } from "./shared/services/sentry-instrumentation";
import { SiteverifyCaptchaService } from "./shared/services/siteverify-captcha.service";
import { WebhookFanoutSubscriber } from "./shared/services/webhook-fanout-subscriber";

declare module "inwire" {
  interface AppDeps {
    ITransactionService: IUnitOfWork & OutermostUnitOfWork;
    IEmailQueue: IEmailQueue;
    IEmailService: IEmailService;
    ITotpVerifier: ITotpVerifier;
    IOutboxRepository: IOutboxRepository;
    IAuditPort: IAuditPort;
    IInstrumentation: IInstrumentation;
    IPasswordBreachService: IPasswordBreachService;
    IDisposableEmailService: IDisposableEmailService;
    IRateLimiter: IRateLimiter & IRateLimitUsage;
    ICaptchaService: ICaptchaService;
    IIpGeoService: IIpGeoService;
    ISessionGeoStore: ISessionGeoStore;
    SecuritySignalsService: SecuritySignalsService;
    AuditEventSubscriber: AuditEventSubscriber;
    WebhookFanoutSubscriber: WebhookFanoutSubscriber;
    NotificationFanoutSubscriber: NotificationFanoutSubscriber;
    OutboxDispatcher: OutboxDispatcher;
    BackupCodeUsedNotifier: EventHandler;
    EmailDeliveryWorker: EmailDeliveryWorker;
    NotificationStreamHub: NotificationStreamHub;
  }
}

export const di = container()
  .add(
    "IInstrumentation",
    (): IInstrumentation =>
      env.SENTRY_DSN ? new SentryInstrumentation() : new LoggingInstrumentation(logger),
  )
  .add(
    "IOutboxRepository",
    (c): IOutboxRepository => new DrizzleOutboxRepository(c.IInstrumentation),
  )
  .add("IAuditPort", (c): IAuditPort => new DrizzleAuditRepository(c.IInstrumentation))
  .add(
    "ITransactionService",
    (c) =>
      new TransactionService(c.IInstrumentation, async (events) => {
        await c.IOutboxRepository.enqueue(events, { source: "app/api" });
      }),
  )
  .add("IEmailQueue", (c): IEmailQueue => new DrizzleEmailQueue(c.IInstrumentation))
  .add(
    "IEmailService",
    (c): IEmailService => new QueuedEmailService(c.IEmailQueue, c.IInstrumentation),
  )
  .add(
    "EmailDeliveryWorker",
    (c) =>
      new EmailDeliveryWorker(
        c.IEmailQueue,
        c.IOutboxRepository,
        c.ITransactionService,
        logger,
        c.IInstrumentation,
        {
          leaseSeconds: env.EMAIL_LEASE_SECONDS,
          deadRetrySeconds: env.EMAIL_DEAD_RETRY_HOURS * 3600,
          deadReplayWindowHours: env.EMAIL_DEAD_REPLAY_WINDOW_HOURS,
        },
      ),
  )
  .add(
    "IPasswordBreachService",
    (c): IPasswordBreachService => new HibpPasswordBreachService(c.IInstrumentation),
  )
  .add(
    "IDisposableEmailService",
    (c): IDisposableEmailService => new DisposableEmailService(c.IInstrumentation),
  )
  .add(
    "IRateLimiter",
    (c): IRateLimiter & IRateLimitUsage =>
      new RateLimiterFlexibleAdapter(
        c.IInstrumentation,
        storeFactoryFor(env.RATE_LIMIT_STORE, getRateLimitDbClient),
      ),
  )
  .add(
    "ICaptchaService",
    (c): ICaptchaService =>
      env.CAPTCHA_SECRET_KEY
        ? new SiteverifyCaptchaService(c.IInstrumentation, {
            secretKey: env.CAPTCHA_SECRET_KEY,
            verifyUrl: env.CAPTCHA_VERIFY_URL,
            timeoutMs: env.CAPTCHA_TIMEOUT_MS,
          })
        : new NoopCaptchaService(),
  )
  .add(
    "IIpGeoService",
    (): IIpGeoService =>
      new HeaderIpGeoService({
        countryHeader: env.GEO_COUNTRY_HEADER,
        asnHeader: env.GEO_ASN_HEADER,
      }),
  )
  .add("ITotpVerifier", (c): ITotpVerifier => new DrizzleTotpVerifier(c.IInstrumentation))
  .add("ISessionGeoStore", (c): ISessionGeoStore => new DrizzleSessionGeoStore(c.IInstrumentation))
  .add(
    "SecuritySignalsService",
    (c) =>
      new SecuritySignalsService(c.ISessionGeoStore, c.IOutboxRepository, {
        denyCountries: env.SECURITY_DENY_COUNTRIES,
        denyAsns: env.SECURITY_DENY_ASNS,
        impossibleTravelWindowMinutes: env.IMPOSSIBLE_TRAVEL_WINDOW_MINUTES,
      }),
  )
  .add(
    "AuditEventSubscriber",
    (c) =>
      new AuditEventSubscriber(
        c.ITransactionService,
        c.IInstrumentation,
        env.AUDIT_TAMPER_EVIDENCE,
      ),
  )
  .add(
    "WebhookFanoutSubscriber",
    (c) => new WebhookFanoutSubscriber(c.ITransactionService, c.IInstrumentation),
  )
  .add(
    "NotificationFanoutSubscriber",
    (c) =>
      new NotificationFanoutSubscriber(
        c.ITransactionService,
        c.IInstrumentation,
        env.NOTIFICATION_DIGEST_HOUR_UTC,
      ),
  )
  .add(
    "OutboxDispatcher",
    (c) =>
      new OutboxDispatcher(
        c.IOutboxRepository,
        (diLike) =>
          new OutboxRelay(
            c.IOutboxRepository,
            c.ITransactionService,
            buildEventDispatcher(
              [c.AuditEventSubscriber, c.WebhookFanoutSubscriber, c.NotificationFanoutSubscriber],
              diLike,
            ),
            {
              eventTypes: ALL_EVENT_TYPES,
              batchSize: OUTBOX_BATCH_SIZE,
              maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
              leaseSeconds: env.OUTBOX_LEASE_SECONDS,
              deadRetrySeconds: env.OUTBOX_DEAD_RETRY_HOURS * 3600,
              concurrency: env.OUTBOX_CONCURRENCY,
              handlerBudgetSeconds: env.OUTBOX_HANDLER_BUDGET_SECONDS,
            },
            c.IInstrumentation,
            logger,
          ),
        logger,
        env.DATABASE_URL,
        c.IInstrumentation,
        {
          stopGraceMs: Math.max(0, env.SHUTDOWN_WORKERS_TIMEOUT_MS - OUTBOX_STOP_SETTLE_MARGIN_MS),
        },
      ),
  )
  .addModule(adminModule)
  .addModule(apiTokenModule)
  .addModule(healthModule)
  .addModule(uploadsModule)
  .addModule(rgpdModule)
  .addModule(auditLogModule)
  .addModule(webhooksModule)
  .addModule(policyModule)
  .addModule(consentModule)
  .addModule(quotaModule)
  .addModule(billingModule)
  .addModule(notificationsModule)
  .addModule(profileModule)
  .add("BackupCodeUsedNotifier", (c) =>
    backupCodeUsedNotifier({ IEmailService: c.IEmailService, IProfileStore: c.IProfileStore }),
  )
  .add(
    "NotificationStreamHub",
    (c) => new NotificationStreamHub(logger, env.DATABASE_URL, c.IInstrumentation),
  )
  .build();
