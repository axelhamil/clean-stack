import { z } from "zod";

export const orgNameSchema = z.string().min(2).max(64);
export const orgSlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,62}$/, "Lowercase letters, digits, dashes only");
export const memberRoleSchema = z.enum(["owner", "admin", "member"]);

export const createOrgSchema = z.object({
  name: orgNameSchema,
  slug: orgSlugSchema,
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = z.object({
  name: orgNameSchema.optional(),
  slug: orgSlugSchema.optional(),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: memberRoleSchema,
  teamId: z.string().optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
