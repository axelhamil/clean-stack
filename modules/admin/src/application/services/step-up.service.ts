import type { IUseCase, Option, Result } from "@packages/ddd-kit";
import type { StepUpStoreError } from "../ports/repositories/step-up-store.port";
import type { IStepUpValidityQuery } from "../queries/step-up-validity.query";
import type {
  VerifyStepUpInput,
  VerifyStepUpOutput,
} from "../usecases/verify-step-up/verify-step-up.dto";
import type { StepUpError } from "../usecases/verify-step-up/verify-step-up.usecase";

export class StepUpService {
  constructor(
    private readonly validity: IStepUpValidityQuery,
    private readonly verification: IUseCase<VerifyStepUpInput, VerifyStepUpOutput, StepUpError>,
  ) {}

  validUntil(sessionId: string): Promise<Result<Option<Date>, StepUpStoreError>> {
    return this.validity.execute({ sessionId });
  }

  verify(input: VerifyStepUpInput): Promise<Result<VerifyStepUpOutput, StepUpError>> {
    return this.verification.execute(input);
  }
}
