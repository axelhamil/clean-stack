import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const updateOrgMutationOptions = mutationOptions({
  mutationKey: ["org", "update"] as const,
  mutationFn: async ({
    organizationId,
    name,
    slug,
  }: {
    organizationId: string;
    name?: string;
    slug?: string;
  }) => {
    const { error } = await authClient.organization.update({
      organizationId,
      data: { name, slug },
    });
    if (error) throw error;
  },
});
