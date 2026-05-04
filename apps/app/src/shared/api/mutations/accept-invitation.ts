import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const acceptInvitationMutationOptions = mutationOptions({
  mutationKey: ["org", "accept-invitation"] as const,
  mutationFn: async ({ invitationId }: { invitationId: string }): Promise<void> => {
    const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) throw error;

    const payload = data as {
      invitation?: { organizationId?: string };
      organizationId?: string;
    } | null;
    const organizationId = payload?.invitation?.organizationId ?? payload?.organizationId ?? null;

    if (organizationId) {
      const { error: setActiveError } = await authClient.organization.setActive({
        organizationId,
      });
      if (setActiveError) throw setActiveError;
    }
  },
});
