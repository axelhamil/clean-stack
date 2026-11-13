import { LOCALES } from "@packages/i18n";
import { z } from "zod";
import type { SetLocaleInput } from "../../../../application/usecases/set-locale/set-locale.dto";

export const localeBodySchema = z.object({
  locale: z.enum(LOCALES),
}) satisfies z.ZodType<Omit<SetLocaleInput, "userId">>;
