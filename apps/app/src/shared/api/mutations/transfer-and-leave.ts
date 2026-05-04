import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const transferAndLeaveMutationOptions = mutationOptions({
  mutationKey: ["org", "transfer-and-leave"] as const,
  mutationFn: async ({
    organizationId,
    newOwnerMemberId,
  }: {
    organizationId: string;
    newOwnerMemberId: string;
  }) => {
    const transfer = await authClient.organization.updateMemberRole({
      memberId: newOwnerMemberId,
      role: "owner",
      organizationId,
    });
    if (transfer.error) throw transfer.error;
    const leave = await authClient.organization.leave({ organizationId });
    if (leave.error) throw leave.error;
  },
});
