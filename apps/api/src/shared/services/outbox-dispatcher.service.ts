import { type EventHandler, type IDomainEvent, isEventHandler, Option } from "@packages/ddd-kit";
import { db, sql } from "@packages/drizzle";
import { expectedDelayFromAttempts, nextAttemptAt } from "../jitter";
import type { Logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository, OutboxRecord } from "../ports/outbox.port";
import type { OutboxSubscriber } from "./outbox-subscriber";
import { PgListener, type PgListenerOptions } from "./pg-listener";

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 30_000;
const NOTIFY_CHANNEL = "outbox_event";

function recordToDomainEvent(rec: OutboxRecord): IDomainEvent {
  return {
    eventType: rec.eventType,
    dateOccurred: rec.occurredAt,
    aggregateId: rec.aggregateId,
    payload: rec.payload,
  };
}

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
  private readonly listener: PgListener;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private draining = false;
  private stopping = false;
  private started = false;
  private userHandlers: Map<string, EventHandler[]> = new Map();

  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly builtInSubscribers: OutboxSubscriber[],
    private readonly logger: Logger,
    connectionString: string,
    private readonly instrumentation: IInstrumentation,
    options: PgListenerOptions = {},
  ) {
    this.listener = new PgListener(
      {
        channel: NOTIFY_CHANNEL,
        label: "outbox",
        owner: "OutboxDispatcher",
        connectionString,
        onNotification: () => this.drainInBackground("notify"),
      },
      logger,
      instrumentation,
      options,
    );
  }

  async start(diLike?: Record<string, unknown>): Promise<void> {
    if (this.started) return;

    this.started = true;
    this.stopping = false;
    if (diLike) this.userHandlers = collectUserEventHandlers(diLike);
    await this.ensureNotifyTrigger();
    await this.listener.start();
    this.pollTimer = setInterval(() => this.drainInBackground("poll tick"), POLL_INTERVAL_MS);
    this.logger.info("outbox dispatcher started");
    this.drainInBackground("start");
  }

  async stop(): Promise<void> {
    this.started = false;
    this.stopping = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.listener.stop();
    while (this.draining) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.logger.info("outbox dispatcher stopped");
  }

  /**
   * Fire-and-forget entry point for every drain nobody awaits. A rejection left
   * unhandled here would take the whole process down, so it always ends in a log
   * line; `drainBatch` has already reported it to telemetry before rethrowing.
   */
  private drainInBackground(trigger: string): void {
    this.triggerDrain().catch((err) =>
      this.logger.error({ err }, `outbox drain failed (${trigger})`),
    );
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
