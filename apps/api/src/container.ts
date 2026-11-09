import { apiTokenModule } from "@modules/api-token/api-token.module";
import { auditLogModule } from "@modules/audit-log/audit-log.module";
import { billingModule } from "@modules/billing/billing.module";
import { consentModule } from "@modules/consents/consents.module";
import { notificationsModule } from "@modules/notifications/notifications.module";
import { policyModule } from "@modules/policies/policies.module";
import { profileModule } from "@modules/profile/profile.module";
import { quotaModule } from "@modules/quotas/quotas.module";
import { uploadsModule } from "@modules/uploads/uploads.module";
import type { EventHandler, IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import { getRateLimitDbClient, TransactionService } from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import type { IEmailService } from "@packages/email/email.port";
import { QueuedEmailService } from "@packages/email/email.service";
import { EmailDeliveryWorker, resendBatchSender } from "@packages/email/email-delivery-worker";
import type { IEmailQueue } from "@packages/email/email-queue.port";
import { ALL_EVENT_TYPES } from "@packages/events";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
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
import { apiSettings } from "./composition/settings";
import { rgpdSources } from "./composition/sources/rgpd";
import { adminModule } from "./modules/admin/module";
import { healthModule } from "./modules/health/module";
import { rgpdModule } from "./modules/rgpd/module";
import { webhooksModule } from "./modules/webhooks/module";
import { authSecretKey } from "./shared/auth/auth-secrets";
import type { OutermostUnitOfWork } from "./shared/auth/unit-of-work-adapter";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import type { ICaptchaService } from "./shared/ports/captcha.port";
import type { IDisposableEmailService } from "./shared/ports/disposable-email.port";
import type { IIpGeoService } from "./shared/ports/ip-geo.port";
import type { IPasswordBreachService } from "./shared/ports/password-breach.port";
import type { IRateLimiter, IRateLimitUsage } from "./shared/ports/rate-limiter.port";
import type { ISessionGeoStore } from "./shared/ports/session-geo.port";
import type { ITotpVerifier } from "./shared/ports/totp-verifier.port";
import type { IUserAccountStore } from "./shared/ports/user-account.port";
import { getRequestId } from "./shared/request-context";
import { AdminActionService } from "./shared/services/admin-action.service";
import { backupCodeUsedNotifier } from "./shared/services/backup-code-used-notifier";
import { DisposableEmailService } from "./shared/services/disposable-email.service";
import { DrizzleSessionGeoStore } from "./shared/services/drizzle-session-geo.store";
import { DrizzleSweepRunStore } from "./shared/services/drizzle-sweep-run.store";
import { DrizzleTotpVerifier } from "./shared/services/drizzle-totp-verifier";
import { DrizzleUserAccountStore } from "./shared/services/drizzle-user-account.store";
import { HeaderIpGeoService } from "./shared/services/header-ip-geo.service";
import { HibpPasswordBreachService } from "./shared/services/hibp-password-breach.service";
import { LoggingInstrumentation } from "./shared/services/logging-instrumentation";
import { NoopCaptchaService } from "./shared/services/noop-captcha.service";
import {
  RateLimiterFlexibleAdapter,
  storeFactoryFor,
} from "./shared/services/rate-limiter-flexible.adapter";
import { SecuritySignalsService } from "./shared/services/security-signals.service";
import { SentryInstrumentation } from "./shared/services/sentry-instrumentation";
import { SiteverifyCaptchaService } from "./shared/services/siteverify-captcha.service";

declare module "inwire" {
  interface AppDeps {
    ITransactionService: IUnitOfWork & OutermostUnitOfWork;
    IEmailQueue: IEmailQueue;
    IEmailService: IEmailService;
    ITotpVerifier: ITotpVerifier;
    IOutboxRepository: IOutboxRepository;
    ISweepRunStore: ISweepRunStore;
    IInstrumentation: IInstrumentation;
    ILogger: ILogger;
    IPasswordBreachService: IPasswordBreachService;
    IDisposableEmailService: IDisposableEmailService;
    IRateLimiter: IRateLimiter & IRateLimitUsage;
    ICaptchaService: ICaptchaService;
    IIpGeoService: IIpGeoService;
    ISessionGeoStore: ISessionGeoStore;
    IUserAccountStore: IUserAccountStore;
    SecuritySignalsService: SecuritySignalsService;
    AdminActionService: AdminActionService;
    OutboxDispatcher: OutboxDispatcher;
    BackupCodeUsedNotifier: EventHandler;
    EmailDeliveryWorker: EmailDeliveryWorker;
  }
}

export const di = container()
  .addModule(apiSettings(env))
  .add(
    "IInstrumentation",
    (): IInstrumentation =>
      env.SENTRY_DSN ? new SentryInstrumentation() : new LoggingInstrumentation(logger),
  )
  .add("ILogger", (): ILogger => logger)
  .add("ISweepRunStore", (c): ISweepRunStore => new DrizzleSweepRunStore(c.IInstrumentation))
  .add(
    "IOutboxRepository",
    (c): IOutboxRepository => new DrizzleOutboxRepository(c.IInstrumentation, getRequestId),
  )
  .add(
    "ITransactionService",
    (c) =>
      new TransactionService(c.IInstrumentation, async (events) => {
        await c.IOutboxRepository.enqueue(events, { source: "app/api" });
      }),
  )
  .add("IEmailQueue", (c): IEmailQueue => new DrizzleEmailQueue(c.IInstrumentation, logger))
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
  .addModule(apiTokenModule)
  .addModule(healthModule)
  .addModule(uploadsModule)
  .addModule(auditLogModule)
  .addModule(webhooksModule)
  .addModule(policyModule)
  .addModule(consentModule)
  .addModule(quotaModule)
  .addModule(billingModule)
  .addModule(notificationsModule)
  .addModule(profileModule)
  .addModule(adminModule)
  .addModule(rgpdSources)
  .addModule(rgpdModule)
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
  .add("BackupCodeUsedNotifier", (c) =>
    backupCodeUsedNotifier({ IEmailService: c.IEmailService, IProfileStore: c.IProfileStore }),
  )
  .build();
