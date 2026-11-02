import "./shared/services/sentry-init";

import { EventCollector } from "@packages/ddd-kit";
import { closeDb, closeRateLimitDb } from "@packages/drizzle";
import { type Server, serve } from "bun";
import { app } from "./app";
import { di } from "./container";
import { buildServerOptions } from "./server-options";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import {
  DEADLINE_FLUSH_TIMEOUT_MS,
  drainHttpServer,
  GRACE_MARGIN_MS,
  installShutdown,
  lifecycleState,
  type ShutdownStep,
  TELEMETRY_FLUSH_MARGIN_MS,
  TELEMETRY_FLUSH_TIMEOUT_MS,
} from "./shared/shutdown";

export type { AppType } from "./app";

declare global {
  var apiServer: Server<undefined> | undefined;
  var uninstallApiShutdown: (() => void) | undefined;
}

EventCollector.setOutOfContextLogger((msg, meta) => logger.warn(meta ?? {}, msg));

await di.preload();
await di.OutboxDispatcher.start(di);
await di.WebhookDeliveryWorker.start();
await di.EmailDeliveryWorker.start();
await di.NotificationStreamHub.start();
lifecycleState.markStarted();

if (env.NODE_ENV === "production" && !env.TRUSTED_PROXIES) {
  logger.warn(
    "TRUSTED_PROXIES is not set in production, behind a load-balancer all requests share the LB socket address as rate-limit key (collective lockout). Set it to `private` (trusts platform private ranges, the right value on Railway/Fly/most PaaS), a comma-separated CIDR list, or exact proxy IPs.",
  );
}

export type { WebhookDeliveryStatus } from "./modules/webhooks/application/ports/webhook-delivery.port";

const serveOptions = {
  ...buildServerOptions({ port: env.PORT, idleTimeoutSeconds: env.SERVER_IDLE_TIMEOUT_SECONDS }),
  fetch: app.fetch,
};
const running = globalThis.apiServer;
running?.reload(serveOptions);
const server = running ?? serve(serveOptions);
globalThis.apiServer = server;

const steps: ShutdownStep[] = [
  {
    name: "signal-and-grace",
    timeoutMs: env.SHUTDOWN_GRACE_PERIOD_MS + GRACE_MARGIN_MS,
    run: async () => {
      lifecycleState.signalShutdown();
      await new Promise<void>((resolve) => setTimeout(resolve, env.SHUTDOWN_GRACE_PERIOD_MS));
    },
  },
  {
    name: "http",
    timeoutMs: env.SHUTDOWN_STEP_TIMEOUT_MS,
    run: () => drainHttpServer(server, env.SHUTDOWN_STEP_TIMEOUT_MS),
  },
  {
    name: "workers",
    timeoutMs: env.SHUTDOWN_WORKERS_TIMEOUT_MS,
    run: async () => {
      await Promise.all([
        di.WebhookDeliveryWorker.stop(),
        di.EmailDeliveryWorker.stop(),
        di.OutboxDispatcher.stop(),
        di.NotificationStreamHub.stop(),
      ]);
    },
  },
  {
    name: "database-pool",
    timeoutMs: env.SHUTDOWN_STEP_TIMEOUT_MS,
    skipAfterTimeoutOf: "workers",
    run: async () => {
      await Promise.all([closeDb(), closeRateLimitDb()]);
    },
  },
  {
    name: "telemetry-flush",
    timeoutMs: TELEMETRY_FLUSH_TIMEOUT_MS + TELEMETRY_FLUSH_MARGIN_MS,
    run: async () => {
      const flushed = await di.IInstrumentation.flush(TELEMETRY_FLUSH_TIMEOUT_MS);
      if (!flushed) logger.warn("telemetry flush timed out, some events were dropped");
    },
  },
];

globalThis.uninstallApiShutdown?.();
globalThis.uninstallApiShutdown = installShutdown(steps, {
  deadlineMs: env.SHUTDOWN_DEADLINE_MS,
  logger,
  exit: (code) => process.exit(code),
  flushOnDeadline: async () => {
    await di.IInstrumentation.flush(DEADLINE_FLUSH_TIMEOUT_MS);
  },
});

logger.info({ port: server.port, env: env.NODE_ENV }, "api ready");
