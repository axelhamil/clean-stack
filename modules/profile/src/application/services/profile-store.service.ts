import type { Option, Result } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";
import type {
  IProfileRepository,
  IProfileStore,
  ProfileError,
} from "../ports/repositories/profile.port";
import type { IGetLocaleQuery } from "../queries/get-locale.query";
import type { IGetLocaleByEmailQuery } from "../queries/get-locale-by-email.query";

export class ProfileStoreService implements IProfileStore {
  constructor(
    private readonly getLocale: IGetLocaleQuery,
    private readonly getLocaleByEmail: IGetLocaleByEmailQuery,
    private readonly repo: IProfileRepository,
  ) {}

  findLocale(userId: string): Promise<Result<Option<Locale>, ProfileError>> {
    return this.getLocale.execute({ userId });
  }

  findLocaleByEmail(email: string): Promise<Result<Option<Locale>, ProfileError>> {
    return this.getLocaleByEmail.execute({ email });
  }

  setLocale(userId: string, locale: Locale): Promise<Result<void, ProfileError>> {
    return this.repo.setLocale(userId, locale);
  }
}
