import {
  EventCollector,
  type IDomainEvent,
  type IUnitOfWork,
  Option,
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

type Doom = { kind: "failed"; result: unknown } | { kind: "thrown"; error: unknown };

interface OutermostRun {
  doom?: Doom;
  pending: EventsByFlushHandler;
}

const outermostRuns = new WeakMap<Transaction, OutermostRun>();

export function ambientTransaction(): Option<Transaction> {
  return Option.fromNullable(UnitOfWorkContext.transaction<Transaction>());
}

export function resolveExecutor(): DbClient | Transaction {
  return ambientTransaction().toUndefined() ?? db;
}

export function savepoint<T>(work: () => Promise<T>): Promise<T> {
  return resolveExecutor().transaction((tx) => UnitOfWorkContext.run(tx, work));
}

function isFailedResult(value: unknown): boolean {
  return value instanceof Result && value.isFailure;
}

function doom(outermost: OutermostRun | undefined, cause: Doom): void {
  if (outermost && !outermost.doom) outermost.doom = cause;
}

export class TransactionService implements IUnitOfWork {
  constructor(
    private readonly instrumentation: UnitOfWorkInstrumentation,
    private readonly flushHandler: FlushHandler | null = null,
  ) {}

  public async run<T>(work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan({ name: "TransactionService > run" }, async () => {
      const ambient = ambientTransaction();
      if (ambient.isNone()) return this.openTransaction(work);

      const tx = ambient.unwrap();
      return UnitOfWorkContext.run(tx, () => this.runNested(tx, work));
    });
  }

  public async runOutermost<T>(work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan({ name: "TransactionService > runOutermost" }, () =>
      this.openTransaction(work),
    );
  }

  private async openTransaction<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await db.transaction((tx) => UnitOfWorkContext.run(tx, () => this.complete(tx, work)));
    } catch (err) {
      if (err instanceof FailedResultRollback) return err.result as T;

      throw err;
    }
  }

  private async runNested<T>(tx: Transaction, work: () => Promise<T>): Promise<T> {
    const outermost = outermostRuns.get(tx);

    try {
      const result = await work();
      if (isFailedResult(result)) {
        doom(outermost, { kind: "failed", result });
        throw new FailedResultRollback(result);
      }

      if (outermost) this.collect(outermost.pending);
      return result;
    } catch (err) {
      if (!(err instanceof FailedResultRollback)) doom(outermost, { kind: "thrown", error: err });

      throw err;
    }
  }

  private async complete<T>(tx: Transaction, work: () => Promise<T>): Promise<T> {
    const outermost: OutermostRun = { pending: new Map() };
    outermostRuns.set(tx, outermost);

    const result = await work();
    if (isFailedResult(result)) throw new FailedResultRollback(result);
    if (outermost.doom?.kind === "thrown") throw outermost.doom.error;
    if (outermost.doom?.kind === "failed") throw new FailedResultRollback(outermost.doom.result);

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
