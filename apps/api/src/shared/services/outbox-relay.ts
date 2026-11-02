import {
  type HandlerOutcome,
  type IEventDispatcher,
  type IUnitOfWork,
  uuidv7,
} from "@packages/ddd-kit";
import {
  EventTypes,
  OUTBOX_LAST_ERROR_MAX_LENGTH,
  type OutboxEventDeadPayload,
} from "@packages/events";
import { scrubText } from "@packages/sentry-scrub";
import { OUTBOX_SETTLE_MARGIN_SECONDS } from "../env-bounds";
import { failureSchedule } from "../jitter";
import type { Logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type {
  DeliveredEvent,
  IOutboxRepository,
  OutboxDeliveries,
  OutboxPendingState,
  OutboxRecord,
} from "../ports/outbox.port";
import { raceWithTimeout } from "../race-with-timeout";

export type OutboxRelayOptions = {
  eventTypes: readonly string[];
  batchSize: number;
  maxAttempts: number;
  leaseSeconds: number;
  deadRetrySeconds: number;
  concurrency: number;
  handlerBudgetSeconds: number;
};

export type DrainOutcome = { dispatched: number; failed: number; died: number; released: number };

type HandlerFailure = { name: string; error: string };

type Interrupted = { name: string; interrupted: true };

type HandlerRun = HandlerOutcome | Interrupted;

type FailedDelivery = {
  delivered: OutboxDeliveries;
  failedHandlers: string[];
  lastError: string;
};

type Delivery =
  | { interrupted: true }
  | { interrupted: false; delivered: OutboxDeliveries; failures: HandlerFailure[] };

const TIMED_OUT = "timed out";

export function claimLimitOf(options: OutboxRelayOptions): number {
  const usableLeaseSeconds = options.leaseSeconds - OUTBOX_SETTLE_MARGIN_SECONDS;
  const roundsWithinLease = Math.max(
    1,
    Math.floor(usableLeaseSeconds / options.handlerBudgetSeconds),
  );

  return Math.min(options.batchSize, roundsWithinLease * Math.max(1, options.concurrency));
}

function toDeliveredEvent(record: OutboxRecord): DeliveredEvent {
  return {
    eventId: record.id,
    eventType: record.eventType,
    aggregateId: record.aggregateId,
    aggregateType: record.aggregateType,
    organizationId: record.organizationId.toUndefined(),
    requestId: record.metadata.requestId,
    dateOccurred: record.occurredAt,
    payload: record.payload,
  };
}

function storedError(failures: readonly HandlerFailure[]): string {
  return failures
    .map(({ name, error }) => `${name}: ${scrubText(error)}`)
    .join("; ")
    .slice(0, OUTBOX_LAST_ERROR_MAX_LENGTH);
}

function isInterrupted(run: HandlerRun): run is Interrupted {
  return "interrupted" in run;
}

export class OutboxRelay {
  private readonly claimLimit: number;
  private halted = false;
  private readonly inFlight = new Set<() => void>();

  constructor(
    private readonly repository: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly dispatcher: IEventDispatcher<DeliveredEvent>,
    private readonly options: OutboxRelayOptions,
    private readonly instrumentation: IInstrumentation,
    private readonly logger: Logger,
  ) {
    this.claimLimit = claimLimitOf(options);
  }

  halt(): void {
    this.halted = true;
  }

  abandonInFlight(): void {
    this.halted = true;
    for (const interrupt of this.inFlight) interrupt();
  }

  async drainOnce(): Promise<DrainOutcome> {
    return this.instrumentation.startSpan({ name: "OutboxRelay > drainOnce" }, async () => {
      const outcome: DrainOutcome = { dispatched: 0, failed: 0, died: 0, released: 0 };
      if (this.halted) return outcome;

      const claimed = await this.repository.claim({
        limit: this.claimLimit,
        eventTypes: this.options.eventTypes,
        leaseSeconds: this.options.leaseSeconds,
      });
      if (claimed.isFailure) throw new Error(claimed.getError());

      await this.eachBounded(claimed.getValue(), (record) =>
        this.halted ? this.release(record, outcome) : this.settle(record, outcome),
      );

      return outcome;
    });
  }

  async pendingState(): Promise<OutboxPendingState> {
    const state = await this.repository.pendingState(this.options.eventTypes);
    if (state.isFailure) throw new Error(state.getError());

    return state.getValue();
  }

  private async eachBounded(
    records: readonly OutboxRecord[],
    work: (record: OutboxRecord) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const lane = async () => {
      for (let record = records[next++]; record !== undefined; record = records[next++]) {
        await work(record);
      }
    };
    const lanes = await Promise.allSettled(
      Array.from({ length: Math.min(this.options.concurrency, records.length) }, lane),
    );
    const failed = lanes.find((settled) => settled.status === "rejected");
    if (failed) throw failed.reason;
  }

  private async release(record: OutboxRecord, outcome: DrainOutcome): Promise<void> {
    const released = await this.repository.release(record);
    if (released.isFailure) throw new Error(released.getError());

    if (released.getValue()) outcome.released++;
  }

  private async settle(record: OutboxRecord, outcome: DrainOutcome): Promise<void> {
    const names = this.dispatcher.handlersOf(record.eventType);
    if (names.length === 0) {
      const lastError = `${record.eventType} has no subscriber in this process`;
      return this.settleFailure(record, { delivered: {}, failedHandlers: [], lastError }, outcome);
    }

    const delivery = await this.deliver(record, names);
    if (delivery.interrupted) return this.release(record, outcome);

    const { delivered, failures } = delivery;
    if (failures.length === 0) {
      const settled = await this.repository.markDelivered(record, delivered);
      if (settled.isFailure) throw new Error(settled.getError());

      if (settled.getValue()) outcome.dispatched++;
      return;
    }

    const failedHandlers = failures.map(({ name }) => name);
    await this.settleFailure(
      record,
      { delivered, failedHandlers, lastError: storedError(failures) },
      outcome,
    );
  }

  private async settleFailure(
    record: OutboxRecord,
    { delivered, failedHandlers, lastError }: FailedDelivery,
    outcome: DrainOutcome,
  ): Promise<void> {
    this.logger.warn(
      {
        eventId: record.id,
        eventType: record.eventType,
        attempts: record.attempts,
        failedHandlers,
      },
      "outbox event delivery failed, retry scheduled",
    );

    const wasDead = record.deadAt.isSome();
    const { dead, retryAfterSeconds } = failureSchedule(record.attempts, {
      wasDead,
      maxAttempts: this.options.maxAttempts,
      deadRetrySeconds: this.options.deadRetrySeconds,
    });
    const death = {
      eventId: record.id,
      eventType: record.eventType,
      aggregateId: record.aggregateId,
      attempts: record.attempts,
      lastError,
      failedHandlers,
    };
    const settled = await this.uow.run(async () => {
      const written = await this.repository.markFailed(record, {
        lastError,
        retryAfterSeconds,
        dead,
        deliveries: delivered,
      });
      const announces = dead && !wasDead && record.eventType !== EventTypes.OUTBOX_EVENT_DEAD;
      if (written.isFailure || !written.getValue() || !announces) return written;

      await this.announceDeath(death);
      return written;
    });
    if (settled.isFailure) throw new Error(settled.getError());
    if (!settled.getValue()) return;

    outcome.failed++;
    if (!dead || wasDead) return;

    outcome.died++;
    this.logger.error(death, "outbox event dead after its last attempt, retried on a slow cadence");
    this.instrumentation.capture(new Error("outbox event dead"), { metadata: death });
  }

  private async deliver(record: OutboxRecord, names: readonly string[]): Promise<Delivery> {
    const event = toDeliveredEvent(record);
    const runs = await Promise.all(
      names
        .filter((name) => !(name in record.deliveries))
        .map((name) => this.runOne(event, name, record.attempts)),
    );
    if (runs.some(isInterrupted)) return { interrupted: true };

    const at = new Date().toISOString();
    const outcomes = runs.flatMap((run) => (isInterrupted(run) ? [] : [run]));

    return {
      interrupted: false,
      delivered: Object.fromEntries(outcomes.filter(({ ok }) => ok).map(({ name }) => [name, at])),
      failures: outcomes.flatMap((run) => (run.ok ? [] : [{ name: run.name, error: run.error }])),
    };
  }

  private async runOne(event: DeliveredEvent, name: string, attempts: number): Promise<HandlerRun> {
    let interrupt: () => void = () => {};
    const interrupted = new Promise<HandlerRun>((resolve) => {
      interrupt = () => resolve({ name, interrupted: true });
    });
    this.inFlight.add(interrupt);

    try {
      const run = await raceWithTimeout<HandlerRun>(
        Promise.race([this.dispatcher.run(event, name), interrupted]),
        this.options.handlerBudgetSeconds * 1000,
        () => ({ name, ok: false, error: TIMED_OUT }),
      );
      if (!isInterrupted(run) && !run.ok) {
        this.instrumentation.capture(new Error(`outbox handler ${name} failed: ${run.error}`), {
          metadata: { eventId: event.eventId, eventType: event.eventType, attempts },
        });
      }

      return run;
    } finally {
      this.inFlight.delete(interrupt);
    }
  }

  private async announceDeath(death: Omit<OutboxEventDeadPayload, "actorUserId">): Promise<void> {
    const payload: OutboxEventDeadPayload = { ...death, actorUserId: null };
    await this.repository.enqueue(
      [
        {
          eventId: uuidv7(),
          eventType: EventTypes.OUTBOX_EVENT_DEAD,
          aggregateId: death.eventId,
          dateOccurred: new Date(),
          payload,
        },
      ],
      {
        source: "app/api/outbox-relay",
        organizationId: null,
        aggregateType: "outbox_event",
      },
    );
  }
}
