import { EventCollector } from "@packages/ddd-kit";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { di } from "./container";
import { auditLogRoutes } from "./modules/audit-log/routes";
import { healthRoutes } from "./modules/health/routes";
import { rgpdInternalRoutes } from "./modules/rgpd/internal.routes";
import { rgpdMeRoutes } from "./modules/rgpd/routes";
import { uploadsRoutes } from "./modules/uploads/routes";
import { webhooksRoutes } from "./modules/webhooks/routes";
import { env } from "./shared/env";
import { sweepAuditLogRoutes } from "./shared/internal-routes/sweep-audit-log.route";
import { sweepOutboxRoutes } from "./shared/internal-routes/sweep-outbox.route";
import { sweepWebhookDeliveryRoutes } from "./shared/internal-routes/sweep-webhook-delivery.route";
import { logger } from "./shared/logger";
import {
  type AuthVariables,
  requireAuth,
  sessionMiddleware,
} from "./shared/middleware/auth.middleware";
import { errorHandler } from "./shared/middleware/error.middleware";
import { httpLogger } from "./shared/middleware/logger.middleware";
import { lifecycleState } from "./shared/shutdown";

type AppEnv = {
  Variables: AuthVariables & {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

app.route("/", healthRoutes);

app.use("*", requestId());
app.use("*", httpLogger);
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN ?? ["http://localhost:5173"],
    credentials: true,
  }),
);

app.use("*", sessionMiddleware);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/internal", rgpdInternalRoutes);
app.route("/internal", sweepOutboxRoutes);
app.route("/internal", sweepAuditLogRoutes);
app.route("/internal", sweepWebhookDeliveryRoutes);

const routes = app
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user") }))
  .route("/me", rgpdMeRoutes)
  .route("/uploads", uploadsRoutes)
  .route("/admin/audit-log", auditLogRoutes)
  .route("/settings/webhooks", webhooksRoutes);

app.onError(errorHandler);

EventCollector.setOutOfContextLogger((msg, meta) => logger.warn(meta ?? {}, msg));

await di.preload();
await di.OutboxDispatcher.start(di as unknown as Record<string, unknown>);
await di.WebhookDeliveryWorker.start();
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
    stopWithTimeout("outboxDispatcher", () => di.OutboxDispatcher.stop()),
  ]);
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info({ port: env.PORT, env: env.NODE_ENV }, "api ready");

export type { WebhookDeliveryStatus } from "./modules/webhooks/application/ports/webhook-delivery.port";

export type AppType = typeof routes;
export default {
  port: env.PORT,
  fetch: app.fetch,
};
