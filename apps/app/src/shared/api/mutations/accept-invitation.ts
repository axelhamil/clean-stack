import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const acceptInvitationMutationOptions = mutationOptions({
  mutationKey: ["org", "accept-invitation"] as const,
  mutationFn: async ({ invitationId }: { invitationId: string }): Promise<void> => {
    const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) throw error;

    const organizationId = data?.invitation.organizationId ?? null;

    if (organizationId) {
      const { error: setActiveError } = await authClient.organization.setActive({
        organizationId,
      });
      if (setActiveError) throw setActiveError;
    }
  },
});
