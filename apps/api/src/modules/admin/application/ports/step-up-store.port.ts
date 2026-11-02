import type { AppError, Option, Result } from "@packages/ddd-kit";

export type StepUpStoreError = AppError<"ADMIN_STEP_UP_PROVIDER_FAILURE">;

export interface IStepUpStore {
  findVerifiedAt(sessionId: string): Promise<Result<Option<Date>, StepUpStoreError>>;
  record(sessionId: string, verifiedAt: Date): Promise<Result<boolean, StepUpStoreError>>;
}
