import { LOCALES } from "@packages/i18n";
import { z } from "zod";

export const localeSchema = z.object({
  locale: z.enum(LOCALES),
});
