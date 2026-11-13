import type { IQuery, Option } from "@packages/ddd-kit";
import type { Locale } from "@packages/i18n";
import type { ProfileError } from "../ports/repositories/profile.port";

export interface GetLocaleInput {
  userId: string;
}

export type IGetLocaleQuery = IQuery<GetLocaleInput, Option<Locale>, ProfileError>;
