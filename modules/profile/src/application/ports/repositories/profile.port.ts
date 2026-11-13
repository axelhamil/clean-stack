import type { AppError, Result } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";

export type ProfileError = AppError<"PROFILE_PROVIDER_FAILURE" | "PROFILE_NOT_FOUND">;

export interface IProfileRepository {
  setLocale(userId: string, locale: Locale): Promise<Result<void, ProfileError>>;
}
