import type { AppError, Result } from "@packages/ddd-kit";

export interface IStaffDataEraser {
  eraseDataOf(userId: string): Promise<Result<void, AppError>>;
}
