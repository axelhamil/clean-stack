import { z } from "zod";
import { passwordSchema } from "../../auth/_schemas/auth.schema";

export const passwordPromptSchema = z.object({
  password: passwordSchema,
});
export type PasswordPromptInput = z.infer<typeof passwordPromptSchema>;

export const addPasskeySchema = z.object({
  name: z
    .string()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(50, { message: "Name must be at most 50 characters" }),
});
export type AddPasskeyInput = z.infer<typeof addPasskeySchema>;

export const verifyTotpSetupSchema = z.object({
  code: z
    .string()
    .min(6, { message: "Code must be 6 digits" })
    .max(6, { message: "Code must be 6 digits" })
    .regex(/^\d{6}$/, { message: "Code must be 6 digits" }),
});
export type VerifyTotpSetupInput = z.infer<typeof verifyTotpSetupSchema>;
