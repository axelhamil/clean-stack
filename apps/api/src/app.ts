import { createAdminUserRoutes } from "@modules/admin/routes/admin";
import { createAdminImpersonationRoutes } from "@modules/admin/routes/admin-impersonation";
import { createAdminInternalRoutes } from "@modules/admin/routes/admin-internal";
import { createAdminOrgRoutes } from "@modules/admin/routes/admin-orgs";
import { createAdminApprovalRoutes } from "@modules/admin/routes/approvals";
import { createAdminOpsRoutes } from "@modules/admin/routes/ops";
import { createAdminStaffRoutes } from "@modules/admin/routes/staff";
import { createAdminWorkspaceRoutes } from "@modules/admin/routes/workspace";
import { createApiTokenRoutes } from "@modules/api-token/routes/api-token";
import { createApiTokenScanningRoutes } from "@modules/api-token/routes/scanning";
import { createAuditLogRoutes } from "@modules/audit-log/routes/audit-log";
import { createBillingRoutes } from "@modules/billing/routes/billing";
import { createConsentRoutes } from "@modules/consents/routes/consents";
import { createNotificationsRoutes } from "@modules/notifications/routes/notifications";
import { createPolicyRoutes } from "@modules/policies/routes/policies";
import { createProfileRoutes } from "@modules/profile/routes/profile";
import { createRgpdRoutes } from "@modules/rgpd/routes/rgpd";
import { createRgpdInternalRoutes } from "@modules/rgpd/routes/rgpd-internal";
import { createUploadsRoutes } from "@modules/uploads/routes/uploads";
import { createWebhooksRoutes } from "@modules/webhooks/routes/webhooks";
import type { RouteGuard } from "@packages/http/route-guards";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { BetterAuthProvider } from "./composition/auth-provider";
import { type AppRouteGuards, routeGuards } from "./composition/route-guards";
import { di } from "./container";
import { healthInternalRoutes } from "./health/internal.routes";
import { healthRoutes } from "./health/routes";
import { organizationSettingsRoutes } from "./organization/routes";
import { createPublicApiV1 } from "./public-api";
import { env, FRONT_ORIGINS } from "./shared/env";
import { cspReportCors, makeCspReportApp } from "./shared/internal-routes/csp-report.route";
import { flushNotificationEmailsRoutes } from "./shared/internal-routes/flush-notification-emails.route";
import { internalLayers } from "./shared/internal-routes/internal-layers";
import { sweepAuditLogRoutes } from "./shared/internal-routes/sweep-audit-log.route";
import { sweepConsentsRoutes } from "./shared/internal-routes/sweep-consents.route";
import { sweepEmailMessagesRoutes } from "./shared/internal-routes/sweep-email-messages.route";
import { sweepNotificationsRoutes } from "./shared/internal-routes/sweep-notifications.route";
import { sweepOutboxRoutes } from "./shared/internal-routes/sweep-outbox.route";
import { runSweepRequest } from "./shared/internal-routes/sweep-route";
import { sweepStripeEventsRoutes } from "./shared/internal-routes/sweep-stripe-events.route";
import { sweepWebhookDeliveryRoutes } from "./shared/internal-routes/sweep-webhook-delivery.route";
import { logger } from "./shared/logger";
import { type AuthVariables, sessionMiddleware } from "./shared/middleware/auth.middleware";
import { requireCsrf } from "./shared/middleware/csrf.middleware";
import { createErrorHandler } from "./shared/middleware/error.middleware";
import { httpLogger } from "./shared/middleware/logger.middleware";
import { resolveClientIp } from "./shared/middleware/rate-limit.ip";
import { requireRateLimit } from "./shared/middleware/rate-limit.middleware";
import {
  ACCOUNT_DELETE_POLICY,
  ADMIN_STEP_UP_USER_POLICY,
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
  type PolicyConfig,
  SCIM_POLICY,
  visitorCapRoutes,
} from "./shared/middleware/rate-limit.policies";
import { resolveVisitorGeo } from "./shared/middleware/visitor-geo";
import type { VisitorGeo } from "./shared/ports/ip-geo.port";
import { runWithRequestContext } from "./shared/request-context";

type AppEnv = {
  Variables: AuthVariables & {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

const routeDeps = di.scope(
  {
    routeGuards: (): AppRouteGuards => routeGuards,
    internalGuards: (): readonly RouteGuard[] => internalLayers,
    runSweep: (): typeof runSweepRequest => runSweepRequest,
    IAuthProvider: (c) => new BetterAuthProvider(c.IInstrumentation),
    accountDeleteRateLimit: (c): RouteGuard =>
      requireRateLimit(
        { limiter: c.IRateLimiter, outbox: c.IOutboxRepository },
        ACCOUNT_DELETE_POLICY,
      ),
  },
  { name: "routes" },
);

const allowedOrigins = FRONT_ORIGINS;
const apiTokenPepper = env.API_TOKEN_PEPPER ?? "dev-only-pepper-not-for-production-use";

/** A rate limit whose first block also lands on the security event rail. */
const securityRateLimit = (policy: PolicyConfig) =>
  requireRateLimit(
    {
      limiter: di.IRateLimiter,
      outbox: di.IOutboxRepository,
      captcha: { service: di.ICaptchaService, usage: di.IRateLimiter },
    },
    policy,
  );

// Cookie-authenticated mutation surfaces: every one gets the Origin check.
const CSRF_GUARDED_PATHS = [
  "/me",
  "/me/*",
  "/uploads",
  "/uploads/*",
  "/settings/*",
  "/admin/*",
  "/consents",
  "/consents/*",
  "/billing/portal",
  "/notifications",
  "/notifications/*",
] as const;

// BetterAuth's credential and token-consuming endpoints, each on its own tight,
// fail-closed policy. The two-factor policy is shared on purpose: the three verify
// paths and backup-code regeneration draw from one budget per IP.
const AUTH_RATE_LIMITS: ReadonlyArray<readonly [path: string, policy: PolicyConfig]> = [
  ["/sign-in/email", AUTH_SIGN_IN_POLICY],
  ["/request-password-reset", AUTH_FORGOT_PASSWORD_POLICY],
  ["/sign-in/magic-link", AUTH_MAGIC_LINK_POLICY],
  ["/sign-up/email", AUTH_SIGN_UP_POLICY],
  ["/two-factor/verify-totp", AUTH_TWO_FACTOR_POLICY],
  ["/two-factor/verify-otp", AUTH_TWO_FACTOR_POLICY],
  ["/two-factor/verify-backup-code", AUTH_TWO_FACTOR_POLICY],
  ["/two-factor/generate-backup-codes", AUTH_TWO_FACTOR_POLICY],
  ["/send-verification-email", AUTH_SEND_VERIFICATION_POLICY],
  ["/verify-email", AUTH_VERIFY_EMAIL_POLICY],
  ["/reset-password", AUTH_RESET_PASSWORD_POLICY],
  ["/passkey/verify-authentication", AUTH_PASSKEY_POLICY],
  ["/scim/*", SCIM_POLICY],
  ...visitorCapRoutes(env.ACCOUNTS_PER_VISITOR_MAX, env.ACCOUNTS_PER_VISITOR_WINDOW_SEC),
];

app.route("/", healthRoutes);

// Mounted before the global middlewares: the endpoint is public, cross-origin (browser-posted),
// and must not inherit the same-origin CORP that secureHeaders sets, that would block the report POST.
app.use("/csp-report", cspReportCors);
app.use("/csp-report", securityRateLimit(CSP_REPORT_POLICY));
app.route(
  "/",
  makeCspReportApp({ outbox: di.IOutboxRepository, appUrl: env.APP_URL, adminUrl: env.ADMIN_URL }),
);

app.use("*", requestId());
app.use("*", (c, next) => {
  let clientIp: string | undefined;
  let visitorGeo: VisitorGeo | undefined;
  const context = {
    requestId: c.get("requestId"),
    clientIp: () => (clientIp ??= resolveClientIp(c)),
    visitorGeo: () => (visitorGeo ??= resolveVisitorGeo(c, di.IIpGeoService)),
  };

  return runWithRequestContext(context, next);
});
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
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use("*", sessionMiddleware);

const globalRateLimit = requireRateLimit({ limiter: di.IRateLimiter }, GLOBAL_POLICY);
app.use("*", (c, next) => (c.req.path.startsWith("/api/v1/") ? next() : globalRateLimit(c, next)));

const csrf = requireCsrf({ outbox: di.IOutboxRepository, allowedOrigins });
for (const path of CSRF_GUARDED_PATHS) app.use(path, csrf);

const consentRateLimit = requireRateLimit({ limiter: di.IRateLimiter }, CONSENT_POST_POLICY);
app.use("/consents", (c, next) =>
  c.req.method === "POST" || c.req.method === "DELETE" ? consentRateLimit(c, next) : next(),
);

for (const [path, policy] of AUTH_RATE_LIMITS) {
  app.use(`/api/auth${path}`, securityRateLimit(policy));
}

app.use("/admin/step-up", securityRateLimit(AUTH_TWO_FACTOR_POLICY));
app.use("/admin/step-up", securityRateLimit(ADMIN_STEP_UP_USER_POLICY));

app.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/api/auth/admin/*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404),
);

// SCIM (RFC 7644) requires PUT/PATCH/DELETE on /scim/v2/Users/:userId, BetterAuth's
// own router 404s any method/path it hasn't registered, so widening the verb list here
// exposes no surface beyond what the mounted plugins already declare.
app.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/internal", healthInternalRoutes);
app.route("/internal", createRgpdInternalRoutes(routeDeps));
app.route("/internal", createAdminInternalRoutes(routeDeps));
app.route("/internal", sweepOutboxRoutes);
app.route("/internal", sweepAuditLogRoutes);
app.route("/internal", sweepWebhookDeliveryRoutes);
app.route("/internal", sweepConsentsRoutes);
app.route("/internal", sweepStripeEventsRoutes);
app.route("/internal", sweepEmailMessagesRoutes);
app.route("/internal", sweepNotificationsRoutes);
app.route("/internal", flushNotificationEmailsRoutes);

app.route(
  "/api/v1",
  createPublicApiV1({
    repo: di.IApiTokenRepository,
    outbox: di.IOutboxRepository,
    uow: di.ITransactionService,
    instrumentation: di.IInstrumentation,
    logger,
    queries: di.AuthQueries,
    prefix: env.API_TOKEN_PREFIX,
    pepper: apiTokenPepper,
    pepperVersion: env.API_TOKEN_PEPPER_VERSION,
    pepperPrevious: env.API_TOKEN_PEPPER_PREVIOUS,
    bucketMin: env.API_TOKEN_LAST_USED_BUCKET_MIN,
    limiter: di.IRateLimiter,
    resolveIp: resolveClientIp,
  }),
);

app.use(
  "/api/token-scanning/*",
  requireRateLimit({ limiter: di.IRateLimiter }, GITHUB_SCANNING_POLICY),
);
app.route("/api/token-scanning", createApiTokenScanningRoutes(routeDeps));

const routes = app
  .route("/me", createRgpdRoutes(routeDeps))
  .route("/me", createProfileRoutes(routeDeps))
  .route("/me/policies", createPolicyRoutes(routeDeps))
  .route("/uploads", createUploadsRoutes(routeDeps))
  .route("/admin", createAdminStaffRoutes(routeDeps))
  .route("/admin", createAdminWorkspaceRoutes(routeDeps))
  .route("/admin/approvals", createAdminApprovalRoutes(routeDeps))
  .route("/admin/users", createAdminUserRoutes(routeDeps))
  .route("/admin/orgs", createAdminOrgRoutes(routeDeps))
  .route("/admin/ops", createAdminOpsRoutes(routeDeps))
  .route("/admin/impersonation", createAdminImpersonationRoutes(routeDeps))
  .route("/admin/audit-log", createAuditLogRoutes(routeDeps))
  .route("/settings/tokens", createApiTokenRoutes(routeDeps))
  .route("/settings/webhooks", createWebhooksRoutes(routeDeps))
  .route("/settings/organization", organizationSettingsRoutes)
  .route("/consents", createConsentRoutes(routeDeps))
  .route("/billing", createBillingRoutes(routeDeps))
  .route("/notifications", createNotificationsRoutes(routeDeps));

app.onError(createErrorHandler(di.IInstrumentation));

export { app, routes };
export type AppType = typeof routes;
export type { WebhookDeliveryStatus } from "@modules/webhooks/ports/webhook-delivery";
