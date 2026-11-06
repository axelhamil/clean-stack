import { mutationOptions } from "@tanstack/react-query";
import { z } from "zod";
import { authClient } from "../../auth/auth-client";

const acceptedInvitationSchema = z.object({
  invitation: z.object({ organizationId: z.string() }).partial().optional(),
  organizationId: z.string().optional(),
});

function acceptedOrganizationId(data: unknown): string | null {
  const parsed = acceptedInvitationSchema.safeParse(data);
  if (!parsed.success) return null;

  return parsed.data.invitation?.organizationId ?? parsed.data.organizationId ?? null;
}

export const acceptInvitationMutationOptions = mutationOptions({
  mutationKey: ["org", "accept-invitation"] as const,
  mutationFn: async ({ invitationId }: { invitationId: string }): Promise<void> => {
    const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) throw error;

    const organizationId = acceptedOrganizationId(data);

    if (organizationId) {
      const { error: setActiveError } = await authClient.organization.setActive({
        organizationId,
      });
      if (setActiveError) throw setActiveError;
    }
  },
});
