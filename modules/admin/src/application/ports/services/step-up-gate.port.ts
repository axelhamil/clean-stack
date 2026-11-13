import type { AppError, Result } from "@packages/ddd-kit";

export type StepUpRefusal = AppError;

export interface IStepUpGate {
  confirm(): Promise<Result<void, StepUpRefusal>>;
}
