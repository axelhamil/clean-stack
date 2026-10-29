import {
  EventCollector,
  type IDomainEvent,
  type IUnitOfWork,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import { type DbClient, db, type Transaction } from "../config";

export type FlushHandler = (events: IDomainEvent[], tx: Transaction) => Promise<void>;

/**
 * The slice of the host's instrumentation port this service needs, declared here
 * because a package cannot import the app's port. Any `IInstrumentation` fits it.
 */
export interface UnitOfWorkInstrumentation {
  startSpan<T>(options: { name: string }, callback: () => Promise<T>): Promise<T>;
}

class FailedResultRollback extends Error {
  constructor(readonly result: unknown) {
    super("unit of work rolled back: the work returned a failed Result");
  }
}

class EventsWithoutOutbox extends Error {
  constructor(events: IDomainEvent[]) {
    super(
      `unit of work rolled back: ${events.map((e) => e.eventType).join(", ")} raised in a run that has no outbox would be lost`,
    );
  }
}

type EventsByFlushHandler = Map<FlushHandler | null, IDomainEvent[]>;

interface OutermostRun {
  rollbackOnly: boolean;
  failure?: unknown;
  pending: EventsByFlushHandler;
}

const outermostRuns = new WeakMap<Transaction, OutermostRun>();

export function resolveExecutor(): DbClient | Transaction {
  return UnitOfWorkContext.transaction<Transaction>() ?? db;
}

function isFailedResult(value: unknown): boolean {
  return value instanceof Result && value.isFailure;
}

export class TransactionService implements IUnitOfWork<Transaction> {
  constructor(
    private readonly instrumentation: UnitOfWorkInstrumentation,
    private readonly flushHandler: FlushHandler | null = null,
  ) {}

  public async startTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan({ name: "TransactionService > startTransaction" }, () =>
      db.transaction(callback),
    );
  }

  public async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan({ name: "TransactionService > run" }, async () => {
      const ambient = UnitOfWorkContext.transaction<Transaction>();
      if (ambient) return UnitOfWorkContext.run(ambient, () => this.runNested(ambient, work));

      try {
        return await db.transaction((tx) =>
          UnitOfWorkContext.run(tx, () => this.runOutermost(tx, work)),
        );
      } catch (err) {
        if (err instanceof FailedResultRollback) return err.result as T;

        throw err;
      }
    });
  }

  private async runNested<T>(tx: Transaction, work: (tx: Transaction) => Promise<T>): Promise<T> {
    const result = await work(tx);
    const outermost = outermostRuns.get(tx);

    if (!isFailedResult(result)) {
      if (outermost) this.collect(outermost.pending);

      return result;
    }

    if (outermost && !outermost.rollbackOnly) {
      outermost.rollbackOnly = true;
      outermost.failure = result;
    }

    throw new FailedResultRollback(result);
  }

  private async runOutermost<T>(
    tx: Transaction,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const outermost: OutermostRun = { rollbackOnly: false, pending: new Map() };
    outermostRuns.set(tx, outermost);

    const result = await work(tx);
    if (isFailedResult(result)) throw new FailedResultRollback(result);
    if (outermost.rollbackOnly) throw new FailedResultRollback(outermost.failure);

    this.collect(outermost.pending);
    await flush(outermost.pending, tx);

    return result;
  }

  private collect(pending: EventsByFlushHandler): void {
    const drained = EventCollector.drain();
    if (drained.length === 0) return;

    pending.set(this.flushHandler, [...(pending.get(this.flushHandler) ?? []), ...drained]);
  }
}

async function flush(pending: EventsByFlushHandler, tx: Transaction): Promise<void> {
  for (const [flushHandler, events] of pending) {
    if (events.length === 0) continue;
    if (!flushHandler) throw new EventsWithoutOutbox(events);

    await flushHandler(events, tx);
  }
}
