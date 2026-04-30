import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const deleteOrgMutationOptions = mutationOptions({
  mutationKey: ["org", "delete"] as const,
  mutationFn: async ({ organizationId }: { organizationId: string }) => {
    const { error } = await authClient.organization.delete({ organizationId });
    if (error) throw error;
  },
});
