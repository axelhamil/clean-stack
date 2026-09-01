import { db } from "@packages/drizzle";
import { Client } from "pg";
import type { Logger } from "../logger";
import { ensureNotificationTrigger, NOTIFICATION_NOTIFY_CHANNEL } from "./notification-trigger";

const RECONNECT_BACKOFF_MS = 1_000;
const RECONNECT_MAX_BACKOFF_MS = 30_000;

export const MAX_STREAMS_PER_USER = 5;

/**
 * The slice of `pg`'s `Client` this hub actually uses. Narrowing the dependency
 * to a shape rather than the class is what lets the reconnection contract be
 * proven without a database.
 */
export type NotificationListenClient = {
  on(event: "notification" | "error" | "end", listener: (arg: unknown) => void): unknown;
  connect(): Promise<unknown>;
  query(queryText: string): Promise<unknown>;
  end(): Promise<unknown>;
  removeAllListeners(): unknown;
};

export type NotificationStreamHubOptions = {
  createClient?: () => NotificationListenClient;
  reconnectBackoffMs?: number;
  reconnectMaxBackoffMs?: number;
};

export class NotificationStreamHub {
  private listenClient: NotificationListenClient | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly disposed = new WeakSet<NotificationListenClient>();
  private readonly subscribers = new Map<string, Set<() => void>>();
  private stopping = false;
  private started = false;
  private reconnectBackoff = RECONNECT_BACKOFF_MS;

  private readonly createClient: () => NotificationListenClient;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly logger: Logger,
    private readonly databaseUrl: string,
    options: NotificationStreamHubOptions = {},
  ) {
    this.createClient =
      options.createClient ??
      (() =>
        new Client({
          connectionString: this.databaseUrl,
          keepAlive: true,
          keepAliveInitialDelayMillis: 30_000,
        }));
    this.baseBackoffMs = options.reconnectBackoffMs ?? RECONNECT_BACKOFF_MS;
    this.maxBackoffMs = options.reconnectMaxBackoffMs ?? RECONNECT_MAX_BACKOFF_MS;
    this.reconnectBackoff = this.baseBackoffMs;
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
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.listenClient;
    this.listenClient = null;
    if (client) {
      client.removeAllListeners();
      try {
        await client.end();
      } catch (err) {
        this.logger.warn({ err }, "notification stream hub client end failed");
      }
    }
    this.subscribers.clear();
    this.logger.info("notification stream hub stopped");
  }

  private async connectListener(): Promise<void> {
    if (this.stopping) return;
    const client = this.createClient();
    const dispose = this.disposerFor(client);

    client.on("notification", (msg) => {
      this.dispatchSignal((msg as { payload?: string } | undefined)?.payload ?? "");
    });
    client.on("error", (err) => {
      this.logger.warn({ err }, "notification stream hub listener error, will reconnect");
      dispose();
      this.scheduleReconnect();
    });
    client.on("end", () => {
      if (this.stopping) return;
      this.logger.warn("notification stream hub listener ended, will reconnect");
      dispose();
      this.scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFICATION_NOTIFY_CHANNEL}`);
      // `error` can fire while `connect()` is still in flight: the client was
      // torn down under us and must not be adopted, or it would leak.
      if (this.disposed.has(client) || this.stopping) {
        dispose();
        return;
      }
      this.listenClient = client;
      this.reconnectBackoff = this.baseBackoffMs;
      this.logger.debug("notification stream hub listener connected");
    } catch (err) {
      this.logger.warn({ err }, "notification stream hub listener initial connect failed");
      dispose();
      this.scheduleReconnect();
    }
  }

  /**
   * Unwires a dying client exactly once. A dead `pg` connection emits `error`
   * *then* `end`, so both handlers race to the same teardown; leaving the
   * listeners attached keeps the client relaying every NOTIFY it still sees and
   * lets it schedule further reconnections of its own.
   */
  private disposerFor(client: NotificationListenClient): () => void {
    return () => {
      if (this.disposed.has(client)) return;
      this.disposed.add(client);
      client.removeAllListeners();
      if (this.listenClient === client) this.listenClient = null;
      void Promise.resolve(client.end()).catch(() => {});
    };
  }

  /**
   * At most one reconnection may ever be in flight. Guarding on "am I
   * connecting?" instead deadlocks the hub whenever `error` fires while
   * `connect()` is still pending — the guard is held by a connection that will
   * never complete.
   */
  private scheduleReconnect(): void {
    if (this.stopping) return;
    if (this.reconnectTimer !== null) return;
    const delay = this.reconnectBackoff;
    this.reconnectBackoff = Math.min(this.reconnectBackoff * 2, this.maxBackoffMs);
    const timer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectListener();
    }, delay);
    timer.unref?.();
    this.reconnectTimer = timer;
  }
}
