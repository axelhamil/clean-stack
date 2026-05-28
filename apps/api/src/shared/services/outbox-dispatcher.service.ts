import { type EventHandler, type IDomainEvent, isEventHandler } from "@packages/ddd-kit";
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
  private listenClient: Client | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;
  private reconnectBackoff = RECONNECT_BACKOFF_MS;
  private userHandlers: Map<string, EventHandler[]> = new Map();

  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly builtInSubscribers: OutboxSubscriber[],
    private readonly logger: Logger,
    private readonly connectionString: string,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async start(diLike?: Record<string, unknown>): Promise<void> {
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
    this.stopping = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.listenClient) {
      try {
        await this.listenClient.end();
      } catch (err) {
        this.logger.warn({ err }, "outbox listener end failed");
      }
      this.listenClient = null;
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
    const client = new Client({
      connectionString: this.connectionString,
      keepAlive: true,
      keepAliveInitialDelayMillis: 30_000,
    });
    client.on("notification", () => {
      this.triggerDrain().catch((err) =>
        this.logger.error({ err }, "outbox drain failed (notify)"),
      );
    });
    client.on("error", (err: Error) => {
      this.logger.warn({ err }, "outbox listener error, will reconnect");
      this.scheduleReconnect();
    });
    client.on("end", () => {
      if (this.stopping) return;
      this.logger.warn("outbox listener ended, will reconnect");
      this.scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
      this.listenClient = client;
      this.reconnectBackoff = RECONNECT_BACKOFF_MS;
      this.logger.debug("outbox listener connected");
    } catch (err) {
      this.instrumentation.capture(err);
      this.logger.warn({ err }, "outbox listener initial connect failed");
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
                  await this.outbox.markFailed(event.id, errMsg, date, tx);
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
