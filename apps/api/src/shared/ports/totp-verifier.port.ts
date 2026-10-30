import type { AppError, Option, Result } from "@packages/ddd-kit";

export type TotpVerifierError = AppError<"TOTP_VERIFIER_PROVIDER_FAILURE">;

export interface ITotpVerifier {
  verify(userId: string, code: string): Promise<Result<Option<number>, TotpVerifierError>>;
}
