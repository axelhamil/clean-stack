import { z } from "zod";

export const passwordSchema = z.string().min(1);

export const strongPasswordSchema = z.string().min(15).max(128);

export const nameSchema = z.string().min(2).max(80);

// One custom check rather than min/max/regex: the built-in checks emit the
// generic length copy from the global map, and a 5-digit entry reading "Must be
// at least 6 characters" is exactly the field-specific message extraction was
// not supposed to lose.
export const totpCodeSchema = z.string().refine((value) => /^\d{6}$/.test(value), {
  params: { i18nKey: "validation.totpCode" },
});

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

const stripBackupCode = (value: string): string => value.replace(/\s/g, "");

// Length is checked before the transform, not after: the transform inserts a
// separator, so a post-transform count reports a number the user never typed.
export const backupCodeSchema = z
  .string()
  .refine(
    (value) => {
      const length = stripBackupCode(value).length;
      return length >= 8 && length <= 64;
    },
    { params: { i18nKey: "validation.backupCode" } },
  )
  .transform((value) => {
    const stripped = stripBackupCode(value);
    if (/^[a-zA-Z0-9]{10}$/.test(stripped)) return `${stripped.slice(0, 5)}-${stripped.slice(5)}`;
    return stripped;
  });

export const backupCodeVerifySchema = z.object({
  code: backupCodeSchema,
  trustDevice: z.boolean(),
});
export type BackupCodeVerifyInput = z.infer<typeof backupCodeVerifySchema>;
