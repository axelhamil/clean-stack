import { type IInstrumentation, type Option, Result } from "@packages/ddd-kit";
import type {
  IStepUpStore,
  StepUpStoreError,
} from "../../application/ports/repositories/step-up-store.port";
import type { IStepUpValidityQuery } from "../../application/queries/step-up-validity.query";
import { type StepUpEnv, stepUpExpiryOf } from "../../application/services/step-up-policy.service";

export class StepUpValidityQuery implements IStepUpValidityQuery {
  constructor(
    private readonly store: IStepUpStore,
    private readonly env: StepUpEnv,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute({ sessionId }: { sessionId: string }): Promise<Result<Option<Date>, StepUpStoreError>> {
    return this.instrumentation.startSpan({ name: "StepUpValidityQuery > execute" }, async () => {
      const found = await this.store.findVerifiedAt(sessionId);
      if (found.isFailure) return Result.fail(found.getError());

      const now = Date.now();

      return Result.ok(
        found
          .getValue()
          .map((verifiedAt) => stepUpExpiryOf(verifiedAt, this.env))
          .filter((expiry) => expiry.getTime() > now),
      );
    });
  }
}
