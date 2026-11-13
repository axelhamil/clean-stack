import type { AppError, Result } from "@packages/ddd-kit";

export type PasswordResetDeliveryError = AppError<"ADMIN_PASSWORD_RESET_UNAVAILABLE">;

export type ImpersonationRefusedError = AppError<"ADMIN_IMPERSONATION_FORBIDDEN">;

export type StopImpersonationRefusedError = AppError<"ADMIN_STOP_IMPERSONATION_FORBIDDEN">;

export type AuthRequestCredentials = ReadonlyArray<readonly [name: string, value: string]>;

export type SessionCookies = readonly string[];

export interface IAuthProvider {
  readonly impersonationTtlSeconds: number;
  impersonateUser(
    userId: string,
    credentials: AuthRequestCredentials,
  ): Promise<Result<SessionCookies, ImpersonationRefusedError>>;
  stopImpersonating(
    credentials: AuthRequestCredentials,
  ): Promise<Result<SessionCookies, StopImpersonationRefusedError>>;
  requestPasswordReset(email: string): Promise<Result<void, PasswordResetDeliveryError>>;
}
