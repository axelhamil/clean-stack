import { z } from "zod";

export const requestDeletionBodySchema = z
  .object({
    totpCode: z
      .string()
      .regex(/^\d{6}$/, "Must be a 6-digit code")
      .optional(),
    password: z.string().min(1).optional(),
  })
  .refine((d) => Boolean(d.totpCode || d.password), {
    message: "Provide either a TOTP code or password",
  });

export type RequestAccountDeletionBody = z.infer<typeof requestDeletionBodySchema>;
