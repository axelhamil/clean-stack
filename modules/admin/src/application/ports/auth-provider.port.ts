import type { AppError, Result } from "@packages/ddd-kit";

export type PasswordResetDeliveryError = AppError<"ADMIN_PASSWORD_RESET_UNAVAILABLE">;

export interface IAuthProvider {
  readonly impersonationTtlSeconds: number;
  impersonateUser(userId: string, headers: Headers): Promise<Response>;
  stopImpersonating(headers: Headers): Promise<Response>;
  requestPasswordReset(email: string): Promise<Result<void, PasswordResetDeliveryError>>;
  handle(request: Request): Promise<Response>;
}
