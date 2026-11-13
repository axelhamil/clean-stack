import { type ILogger, type IUseCase, Result } from "@packages/ddd-kit";
import type { RgpdSettings } from "../../config/rgpd-settings";
import type {
  IDeletionStateRepository,
  RgpdError,
} from "../../ports/repositories/deletion-state.port";
import type { IDeletionSweepHeartbeat } from "../../ports/services/deletion-sweep-heartbeat.port";
import type { AccountWipeService } from "../../services/account-wipe.service";
import type {
  ProcessPendingDeletionsInput,
  ProcessPendingDeletionsOutput,
} from "./process-pending-deletions.dto";

const DEFAULT_BATCH_SIZE = 50;

export class ProcessPendingDeletionsUseCase
  implements IUseCase<ProcessPendingDeletionsInput, ProcessPendingDeletionsOutput, RgpdError>
{
  constructor(
    private readonly states: IDeletionStateRepository,
    private readonly wipes: Pick<AccountWipeService, "wipe">,
    private readonly heartbeat: IDeletionSweepHeartbeat,
    private readonly settings: Pick<RgpdSettings, "sweepDeadlineMs">,
    private readonly logger: ILogger,
  ) {}

  execute(
    input: ProcessPendingDeletionsInput,
  ): Promise<Result<ProcessPendingDeletionsOutput, RgpdError>> {
    return this.heartbeat.around(input.dryRun, () => this.sweep(input));
  }

  private async sweep(
    input: ProcessPendingDeletionsInput,
  ): Promise<Result<ProcessPendingDeletionsOutput, RgpdError>> {
    const batchResult = await this.states.findReadyForWipe(input.batchSize ?? DEFAULT_BATCH_SIZE);
    if (batchResult.isFailure) {
      this.logger.error(
        { code: batchResult.getError().code },
        "rgpd sweep aborted: could not load batch",
      );
      return Result.fail(batchResult.getError());
    }

    const batch = batchResult.getValue();

    if (input.dryRun === true)
      return Result.ok({
        processed: batch.length,
        succeeded: batch.map((r) => r.userId),
        failed: [],
        dryRun: true,
        truncated: false,
      });

    const now = input.now ?? Date.now;
    const deadlineAt = now() + (input.deadlineMs ?? this.settings.sweepDeadlineMs);

    const succeeded: string[] = [];
    const failed: Array<{ userId: string; errorCode: string }> = [];
    let truncated = false;

    for (const row of batch) {
      if (now() >= deadlineAt) {
        truncated = true;
        this.logger.warn(
          {
            processed: succeeded.length + failed.length,
            remaining: batch.length - succeeded.length - failed.length,
          },
          "rgpd sweep hit the time budget: remaining accounts deferred to the next tick",
        );
        break;
      }

      try {
        const res = await this.wipes.wipe(row.userId);
        if (res.isSuccess) succeeded.push(row.userId);
        else failed.push({ userId: row.userId, errorCode: res.getError().code });
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        failed.push({ userId: row.userId, errorCode: "WIPE_UNCAUGHT" });
        this.logger.error(
          { err: e, userId: row.userId, message },
          "wipe threw uncaught error: Result contract violated",
        );
      }
    }

    if (succeeded.length > 0)
      this.logger.info(
        { processed: batch.length, succeeded: succeeded.length, failed: failed.length },
        "rgpd sweep completed",
      );

    if (failed.length > 0) this.logger.warn({ failed }, "rgpd sweep had failures");

    return Result.ok({
      processed: succeeded.length + failed.length,
      succeeded,
      failed,
      dryRun: false,
      truncated,
    });
  }
}
