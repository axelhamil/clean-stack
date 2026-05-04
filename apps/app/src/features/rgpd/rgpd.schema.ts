import { z } from "zod";
import { passwordSchema, totpCodeSchema } from "../../shared/auth/auth.schema";

export const requestDeletionWithPasswordSchema = z.object({
  password: passwordSchema,
});
export type RequestDeletionWithPasswordInput = z.infer<typeof requestDeletionWithPasswordSchema>;

export const requestDeletionWithTotpSchema = z.object({
  totpCode: totpCodeSchema,
});
export type RequestDeletionWithTotpInput = z.infer<typeof requestDeletionWithTotpSchema>;
