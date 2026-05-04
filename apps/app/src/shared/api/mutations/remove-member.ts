import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const removeMemberMutationOptions = mutationOptions({
  mutationKey: ["org", "remove-member"] as const,
  mutationFn: async ({
    memberIdOrEmail,
    organizationId,
  }: {
    memberIdOrEmail: string;
    organizationId?: string;
  }) => {
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail,
      ...(organizationId ? { organizationId } : {}),
    });
    if (error) throw error;
  },
});
