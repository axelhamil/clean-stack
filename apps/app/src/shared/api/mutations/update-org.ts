import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const updateOrgMutationOptions = mutationOptions({
  mutationKey: ["org", "update"] as const,
  mutationFn: async ({ organizationId, name }: { organizationId: string; name?: string }) => {
    const { error } = await authClient.organization.update({
      organizationId,
      data: { name },
    });
    if (error) throw error;
  },
});
