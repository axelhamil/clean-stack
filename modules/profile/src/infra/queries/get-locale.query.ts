import type { IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { authSchema, eq } from "@packages/drizzle";
import type { Locale } from "@packages/i18n";
import type { ProfileError } from "../../application/ports/repositories/profile.port";
import type { GetLocaleInput, IGetLocaleQuery } from "../../application/queries/get-locale.query";
import { lookupLocale } from "./locale-lookup";

export class DrizzleGetLocaleQuery implements IGetLocaleQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  execute({ userId }: GetLocaleInput): Promise<Result<Option<Locale>, ProfileError>> {
    return lookupLocale(this.instrumentation, {
      spanName: "DrizzleGetLocaleQuery > execute",
      op: "findLocale",
      condition: eq(authSchema.user.id, userId),
    });
  }
}
