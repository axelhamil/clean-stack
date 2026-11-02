import { db } from "@packages/drizzle";
import type { Logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";
import { ensureNotificationTrigger, NOTIFICATION_NOTIFY_CHANNEL } from "./notification-trigger";
import { PgListener, type PgListenerOptions } from "./pg-listener";

export const MAX_STREAMS_PER_USER = 5;

export class NotificationStreamHub {
  private readonly subscribers = new Map<string, Set<() => void>>();
  private readonly listener: PgListener;
  private started = false;

  constructor(
    private readonly logger: Logger,
    databaseUrl: string,
    private readonly instrumentation: IInstrumentation,
    options: PgListenerOptions = {},
  ) {
    this.listener = new PgListener(
      {
        channel: NOTIFICATION_NOTIFY_CHANNEL,
        label: "notification stream hub",
        owner: "NotificationStreamHub",
        connectionString: databaseUrl,
        onNotification: (userId) => this.dispatchSignal(userId ?? ""),
      },
      logger,
      instrumentation,
      options,
    );
  }

  subscribe(userId: string, onSignal: () => void): () => void {
    const existing = this.subscribers.get(userId) ?? new Set<() => void>();
    existing.add(onSignal);
    this.subscribers.set(userId, existing);
    return () => {
      const handles = this.subscribers.get(userId);
      if (!handles) return;
      handles.delete(onSignal);
      if (handles.size === 0) this.subscribers.delete(userId);
    };
  }

  subscriberCount(userId: string): number {
    return this.subscribers.get(userId)?.size ?? 0;
  }

  dispatchSignal(userId: string): void {
    const handles = this.subscribers.get(userId);
    if (!handles) return;
    for (const handle of handles) {
      try {
        handle();
      } catch (err) {
        this.logger.warn({ err }, "notification stream handle failed");
        this.instrumentation.capture(err);
      }
    }
  }

  async start(): Promise<void> {
    if (this.started) return;

    this.started = true;
    await this.instrumentation.startSpan({ name: "NotificationStreamHub > start" }, async () => {
      try {
        await ensureNotificationTrigger(db);
      } catch (err) {
        this.instrumentation.capture(err);
        throw err;
      }
    });
    await this.listener.start();
    this.logger.info("notification stream hub started");
  }

  async stop(): Promise<void> {
    this.started = false;
    await this.listener.stop();
    this.subscribers.clear();
    this.logger.info("notification stream hub stopped");
  }
}
