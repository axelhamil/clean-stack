import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";
import type { ITransaction } from "../../../../shared/transaction";

export type ProfileError = AppError<"PROFILE_PROVIDER_FAILURE" | "PROFILE_NOT_FOUND">;

export interface IProfileStore {
  findLocale(userId: string, tx?: ITransaction): Promise<Result<Option<Locale>, ProfileError>>;
  findLocaleByEmail(
    email: string,
    tx?: ITransaction,
  ): Promise<Result<Option<Locale>, ProfileError>>;
  setLocale(userId: string, locale: Locale, tx?: ITransaction): Promise<Result<void, ProfileError>>;
}
