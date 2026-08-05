import { z } from "zod";

export const banFormSchema = z.object({
  reason: z.string().trim().min(1, "Un motif est requis").max(500),
  expiresIn: z.number().int().positive().optional(),
});
export type BanFormInput = z.infer<typeof banFormSchema>;

export const impersonateFormSchema = z.object({
  reason: z.string().trim().min(1, "Une justification est requise").max(500),
  ticketRef: z.string().trim().max(100).optional(),
});
export type ImpersonateFormInput = z.infer<typeof impersonateFormSchema>;
