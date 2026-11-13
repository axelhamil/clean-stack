import type { Option, Result } from "@packages/ddd-kit";
import type { StepUpStoreError } from "../ports/repositories/step-up-store.port";
import type { IStepUpValidityQuery } from "../queries/step-up-validity.query";

export class StepUpService {
  constructor(private readonly validity: IStepUpValidityQuery) {}

  validUntil(sessionId: string): Promise<Result<Option<Date>, StepUpStoreError>> {
    return this.validity.execute({ sessionId });
  }
}
