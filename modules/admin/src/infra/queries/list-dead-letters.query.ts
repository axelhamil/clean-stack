import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type { IOpsStore, OpsStoreError } from "../../application/ports/repositories/ops-store.port";
import type {
  DeadLetters,
  IListDeadLettersQuery,
} from "../../application/queries/list-dead-letters.query";

export const DEAD_OUTBOX_PAGE = 100;

export class DeadLettersQuery implements IListDeadLettersQuery {
  constructor(
    private readonly ops: IOpsStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(): Promise<Result<DeadLetters, OpsStoreError>> {
    return this.instrumentation.startSpan({ name: "DeadLettersQuery > execute" }, async () => {
      const outbox = await this.ops.listDeadOutbox(DEAD_OUTBOX_PAGE);
      if (outbox.isFailure) return Result.fail(outbox.getError());

      const queues = await this.ops.countDeadQueues();
      if (queues.isFailure) return Result.fail(queues.getError());

      return Result.ok({ outbox: outbox.getValue(), queues: queues.getValue() });
    });
  }
}
