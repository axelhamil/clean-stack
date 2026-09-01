import { type EventHandler, type IDomainEvent, isEventHandler, Option } from "@packages/ddd-kit";
import { db, sql } from "@packages/drizzle";
import { Client } from "pg";
import { JITTER_BASE_MS, JITTER_MULTIPLIER, nextAttemptAt } from "../jitter";
import type { Logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository, OutboxRecord } from "../ports/outbox.port";
import type { OutboxSubscriber } from "./outbox-subscriber";

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 30_000;
const RECONNECT_BACKOFF_MS = 1_000;
const RECONNECT_MAX_BACKOFF_MS = 30_000;
const NOTIFY_CHANNEL = "outbox_event";

function expectedDelayFromAttempts(currentAttempts: number): number {
  return JITTER_BASE_MS * JITTER_MULTIPLIER ** Math.max(0, currentAttempts);
}

function recordToDomainEvent(rec: OutboxRecord): IDomainEvent {
  return {
    eventType: rec.eventType,
    dateOccurred: rec.occurredAt,
    aggregateId: rec.aggregateId,
    payload: rec.payload,
  };
}

/**
 * The slice of `pg`'s `Client` this dispatcher actually uses. Narrowing the
 * dependency to a shape rather than the class is what lets the reconnection
 * contract be proven without a database.
 */
export type OutboxListenClient = {
  on(event: "notification" | "error" | "end", listener: (arg: unknown) => void): unknown;
  connect(): Promise<unknown>;
  query(queryText: string): Promise<unknown>;
  end(): Promise<unknown>;
  removeAllListeners(): unknown;
};

export type OutboxDispatcherOptions = {
  createClient?: () => OutboxListenClient;
  reconnectBackoffMs?: number;
  reconnectMaxBackoffMs?: number;
};

/**
 * Scans the DI container snapshot for `EventHandler` instances and indexes
 * them by `eventType`. Called once at `start()` so dispatch is a plain Map
 * lookup with no reflection at runtime. The DI container is passed as a plain
 * `Record` so this function stays testable without a real container.
 */
export function collectUserEventHandlers(
  diLike: Record<string, unknown>,
): Map<string, EventHandler[]> {
  const map = new Map<string, EventHandler[]>();
  for (const value of Object.values(diLike)) {
    if (!isEventHandler(value)) continue;
    const arr = map.get(value.eventType) ?? [];
    arr.push(value);
    map.set(value.eventType, arr);
  }
  return map;
}

export class OutboxDispatcher {
  private listenClient: OutboxListenClient | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly disposed = new WeakSet<OutboxListenClient>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;
  private started = false;
  private reconnectBackoff = RECONNECT_BACKOFF_MS;
  private userHandlers: Map<string, EventHandler[]> = new Map();

  private readonly createClient: () => OutboxListenClient;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly builtInSubscribers: OutboxSubscriber[],
    private readonly logger: Logger,
    private readonly connectionString: string,
    private readonly instrumentation: IInstrumentation,
    options: OutboxDispatcherOptions = {},
  ) {
    this.createClient =
      options.createClient ??
      (() =>
        new Client({
          connectionString: this.connectionString,
          keepAlive: true,
          keepAliveInitialDelayMillis: 30_000,
        }));
    this.baseBackoffMs = options.reconnectBackoffMs ?? RECONNECT_BACKOFF_MS;
    this.maxBackoffMs = options.reconnectMaxBackoffMs ?? RECONNECT_MAX_BACKOFF_MS;
    this.reconnectBackoff = this.baseBackoffMs;
  }

  async start(diLike?: Record<string, unknown>): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    if (diLike) this.userHandlers = collectUserEventHandlers(diLike);
    await this.ensureNotifyTrigger();
    await this.connectListener();
    this.pollTimer = setInterval(() => {
      this.triggerDrain().catch((err) =>
        this.logger.error({ err }, "outbox drain failed (poll tick)"),
      );
    }, POLL_INTERVAL_MS);
    this.logger.info("outbox dispatcher started");
    void this.triggerDrain();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.stopping = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
        this.logger.warn({ err }, "outbox listener end failed");
      }
    }
    while (this.draining) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.logger.info("outbox dispatcher stopped");
  }

  private async ensureNotifyTrigger(): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "OutboxDispatcher > ensureNotifyTrigger" },
      async () => {
        try {
          await db.execute(sql`
            CREATE OR REPLACE FUNCTION outbox_notify() RETURNS trigger AS $$
            BEGIN
              PERFORM pg_notify('outbox_event', NEW.id);
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
          `);
          await db.execute(sql`
            CREATE OR REPLACE TRIGGER outbox_notify_trigger
            AFTER INSERT ON outbox_event
            FOR EACH ROW EXECUTE FUNCTION outbox_notify()
          `);
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }

  private async connectListener(): Promise<void> {
    if (this.stopping) return;
    const client = this.createClient();
    const dispose = this.disposerFor(client);

    client.on("notification", () => {
      this.triggerDrain().catch((err) =>
        this.logger.error({ err }, "outbox drain failed (notify)"),
      );
    });
    client.on("error", (err) => {
      this.logger.warn({ err }, "outbox listener error, will reconnect");
      this.instrumentation.capture(err);
      dispose();
      this.scheduleReconnect();
    });
    client.on("end", () => {
      if (this.stopping) return;
      this.logger.warn("outbox listener ended, will reconnect");
      dispose();
      this.scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
      // `error` can fire while `connect()` is still in flight: the client was
      // torn down under us and must not be adopted, or it would leak.
      if (this.disposed.has(client) || this.stopping) {
        dispose();
        return;
      }
      this.listenClient = client;
      this.reconnectBackoff = this.baseBackoffMs;
      this.logger.debug("outbox listener connected");
    } catch (err) {
      this.instrumentation.capture(err);
      this.logger.warn({ err }, "outbox listener initial connect failed");
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
  private disposerFor(client: OutboxListenClient): () => void {
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
   * connecting?" instead deadlocks the dispatcher whenever `error` fires while
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

  async triggerDrain(): Promise<void> {
    if (this.stopping || this.draining) return;
    this.draining = true;
    try {
      return await this.instrumentation.startSpan(
        { name: "OutboxDispatcher > triggerDrain" },
        async () => {
          let drainedSize: number;
          do {
            drainedSize = await this.drainBatch();
          } while (drainedSize === BATCH_SIZE && !this.stopping);
        },
      );
    } finally {
      this.draining = false;
    }
  }

  private async drainBatch(): Promise<number> {
    return this.instrumentation.startSpan({ name: "OutboxDispatcher > drainBatch" }, async () => {
      const dispatched = await this.instrumentation.startSpan(
        {
          name: "db.transaction",
          op: "db.transaction",
          attributes: { "db.system.name": "postgresql" },
        },
        async () => {
          try {
            return await db.transaction(async (tx) => {
              await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '30s'`);
              const events = await this.outbox.findPendingBatch(BATCH_SIZE, tx);
              const ok: OutboxRecord[] = [];
              for (const event of events) {
                try {
                  for (const sub of this.builtInSubscribers) {
                    await sub.handle(event, tx);
                  }
                  await this.outbox.markDispatched(event.id, tx);
                  ok.push(event);
                } catch (err) {
                  const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
                  this.instrumentation.capture(err);
                  this.logger.error(
                    { err, eventId: event.id, eventType: event.eventType },
                    "outbox event built-in subscriber failed",
                  );
                  const { date } = nextAttemptAt(
                    event.attempts + 1,
                    expectedDelayFromAttempts(event.attempts + 1),
                  );
                  await this.outbox.markFailed(event.id, errMsg, Option.fromNullable(date), tx);
                }
              }
              return { dispatched: ok, total: events.length };
            });
          } catch (err) {
            this.instrumentation.capture(err);
            throw err;
          }
        },
      );

      for (const event of dispatched.dispatched) {
        if (this.stopping) break;
        const handlers = this.userHandlers.get(event.eventType) ?? [];
        if (handlers.length === 0) continue;
        const domainEvent = recordToDomainEvent(event);
        for (const h of handlers) {
          try {
            await h.handle(domainEvent);
          } catch (err) {
            this.instrumentation.capture(err);
            this.logger.error(
              { err, eventId: event.id, eventType: event.eventType, handlerType: event.eventType },
              "outbox user handler threw (event already dispatched, handler is best-effort)",
            );
          }
        }
      }
      return dispatched.total;
    });
  }
}
