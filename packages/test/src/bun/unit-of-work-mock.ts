import {
  EventCollector,
  type IDomainEvent,
  type IUnitOfWork,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import { mockPort, type PortMock } from "./port-mock";

export type UnitOfWorkOutcome = "not_started" | "committed" | "rolled_back";

export interface UnitOfWorkOptions {
  commit?: "succeeds" | "fails";
}

export interface UnitOfWorkMock {
  unitOfWork: PortMock<IUnitOfWork>;
  outcome(): UnitOfWorkOutcome;
  writtenEvents(): IDomainEvent[];
}

export const COMMIT_FAILURE = "commit failed";

type Doom = { kind: "failed"; result: unknown } | { kind: "thrown"; error: unknown };

interface OutermostRun {
  doom?: Doom;
  pending: IDomainEvent[];
}

class NestedRollback extends Error {
  constructor(readonly result: unknown) {
    super("nested run failed");
  }
}

function isFailedResult(value: unknown): boolean {
  return value instanceof Result && value.isFailure;
}

function doom(outermost: OutermostRun, cause: Doom): void {
  outermost.doom ??= cause;
}

async function runNested<T>(
  tx: object,
  outermost: OutermostRun,
  work: () => Promise<T>,
): Promise<T> {
  const result = await UnitOfWorkContext.run(tx, async () => {
    try {
      const nested = await work();
      if (!isFailedResult(nested)) outermost.pending.push(...EventCollector.drain());

      return nested;
    } catch (error) {
      if (!(error instanceof NestedRollback)) doom(outermost, { kind: "thrown", error });

      throw error;
    }
  });
  if (!isFailedResult(result)) return result;

  doom(outermost, { kind: "failed", result });
  throw new NestedRollback(result);
}

export function mockUnitOfWork(options: UnitOfWorkOptions = {}): UnitOfWorkMock {
  const unitOfWork = mockPort<IUnitOfWork>();
  const openRuns = new WeakMap<object, OutermostRun>();
  const written: IDomainEvent[] = [];
  let outcome: UnitOfWorkOutcome = "not_started";

  unitOfWork.run.mockImplementation(async (work) => {
    const ambient = UnitOfWorkContext.transaction<object>();
    const open = ambient ? openRuns.get(ambient) : undefined;
    if (ambient && open) return runNested(ambient, open, work);

    const tx = {};
    const outermost: OutermostRun = { pending: [] };
    openRuns.set(tx, outermost);

    try {
      const result = await UnitOfWorkContext.run(tx, async () => {
        const done = await work();
        outermost.pending.push(...EventCollector.drain());

        return done;
      });
      if (isFailedResult(result)) {
        outcome = "rolled_back";

        return result;
      }
      if (outermost.doom?.kind === "thrown") throw outermost.doom.error;
      if (outermost.doom?.kind === "failed") {
        outcome = "rolled_back";

        return outermost.doom.result;
      }
      if (options.commit === "fails") throw new Error(COMMIT_FAILURE);

      outcome = "committed";
      written.push(...outermost.pending);

      return result;
    } catch (error) {
      outcome = "rolled_back";
      if (error instanceof NestedRollback) return error.result;

      throw error;
    }
  });

  return {
    unitOfWork,
    outcome: () => outcome,
    writtenEvents: () => [...written],
  };
}
