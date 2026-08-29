import { z } from "zod";
import { passwordSchema, totpCodeSchema } from "../../shared/auth/auth.schema";

export const passwordPromptSchema = z.object({
  password: passwordSchema,
});
export type PasswordPromptInput = z.infer<typeof passwordPromptSchema>;

export const addPasskeySchema = z.object({
  name: z.string().min(2).max(50),
});
export type AddPasskeyInput = z.infer<typeof addPasskeySchema>;

export const verifyTotpSetupSchema = z.object({
  code: totpCodeSchema,
});
export type VerifyTotpSetupInput = z.infer<typeof verifyTotpSetupSchema>;
