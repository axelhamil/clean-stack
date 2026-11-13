import type { AppError, Result } from "@packages/ddd-kit";

export type UserNameWriterError = AppError<"USER_ACCOUNT_PROVIDER_FAILURE">;

export interface IUserNameWriter {
  setName(userId: string, name: string): Promise<Result<void, UserNameWriterError>>;
}
