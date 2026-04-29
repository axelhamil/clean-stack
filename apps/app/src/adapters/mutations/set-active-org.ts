import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const setActiveOrgMutationOptions = mutationOptions({
  mutationKey: ["org", "set-active"] as const,
  mutationFn: async ({ organizationId }: { organizationId: string }) => {
    const { error } = await authClient.organization.setActive({ organizationId });
    if (error) throw error;
  },
});
