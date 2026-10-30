import type { AppError, Result } from "@packages/ddd-kit";

export type TotpVerifierError = AppError<"TOTP_VERIFIER_PROVIDER_FAILURE">;

export type TotpOutcome = "accepted" | "invalid" | "replayed" | "not_enrolled";

export interface ITotpVerifier {
  consume(userId: string, code: string): Promise<Result<TotpOutcome, TotpVerifierError>>;
}
