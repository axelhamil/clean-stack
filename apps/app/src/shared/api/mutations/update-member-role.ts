import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const updateMemberRoleMutationOptions = mutationOptions({
  mutationKey: ["org", "update-member-role"] as const,
  mutationFn: async ({
    memberId,
    role,
    organizationId,
  }: {
    memberId: string;
    role: "owner" | "admin" | "member";
    organizationId?: string;
  }) => {
    const { error } = await authClient.organization.updateMemberRole({
      memberId,
      role,
      ...(organizationId ? { organizationId } : {}),
    });
    if (error) throw error;
  },
});
