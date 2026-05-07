import { EventCollector } from "@packages/ddd-kit";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { di } from "./container";
import { auditLogInternalRoutes } from "./modules/audit-log/internal.routes";
import { auditLogRoutes } from "./modules/audit-log/routes";
import { rgpdInternalRoutes } from "./modules/rgpd/internal.routes";
import { rgpdMeRoutes } from "./modules/rgpd/routes";
import { uploadsRoutes } from "./modules/uploads/routes";
import { webhooksRoutes } from "./modules/webhooks/routes";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import {
  type AuthVariables,
  requireAuth,
  sessionMiddleware,
} from "./shared/middleware/auth.middleware";
import { errorHandler } from "./shared/middleware/error.middleware";
import { httpLogger } from "./shared/middleware/logger.middleware";

type AppEnv = {
  Variables: AuthVariables & {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

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
app.route("/internal", auditLogInternalRoutes);

const routes = app
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .get("/ready", (c) => c.json({ status: "ok" as const }))
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user") }))
  .route("/me", rgpdMeRoutes)
  .route("/uploads", uploadsRoutes)
  .route("/admin/audit-log", auditLogRoutes)
  .route("/settings/webhooks", webhooksRoutes);

app.onError(errorHandler);

EventCollector.setOutOfContextLogger((msg, meta) => logger.warn(meta ?? {}, msg));

await di.OutboxDispatcher.start(di as unknown as Record<string, unknown>);
await di.WebhookDeliveryWorker.start();

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
  logger.info({ signal }, "shutdown signal received, stopping workers");
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
