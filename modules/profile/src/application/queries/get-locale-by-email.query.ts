import type { IQuery, Option } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";
import type { ProfileError } from "../ports/repositories/profile.port";

export interface GetLocaleByEmailInput {
  email: string;
}

export type IGetLocaleByEmailQuery = IQuery<GetLocaleByEmailInput, Option<Locale>, ProfileError>;
