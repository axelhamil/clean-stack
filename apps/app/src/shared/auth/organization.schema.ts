import { z } from "zod";

export const orgNameSchema = z.string().min(2).max(64);
export const memberRoleSchema = z.enum(["owner", "admin", "member"]);

export const createOrgSchema = z.object({
  name: orgNameSchema,
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = z.object({
  name: orgNameSchema.optional(),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const inviteMemberSchema = z.object({
  email: z.email(),
  role: memberRoleSchema,
  teamId: z.string().optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
