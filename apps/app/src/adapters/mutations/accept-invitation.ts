import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const acceptInvitationMutationOptions = mutationOptions({
  mutationKey: ["org", "accept-invitation"] as const,
  mutationFn: async ({ invitationId }: { invitationId: string }) => {
    const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) throw error;
    return data;
  },
});
