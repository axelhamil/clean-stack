import type { IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { authSchema, eq } from "@packages/drizzle";
import type { Locale } from "@packages/i18n";
import type { ProfileError } from "../../application/ports/repositories/profile.port";
import type {
  GetLocaleByEmailInput,
  IGetLocaleByEmailQuery,
} from "../../application/queries/get-locale-by-email.query";
import { lookupLocale } from "./locale-lookup";

export class DrizzleGetLocaleByEmailQuery implements IGetLocaleByEmailQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  execute({ email }: GetLocaleByEmailInput): Promise<Result<Option<Locale>, ProfileError>> {
    return lookupLocale(this.instrumentation, {
      spanName: "DrizzleGetLocaleByEmailQuery > execute",
      op: "findLocaleByEmail",
      condition: eq(authSchema.user.email, email),
    });
  }
}
