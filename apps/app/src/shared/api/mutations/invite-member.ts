import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const inviteMemberMutationOptions = mutationOptions({
  mutationKey: ["org", "invite-member"] as const,
  mutationFn: async ({
    email,
    role,
    organizationId,
  }: {
    email: string;
    role: "owner" | "admin" | "member";
    organizationId?: string;
  }) => {
    const { error } = await authClient.organization.inviteMember({
      email,
      role,
      ...(organizationId ? { organizationId } : {}),
    });
    if (error) throw error;
  },
});
