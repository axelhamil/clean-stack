import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const leaveOrgMutationOptions = mutationOptions({
  mutationKey: ["org", "leave"] as const,
  mutationFn: async ({ organizationId }: { organizationId: string }) => {
    const { error } = await authClient.organization.leave({ organizationId });
    if (error) throw error;
  },
});
