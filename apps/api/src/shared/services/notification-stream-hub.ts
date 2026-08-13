import { db } from "@packages/drizzle";
import { Client } from "pg";
import type { Logger } from "../logger";
import { ensureNotificationTrigger, NOTIFICATION_NOTIFY_CHANNEL } from "./notification-trigger";

const RECONNECT_BACKOFF_MS = 1_000;
const RECONNECT_MAX_BACKOFF_MS = 30_000;

export const MAX_STREAMS_PER_USER = 5;

export class NotificationStreamHub {
  private listenClient: Client | null = null;
  private readonly subscribers = new Map<string, Set<() => void>>();
  private stopping = false;
  private started = false;
  private reconnectBackoff = RECONNECT_BACKOFF_MS;

  constructor(
    private readonly logger: Logger,
    private readonly databaseUrl: string,
  ) {}

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
      }
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    await ensureNotificationTrigger(db);
    await this.connectListener();
    this.logger.info("notification stream hub started");
  }

  async stop(): Promise<void> {
    this.started = false;
    this.stopping = true;
    if (this.listenClient) {
      try {
        await this.listenClient.end();
      } catch (err) {
        this.logger.warn({ err }, "notification stream hub client end failed");
      }
      this.listenClient = null;
    }
    this.subscribers.clear();
    this.logger.info("notification stream hub stopped");
  }

  private async connectListener(): Promise<void> {
    if (this.stopping) return;
    const client = new Client({
      connectionString: this.databaseUrl,
      keepAlive: true,
      keepAliveInitialDelayMillis: 30_000,
    });
    client.on("notification", (msg) => {
      this.dispatchSignal(msg.payload ?? "");
    });
    client.on("error", (err: Error) => {
      this.logger.warn({ err }, "notification stream hub listener error, will reconnect");
      this.scheduleReconnect();
    });
    client.on("end", () => {
      if (this.stopping) return;
      this.logger.warn("notification stream hub listener ended, will reconnect");
      this.scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFICATION_NOTIFY_CHANNEL}`);
      this.listenClient = client;
      this.reconnectBackoff = RECONNECT_BACKOFF_MS;
      this.logger.debug("notification stream hub listener connected");
    } catch (err) {
      this.logger.warn({ err }, "notification stream hub listener initial connect failed");
      client.removeAllListeners();
      await client.end().catch(() => {});
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    const delay = this.reconnectBackoff;
    this.reconnectBackoff = Math.min(this.reconnectBackoff * 2, RECONNECT_MAX_BACKOFF_MS);
    setTimeout(() => {
      void this.connectListener();
    }, delay);
  }
}
