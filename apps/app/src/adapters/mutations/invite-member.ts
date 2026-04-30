import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const inviteMemberMutationOptions = mutationOptions({
  mutationKey: ["org", "invite-member"] as const,
  mutationFn: async ({
    email,
    role,
    organizationId,
    teamId,
  }: {
    email: string;
    role: "owner" | "admin" | "member";
    organizationId?: string;
    teamId?: string;
  }) => {
    const { error } = await authClient.organization.inviteMember({
      email,
      role,
      ...(organizationId ? { organizationId } : {}),
      ...(teamId ? { teamId } : {}),
    });
    if (error) throw error;
  },
});
