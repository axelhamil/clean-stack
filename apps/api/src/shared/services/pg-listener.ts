import { Client } from "pg";
import type { Logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";

const RECONNECT_BACKOFF_MS = 1_000;
const RECONNECT_MAX_BACKOFF_MS = 30_000;

/**
 * The slice of `pg`'s `Client` a listener actually uses. Narrowing the
 * dependency to a shape rather than the class is what lets the reconnection
 * contract be proven without a database.
 */
export type PgListenClient = {
  on(event: "notification" | "error" | "end", listener: (arg: unknown) => void): unknown;
  connect(): Promise<unknown>;
  query(queryText: string): Promise<unknown>;
  end(): Promise<unknown>;
  removeAllListeners(): unknown;
};

export type PgListenerOptions = {
  createClient?: () => PgListenClient;
  reconnectBackoffMs?: number;
  reconnectMaxBackoffMs?: number;
};

export interface PgListenerConfig {
  channel: string;
  /** Subject of every log line and breadcrumb, e.g. `"outbox"`. */
  label: string;
  /** Class that owns the listener, named in the connect span. */
  owner: string;
  connectionString: string;
  onNotification: (payload: string | undefined) => void;
}

/**
 * One dedicated `LISTEN` connection that survives its backend dying.
 *
 * A pooled connection cannot hold a `LISTEN`: the pool hands it to someone else
 * between queries. So each consumer of `pg_notify` keeps its own client, and
 * every one of them has to solve the same problem: a dead connection must be
 * replaced exactly once, with backoff, without ever leaving two clients relaying
 * the same NOTIFY. That contract lives here so it is proven once.
 */
export class PgListener {
  private listenClient: PgListenClient | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly disposed = new WeakSet<PgListenClient>();
  private stopping = false;
  private reconnectBackoff: number;

  private readonly createClient: () => PgListenClient;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly config: PgListenerConfig,
    private readonly logger: Logger,
    private readonly instrumentation: IInstrumentation,
    options: PgListenerOptions = {},
  ) {
    this.createClient =
      options.createClient ??
      (() =>
        new Client({
          connectionString: this.config.connectionString,
          keepAlive: true,
          keepAliveInitialDelayMillis: 30_000,
        }));
    this.baseBackoffMs = options.reconnectBackoffMs ?? RECONNECT_BACKOFF_MS;
    this.maxBackoffMs = options.reconnectMaxBackoffMs ?? RECONNECT_MAX_BACKOFF_MS;
    this.reconnectBackoff = this.baseBackoffMs;
  }

  async start(): Promise<void> {
    this.stopping = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const client = this.listenClient;
    this.listenClient = null;
    if (!client) return;

    client.removeAllListeners();
    try {
      await client.end();
    } catch (err) {
      this.logger.warn({ err }, `${this.config.label} listener end failed`);
      this.instrumentation.capture(err);
    }
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;

    const { label } = this.config;
    const client = this.createClient();
    const dispose = this.disposerFor(client);

    client.on("notification", (msg) => {
      this.config.onNotification((msg as { payload?: string } | undefined)?.payload);
    });
    client.on("error", (err) => {
      this.logger.warn({ err }, `${label} listener error, will reconnect`);
      this.instrumentation.capture(err);
      dispose();
      this.scheduleReconnect();
    });
    client.on("end", () => {
      if (this.stopping) return;

      this.logger.warn(`${label} listener ended, will reconnect`);
      this.instrumentation.addBreadcrumb({
        category: label,
        message: "listener connection ended, reconnecting",
        level: "warning",
      });
      dispose();
      this.scheduleReconnect();
    });

    return this.instrumentation.startSpan(
      { name: `${this.config.owner} > connectListener` },
      async () => {
        const listen = `LISTEN ${this.config.channel}`;
        try {
          await client.connect();
          await this.instrumentation.startSpan(
            { name: listen, op: "db.query", attributes: { "db.system.name": "postgresql" } },
            () => client.query(listen),
          );

          // `error` can fire while `connect()` is still in flight: the client was
          // torn down under us and must not be adopted, or it would leak.
          if (this.disposed.has(client) || this.stopping) {
            dispose();
            return;
          }

          this.listenClient = client;
          this.reconnectBackoff = this.baseBackoffMs;
          this.logger.debug(`${label} listener connected`);
        } catch (err) {
          this.logger.warn({ err }, `${label} listener initial connect failed`);
          this.instrumentation.capture(err);
          dispose();
          this.scheduleReconnect();
        }
      },
    );
  }

  /**
   * Unwires a dying client exactly once. A dead `pg` connection emits `error`
   * *then* `end`, so both handlers race to the same teardown; leaving the
   * listeners attached keeps the client relaying every NOTIFY it still sees and
   * lets it schedule further reconnections of its own. The `end()` rejection is
   * dropped on purpose: the connection is already known dead and reported by the
   * `error` handler, its teardown failing adds nothing.
   */
  private disposerFor(client: PgListenClient): () => void {
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
   * connecting?" instead deadlocks the listener whenever `error` fires while
   * `connect()` is still pending: the guard is held by a connection that will
   * never complete.
   */
  private scheduleReconnect(): void {
    if (this.stopping) return;
    if (this.reconnectTimer !== null) return;

    const delay = this.reconnectBackoff;
    this.reconnectBackoff = Math.min(this.reconnectBackoff * 2, this.maxBackoffMs);
    const timer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    timer.unref?.();
    this.reconnectTimer = timer;
  }
}
