import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const createOrgMutationOptions = mutationOptions({
  mutationKey: ["org", "create"] as const,
  mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
    const { data, error } = await authClient.organization.create({ name, slug });
    if (error) throw error;
    if (!data) throw new Error("Organization create returned no data");
    return data;
  },
});
