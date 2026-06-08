import { z } from "zod";
import { nameSchema, passwordSchema, strongPasswordSchema } from "../../shared/auth/auth.schema";

export const updateProfileSchema = z.object({
  name: nameSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changeEmailSchema = z.object({
  newEmail: z.email(),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: strongPasswordSchema,
    confirmPassword: strongPasswordSchema,
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
