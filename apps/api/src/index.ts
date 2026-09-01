import "./shared/services/sentry-init";

import { EventCollector } from "@packages/ddd-kit";
import { app } from "./app";
import { di } from "./container";
import { buildServerOptions } from "./server-options";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import { lifecycleState } from "./shared/shutdown";

export type { AppType } from "./app";

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

export default {
  ...buildServerOptions({ port: env.PORT, idleTimeoutSeconds: env.SERVER_IDLE_TIMEOUT_SECONDS }),
  fetch: app.fetch,
};
