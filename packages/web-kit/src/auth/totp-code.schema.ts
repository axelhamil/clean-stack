import { z } from "zod";

export const totpCodeSchema = z.string().refine((value) => /^\d{6}$/.test(value), {
  params: { i18nKey: "validation.totpCode" },
});
