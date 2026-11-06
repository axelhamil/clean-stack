import type { EventHandler, IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import { getRateLimitDbClient, TransactionService } from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import type { IEmailService } from "@packages/email/email.port";
import { QueuedEmailService } from "@packages/email/email.service";
import { EmailDeliveryWorker, resendBatchSender } from "@packages/email/email-delivery-worker";
import type { IEmailQueue } from "@packages/email/email-queue.port";
import { ALL_EVENT_TYPES } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { buildEventDispatcher } from "@packages/outbox/event-handlers";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_STOP_SETTLE_MARGIN_MS,
  OutboxDispatcher,
} from "@packages/outbox/outbox-dispatcher";
import { OutboxRelay } from "@packages/outbox/outbox-relay";
import { container } from "inwire";
import { Resend } from "resend";
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
import { authSecretKey } from "./shared/auth/auth-secrets";
import type { OutermostUnitOfWork } from "./shared/auth/unit-of-work-adapter";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import type { IAuditPort } from "./shared/ports/audit.port";
import type { ICaptchaService } from "./shared/ports/captcha.port";
import type { IDisposableEmailService } from "./shared/ports/disposable-email.port";
import type { IIpGeoService } from "./shared/ports/ip-geo.port";
import type { INotificationDigestStore } from "./shared/ports/notification-digest.port";
import type { IPasswordBreachService } from "./shared/ports/password-breach.port";
import type { IRateLimiter, IRateLimitUsage } from "./shared/ports/rate-limiter.port";
import type { ISessionGeoStore } from "./shared/ports/session-geo.port";
import type { ISweepRunStore } from "./shared/ports/sweep-run.port";
import type { ITotpVerifier } from "./shared/ports/totp-verifier.port";
import type { IUserAccountStore } from "./shared/ports/user-account.port";
import { getRequestId } from "./shared/request-context";
import { AdminActionService } from "./shared/services/admin-action.service";
import { AuditEventSubscriber } from "./shared/services/audit-event-subscriber";
import { backupCodeUsedNotifier } from "./shared/services/backup-code-used-notifier";
import { DisposableEmailService } from "./shared/services/disposable-email.service";
import { DrizzleAuditRepository } from "./shared/services/drizzle-audit.service";
import { DrizzleNotificationDigestStore } from "./shared/services/drizzle-notification-digest.store";
import { DrizzleSessionGeoStore } from "./shared/services/drizzle-session-geo.store";
import { DrizzleSweepRunStore } from "./shared/services/drizzle-sweep-run.store";
import { DrizzleTotpVerifier } from "./shared/services/drizzle-totp-verifier";
import { DrizzleUserAccountStore } from "./shared/services/drizzle-user-account.store";
import { HeaderIpGeoService } from "./shared/services/header-ip-geo.service";
import { HibpPasswordBreachService } from "./shared/services/hibp-password-breach.service";
import { LoggingInstrumentation } from "./shared/services/logging-instrumentation";
import { NoopCaptchaService } from "./shared/services/noop-captcha.service";
import { NotificationFanoutSubscriber } from "./shared/services/notification-fanout-subscriber";
import { NotificationStreamHub } from "./shared/services/notification-stream-hub";
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
    INotificationDigestStore: INotificationDigestStore;
    IEmailService: IEmailService;
    ITotpVerifier: ITotpVerifier;
    IOutboxRepository: IOutboxRepository;
    ISweepRunStore: ISweepRunStore;
    IAuditPort: IAuditPort;
    IInstrumentation: IInstrumentation;
    IPasswordBreachService: IPasswordBreachService;
    IDisposableEmailService: IDisposableEmailService;
    IRateLimiter: IRateLimiter & IRateLimitUsage;
    ICaptchaService: ICaptchaService;
    IIpGeoService: IIpGeoService;
    ISessionGeoStore: ISessionGeoStore;
    IUserAccountStore: IUserAccountStore;
    SecuritySignalsService: SecuritySignalsService;
    AdminActionService: AdminActionService;
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
  .add("ISweepRunStore", (c): ISweepRunStore => new DrizzleSweepRunStore(c.IInstrumentation))
  .add(
    "IOutboxRepository",
    (c): IOutboxRepository => new DrizzleOutboxRepository(c.IInstrumentation, getRequestId),
  )
  .add("IAuditPort", (c): IAuditPort => new DrizzleAuditRepository(c.IInstrumentation))
  .add(
    "ITransactionService",
    (c) =>
      new TransactionService(c.IInstrumentation, async (events) => {
        await c.IOutboxRepository.enqueue(events, { source: "app/api" });
      }),
  )
  .add("IEmailQueue", (c): IEmailQueue => new DrizzleEmailQueue(c.IInstrumentation, logger))
  .add(
    "INotificationDigestStore",
    (c): INotificationDigestStore => new DrizzleNotificationDigestStore(c.IInstrumentation),
  )
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
          from: env.RESEND_FROM,
        },
        resendBatchSender(
          env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null,
          c.IInstrumentation,
          logger,
        ),
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
  .add(
    "ITotpVerifier",
    (c): ITotpVerifier => new DrizzleTotpVerifier(c.IInstrumentation, authSecretKey(env)),
  )
  .add("ISessionGeoStore", (c): ISessionGeoStore => new DrizzleSessionGeoStore(c.IInstrumentation))
  .add(
    "IUserAccountStore",
    (c): IUserAccountStore => new DrizzleUserAccountStore(c.IInstrumentation),
  )
  .add(
    "SecuritySignalsService",
    (c) =>
      new SecuritySignalsService(c.ISessionGeoStore, c.IOutboxRepository, logger, {
        denyCountries: env.SECURITY_DENY_COUNTRIES,
        denyAsns: env.SECURITY_DENY_ASNS,
        impossibleTravelWindowMinutes: env.IMPOSSIBLE_TRAVEL_WINDOW_MINUTES,
      }),
  )
  .add(
    "AdminActionService",
    (c) => new AdminActionService(c.IOutboxRepository, c.ITransactionService, c.IInstrumentation),
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
        env,
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
