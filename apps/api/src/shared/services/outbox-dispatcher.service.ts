import {
  type EventHandler,
  type IEventDispatcher,
  InMemoryEventDispatcher,
  type IUnitOfWork,
  isEventHandler,
  Option,
} from "@packages/ddd-kit";
import { db } from "@packages/drizzle";
import type { Logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { DeliveredEvent, IOutboxRepository, OutboxRecord } from "../ports/outbox.port";
import { OUTBOX_CHANNEL } from "./drizzle-outbox.service";
import { OutboxRelay, type OutboxRelayOptions } from "./outbox-relay";
import type { OutboxSubscriber } from "./outbox-subscriber";
import { PgListener, type PgListenerOptions } from "./pg-listener";

export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_STOP_SETTLE_MARGIN_MS = 2_000;

const POLL_INTERVAL_MS = 30_000;
const EMPTY_DRAIN_FLOOR_MS = 50;
const FAILED_DRAIN_RETRY_MS = 2_000;

export type OutboxDispatcherOptions = {
  relay: OutboxRelayOptions;
  uow: IUnitOfWork;
  stopGraceMs: number;
  listener?: PgListenerOptions;
};

export function collectUserEventHandlers(diLike: Record<string, unknown>): EventHandler[] {
  return Object.values(diLike).filter(isEventHandler);
}

function recordOf(event: DeliveredEvent): OutboxRecord {
  return {
    id: event.eventId ?? "",
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    aggregateType: event.aggregateType ?? "unknown",
    organizationId: Option.fromNullable(event.organizationId),
    payload: event.payload,
    metadata: {
      specversion: "1.0",
      source: "app/api",
      datacontenttype: "application/json",
      requestId: event.requestId,
    },
    occurredAt: event.dateOccurred,
    attempts: 0,
    deadAt: Option.none(),
    deliveries: {},
  };
}

function subscribeAll(
  dispatcher: IEventDispatcher<DeliveredEvent>,
  eventType: string,
  name: string,
  handle: (event: DeliveredEvent) => Promise<void>,
): void {
  const subscribed = dispatcher.subscribe(eventType, name, handle);
  if (subscribed.isFailure) throw new Error(subscribed.getError());
}

function legacyDispatcher(
  eventTypes: readonly string[],
  subscribers: readonly OutboxSubscriber[],
  userHandlers: readonly EventHandler[],
): IEventDispatcher<DeliveredEvent> {
  const dispatcher = new InMemoryEventDispatcher<DeliveredEvent>();
  for (const eventType of eventTypes) {
    for (const subscriber of subscribers) {
      subscribeAll(dispatcher, eventType, subscriber.name, (event) =>
        db.transaction((tx) => subscriber.handle(recordOf(event), tx)),
      );
    }
  }
  for (const handler of userHandlers) {
    subscribeAll(dispatcher, handler.eventType, handler.handlerName, (event) =>
      handler.handle(event),
    );
  }

  return dispatcher;
}

export class OutboxDispatcher {
  private readonly listener: PgListener;
  private relay: OutboxRelay | null = null;
  private started = false;
  private stopped = true;
  private draining = false;
  private wakeRequested = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly builtInSubscribers: OutboxSubscriber[],
    private readonly logger: Logger,
    connectionString: string,
    private readonly instrumentation: IInstrumentation,
    private readonly options: OutboxDispatcherOptions,
  ) {
    this.listener = new PgListener(
      {
        channel: OUTBOX_CHANNEL,
        label: "outbox",
        owner: "OutboxDispatcher",
        connectionString,
        onNotification: () => this.wake(),
        onReconnect: () => this.wake(),
      },
      logger,
      instrumentation,
      options.listener,
    );
  }

  async start(diLike: Record<string, unknown> = {}): Promise<void> {
    if (this.started) return;

    this.started = true;
    this.stopped = false;
    const dispatcher = legacyDispatcher(
      this.options.relay.eventTypes,
      this.builtInSubscribers,
      collectUserEventHandlers(diLike),
    );
    this.relay = new OutboxRelay(
      this.outbox,
      this.options.uow,
      dispatcher,
      this.options.relay,
      this.instrumentation,
      this.logger,
    );
    await this.listener.start();
    this.logger.info("outbox dispatcher started");
    this.wake();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.stopped = true;
    clearTimeout(this.timer);
    const relay = this.relay;
    relay?.halt();
    const grace = setTimeout(() => relay?.abandonInFlight(), this.options.stopGraceMs);
    try {
      await this.inFlight;
    } finally {
      clearTimeout(grace);
    }
    await this.listener.stop();
    this.logger.info("outbox dispatcher stopped");
  }

  private wake(): void {
    if (this.stopped) return;

    if (this.draining) {
      this.wakeRequested = true;
      return;
    }

    clearTimeout(this.timer);
    this.draining = true;
    this.inFlight = this.drainUntilQuiet();
  }

  private async drainUntilQuiet(): Promise<void> {
    let nextWakeMs = 0;
    do {
      this.wakeRequested = false;
      nextWakeMs = await this.drainThenPlanNextWake();
    } while (!this.stopped && (this.wakeRequested || nextWakeMs === 0));

    this.draining = false;
    if (!this.stopped) this.timer = setTimeout(() => this.wake(), nextWakeMs);
  }

  private async drainThenPlanNextWake(): Promise<number> {
    const relay = this.relay;
    if (!relay) return POLL_INTERVAL_MS;

    try {
      const { dispatched, failed } = await relay.drainOnce();
      const { dueInMs } = await relay.pendingState();
      const floorMs = dispatched + failed === 0 ? EMPTY_DRAIN_FLOOR_MS : 0;
      const nextDueMs = Math.max(floorMs, Math.ceil(dueInMs.unwrapOr(POLL_INTERVAL_MS)));

      return Math.min(nextDueMs, POLL_INTERVAL_MS);
    } catch (err) {
      this.instrumentation.capture(err);
      this.logger.error({ err }, "outbox drain failed");

      return FAILED_DRAIN_RETRY_MS;
    }
  }
}
