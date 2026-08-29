import { z } from "zod";

export const passwordSchema = z.string().min(1);

export const strongPasswordSchema = z.string().min(15).max(128);

export const nameSchema = z.string().min(2).max(80);

export const totpCodeSchema = z
  .string()
  .min(6)
  .max(6)
  .regex(/^\d{6}$/);

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
  acceptedPolicies: z
    .boolean()
    .refine((v) => v, { params: { i18nKey: "validation.acceptPolicies" } }),
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
    params: { i18nKey: "validation.passwordsMismatch" },
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const twoFactorSchema = z.object({
  code: totpCodeSchema,
  trustDevice: z.boolean(),
});
export type TwoFactorInput = z.infer<typeof twoFactorSchema>;

export const backupCodeSchema = z
  .string()
  .transform((value) => {
    const stripped = value.replace(/\s/g, "");
    if (/^[a-zA-Z0-9]{10}$/.test(stripped)) return `${stripped.slice(0, 5)}-${stripped.slice(5)}`;
    return stripped;
  })
  .pipe(z.string().min(8).max(64));

export const backupCodeVerifySchema = z.object({
  code: backupCodeSchema,
  trustDevice: z.boolean(),
});
export type BackupCodeVerifyInput = z.infer<typeof backupCodeVerifySchema>;
