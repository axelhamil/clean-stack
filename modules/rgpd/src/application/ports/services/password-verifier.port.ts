import type { AppError, Result } from "@packages/ddd-kit";

export type PasswordVerifierError = AppError<"RGPD_REPOSITORY_PROVIDER_FAILURE">;

export interface IPasswordVerifier {
  matches(userId: string, password: string): Promise<Result<boolean, PasswordVerifierError>>;
}
