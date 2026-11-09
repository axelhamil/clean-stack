import type { AppError, Result } from "@packages/ddd-kit";

export interface IDeadWebhookReader {
  countDeadLetters(): Promise<Result<number, AppError>>;
}
