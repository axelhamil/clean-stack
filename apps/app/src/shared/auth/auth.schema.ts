import { z } from "zod";

export const passwordSchema = z.string().min(1, { message: "Password is required" });

export const strongPasswordSchema = z
  .string()
  .min(12, { message: "Password must be at least 12 characters" })
  .max(128, { message: "Password must be at most 128 characters" })
  .regex(/[a-z]/, { message: "Password must contain a lowercase letter" })
  .regex(/[A-Z]/, { message: "Password must contain an uppercase letter" })
  .regex(/[0-9]/, { message: "Password must contain a digit" });

export const nameSchema = z
  .string()
  .min(2, { message: "Name must be at least 2 characters" })
  .max(80);

export const totpCodeSchema = z
  .string()
  .min(6, { message: "Code must be 6 digits" })
  .max(6, { message: "Code must be 6 digits" })
  .regex(/^\d{6}$/, { message: "Code must be 6 digits" });

export const signInSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  rememberMe: z.boolean(),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: nameSchema,
  email: z.email(),
  password: strongPasswordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const magicLinkSchema = z.object({
  email: z.email(),
});
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const resetPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: strongPasswordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const twoFactorSchema = z.object({
  code: totpCodeSchema,
  trustDevice: z.boolean(),
});
export type TwoFactorInput = z.infer<typeof twoFactorSchema>;
