import type { Result } from "@packages/ddd-kit";

export type PasswordBreachError = { code: "BREACH_CHECK_PROVIDER_FAILURE"; message: string };

export interface IPasswordBreachService {
  isBreached(password: string): Promise<Result<boolean, PasswordBreachError>>;
}
