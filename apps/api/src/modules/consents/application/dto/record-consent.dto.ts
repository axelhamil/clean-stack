import { OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
import { z } from "zod";

export const recordConsentDto = z.object({
  // "necessary" is excluded from the body — it is always added server-side.
  categories: z.array(z.enum(OPTIONAL_CATEGORIES)).default([]),
});
