import "./shared/services/sentry-init";

import { EventCollector } from "@packages/ddd-kit";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { findUserById } from "./auth-queries";
import { di } from "./container";
import { adminImpersonationRoutes } from "./modules/admin/admin-impersonation.routes";
import { adminOrgRoutes } from "./modules/admin/admin-orgs.routes";
import { adminUserRoutes } from "./modules/admin/routes";
import { apiTokenRoutes } from "./modules/api-token/routes";
import { createApiTokenScanningRoutes } from "./modules/api-token/scanning.routes";
import { auditLogRoutes } from "./modules/audit-log/routes";
import { billingRoutes } from "./modules/billing/routes";
import { consentRoutes } from "./modules/consents/routes";
import { healthInternalRoutes } from "./modules/health/internal.routes";
import { healthRoutes } from "./modules/health/routes";
import { notificationsRoutes } from "./modules/notifications/routes";
import { organizationSettingsRoutes } from "./modules/organization/routes";
import { policyRoutes } from "./modules/policies/routes";
import { rgpdInternalRoutes } from "./modules/rgpd/internal.routes";
import { rgpdMeRoutes } from "./modules/rgpd/routes";
import { uploadsRoutes } from "./modules/uploads/routes";
import { webhooksRoutes } from "./modules/webhooks/routes";
import { createPublicApiV1 } from "./public-api";
import { env } from "./shared/env";
import { cspReportCors, makeCspReportApp } from "./shared/internal-routes/csp-report.route";
import { flushNotificationEmailsRoutes } from "./shared/internal-routes/flush-notification-emails.route";
import { sweepAuditLogRoutes } from "./shared/internal-routes/sweep-audit-log.route";
import { sweepConsentsRoutes } from "./shared/internal-routes/sweep-consents.route";
import { sweepEmailMessagesRoutes } from "./shared/internal-routes/sweep-email-messages.route";
import { sweepNotificationsRoutes } from "./shared/internal-routes/sweep-notifications.route";
import { sweepOutboxRoutes } from "./shared/internal-routes/sweep-outbox.route";
import { sweepWebhookDeliveryRoutes } from "./shared/internal-routes/sweep-webhook-delivery.route";
import { logger } from "./shared/logger";
import { type AuthVariables, sessionMiddleware } from "./shared/middleware/auth.middleware";
import { requireCsrf } from "./shared/middleware/csrf.middleware";
import { createErrorHandler } from "./shared/middleware/error.middleware";
import { httpLogger } from "./shared/middleware/logger.middleware";
import { resolveClientIp } from "./shared/middleware/rate-limit.ip";
import { requireRateLimit } from "./shared/middleware/rate-limit.middleware";
import {
  AUTH_FORGOT_PASSWORD_POLICY,
  AUTH_MAGIC_LINK_POLICY,
  AUTH_PASSKEY_POLICY,
  AUTH_RESET_PASSWORD_POLICY,
  AUTH_SEND_VERIFICATION_POLICY,
  AUTH_SIGN_IN_POLICY,
  AUTH_SIGN_UP_POLICY,
  AUTH_TWO_FACTOR_POLICY,
  AUTH_VERIFY_EMAIL_POLICY,
  CONSENT_POST_POLICY,
  CSP_REPORT_POLICY,
  GITHUB_SCANNING_POLICY,
  GLOBAL_POLICY,
  SCIM_POLICY,
} from "./shared/middleware/rate-limit.policies";
import { runWithRequestContext } from "./shared/request-context";
import { lifecycleState } from "./shared/shutdown";

type AppEnv = {
  Variables: AuthVariables & {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

app.route("/", healthRoutes);

// Mounted before the global middlewares: the endpoint is public, cross-origin (browser-posted),
// and must not inherit the same-origin CORP that secureHeaders sets — that would block the report POST.
app.use("/csp-report", cspReportCors);
app.use(
  "/csp-report",
  requireRateLimit({ limiter: di.IRateLimiter, outbox: di.IOutboxRepository }, CSP_REPORT_POLICY),
);
app.route("/", makeCspReportApp({ outbox: di.IOutboxRepository, appUrl: env.APP_URL }));

app.use("*", requestId());
app.use("*", (c, next) => runWithRequestContext({ requestId: c.get("requestId") }, next));
app.use("*", httpLogger);
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  }),
);
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN ?? ["http://localhost:5173"],
    credentials: true,
  }),
);

app.use("*", sessionMiddleware);

const globalRateLimit = requireRateLimit({ limiter: di.IRateLimiter }, GLOBAL_POLICY);
app.use("*", (c, next) => (c.req.path.startsWith("/api/v1/") ? next() : globalRateLimit(c, next)));
const csrf = requireCsrf({
  outbox: di.IOutboxRepository,
  allowedOrigins: env.CORS_ORIGIN ?? ["http://localhost:5173"],
});
app.use("/me", csrf);
app.use("/me/*", csrf);
app.use("/uploads", csrf);
app.use("/uploads/*", csrf);
app.use("/settings/*", csrf);
app.use("/admin/*", csrf);
app.use("/consents", csrf);
app.use("/consents/*", csrf);
app.use("/billing/portal", csrf);
const consentRateLimit = requireRateLimit({ limiter: di.IRateLimiter }, CONSENT_POST_POLICY);
app.use("/consents", (c, next) =>
  c.req.method === "POST" || c.req.method === "DELETE" ? consentRateLimit(c, next) : next(),
);
app.use(
  "/api/auth/sign-in/email",
  requireRateLimit({ limiter: di.IRateLimiter, outbox: di.IOutboxRepository }, AUTH_SIGN_IN_POLICY),
);
app.use(
  "/api/auth/request-password-reset",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_FORGOT_PASSWORD_POLICY,
  ),
);
app.use(
  "/api/auth/sign-in/magic-link",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_MAGIC_LINK_POLICY,
  ),
);
app.use(
  "/api/auth/sign-up/email",
  requireRateLimit({ limiter: di.IRateLimiter, outbox: di.IOutboxRepository }, AUTH_SIGN_UP_POLICY),
);
app.use(
  "/api/auth/two-factor/verify-totp",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_TWO_FACTOR_POLICY,
  ),
);
app.use(
  "/api/auth/two-factor/verify-otp",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_TWO_FACTOR_POLICY,
  ),
);
app.use(
  "/api/auth/two-factor/verify-backup-code",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_TWO_FACTOR_POLICY,
  ),
);
app.use(
  "/api/auth/two-factor/generate-backup-codes",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_TWO_FACTOR_POLICY,
  ),
);
app.use(
  "/api/auth/send-verification-email",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_SEND_VERIFICATION_POLICY,
  ),
);
app.use(
  "/api/auth/verify-email",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_VERIFY_EMAIL_POLICY,
  ),
);
app.use(
  "/api/auth/reset-password",
  requireRateLimit(
    { limiter: di.IRateLimiter, outbox: di.IOutboxRepository },
    AUTH_RESET_PASSWORD_POLICY,
  ),
);
app.use(
  "/api/auth/passkey/verify-authentication",
  requireRateLimit({ limiter: di.IRateLimiter, outbox: di.IOutboxRepository }, AUTH_PASSKEY_POLICY),
);
app.use(
  "/api/auth/scim/*",
  requireRateLimit({ limiter: di.IRateLimiter, outbox: di.IOutboxRepository }, SCIM_POLICY),
);

// SCIM (RFC 7644) requires PUT/PATCH/DELETE on /scim/v2/Users/:userId — BetterAuth's
// own router 404s any method/path it hasn't registered, so widening the verb list here
// exposes no surface beyond what the mounted plugins already declare.
app.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/internal", healthInternalRoutes);
app.route("/internal", rgpdInternalRoutes);
app.route("/internal", sweepOutboxRoutes);
app.route("/internal", sweepAuditLogRoutes);
app.route("/internal", sweepWebhookDeliveryRoutes);
app.route("/internal", sweepConsentsRoutes);
app.route("/internal", sweepEmailMessagesRoutes);
app.route("/internal", sweepNotificationsRoutes);
app.route("/internal", flushNotificationEmailsRoutes);

app.route(
  "/api/v1",
  createPublicApiV1({
    repo: di.IApiTokenRepository,
    outbox: di.IOutboxRepository,
    prefix: env.API_TOKEN_PREFIX,
    pepper: env.API_TOKEN_PEPPER ?? "dev-only-pepper-not-for-production-use",
    pepperVersion: env.API_TOKEN_PEPPER_VERSION,
    pepperPrevious: env.API_TOKEN_PEPPER_PREVIOUS,
    bucketMin: env.API_TOKEN_LAST_USED_BUCKET_MIN,
    platformAdminIds: env.PLATFORM_ADMIN_IDS,
    limiter: di.IRateLimiter,
    resolveIp: resolveClientIp,
  }),
);

app.use(
  "/api/token-scanning/*",
  requireRateLimit({ limiter: di.IRateLimiter }, GITHUB_SCANNING_POLICY),
);
app.route(
  "/api/token-scanning",
  createApiTokenScanningRoutes({
    githubKeyVerifier: di.GithubKeyVerifier,
    apiTokenRepository: di.IApiTokenRepository,
    transactionService: di.ITransactionService,
    outboxRepository: di.IOutboxRepository,
    emailService: di.IEmailService,
    instrumentation: di.IInstrumentation,
    findUserById,
    prefix: env.API_TOKEN_PREFIX,
    pepper: env.API_TOKEN_PEPPER ?? "dev-only-pepper-not-for-production-use",
    pepperPrevious: env.API_TOKEN_PEPPER_PREVIOUS,
  }),
);

const routes = app
  .route("/me", rgpdMeRoutes)
  .route("/me/policies", policyRoutes)
  .route("/uploads", uploadsRoutes)
  .route("/admin/users", adminUserRoutes)
  .route("/admin/orgs", adminOrgRoutes)
  .route("/admin/impersonation", adminImpersonationRoutes)
  .route("/admin/audit-log", auditLogRoutes)
  .route("/settings/tokens", apiTokenRoutes)
  .route("/settings/webhooks", webhooksRoutes)
  .route("/settings/organization", organizationSettingsRoutes)
  .route("/consents", consentRoutes)
  .route("/billing", billingRoutes)
  .route("/notifications", notificationsRoutes);

app.onError(createErrorHandler(di.IInstrumentation));

EventCollector.setOutOfContextLogger((msg, meta) => logger.warn(meta ?? {}, msg));

await di.preload();
await di.OutboxDispatcher.start(di as unknown as Record<string, unknown>);
await di.WebhookDeliveryWorker.start();
await di.EmailDeliveryWorker.start();
await di.NotificationStreamHub.start();
lifecycleState.markStarted();

const SHUTDOWN_STEP_TIMEOUT_MS = 25_000;

async function stopWithTimeout(label: string, stop: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), SHUTDOWN_STEP_TIMEOUT_MS);
  });
  const result = await Promise.race([stop().then((): "ok" => "ok"), timeout]).catch(
    (err): "error" => {
      logger.error({ err, label }, "shutdown step threw");
      return "error";
    },
  );
  if (timer) clearTimeout(timer);
  if (result === "timeout") logger.warn({ label }, "shutdown step timeout — proceeding");
}

const shutdown = async (signal: string) => {
  logger.info({ signal, graceMs: env.SHUTDOWN_GRACE_PERIOD_MS }, "shutdown signal received");
  lifecycleState.signalShutdown();
  await new Promise<void>((resolve) => setTimeout(resolve, env.SHUTDOWN_GRACE_PERIOD_MS));
  logger.info({ signal }, "grace period elapsed, stopping workers");
  await Promise.all([
    stopWithTimeout("webhookDeliveryWorker", () => di.WebhookDeliveryWorker.stop()),
    stopWithTimeout("emailDeliveryWorker", () => di.EmailDeliveryWorker.stop()),
    stopWithTimeout("outboxDispatcher", () => di.OutboxDispatcher.stop()),
    stopWithTimeout("notificationStreamHub", () => di.NotificationStreamHub.stop()),
  ]);
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

if (env.NODE_ENV === "production" && !env.TRUSTED_PROXIES) {
  logger.warn(
    "TRUSTED_PROXIES is not set in production — behind a load-balancer all requests share the LB socket address as rate-limit key (collective lockout). Set it to `private` (trusts platform private ranges — the right value on Railway/Fly/most PaaS), a comma-separated CIDR list, or exact proxy IPs.",
  );
}

logger.info({ port: env.PORT, env: env.NODE_ENV }, "api ready");

export type { WebhookDeliveryStatus } from "./modules/webhooks/application/ports/webhook-delivery.port";

export type AppType = typeof routes;
export default {
  port: env.PORT,
  fetch: app.fetch,
};
