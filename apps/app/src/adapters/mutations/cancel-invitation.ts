import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

export const cancelInvitationMutationOptions = mutationOptions({
  mutationKey: ["org", "cancel-invitation"] as const,
  mutationFn: async ({ invitationId }: { invitationId: string }) => {
    const { error } = await authClient.organization.cancelInvitation({ invitationId });
    if (error) throw error;
  },
});
