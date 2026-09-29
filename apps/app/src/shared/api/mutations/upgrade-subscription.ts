import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { errorFallback } from "../../i18n/get-errors-t";
import { toAuthClientError } from "../errors/api-error";

export interface UpgradeInput {
  tier: string;
  organizationId: string;
}

interface SubscriptionUpgradeArgs {
  plan: string;
  referenceId: string;
  successUrl: string;
  cancelUrl: string;
}

interface SubscriptionActions {
  upgrade: (
    args: SubscriptionUpgradeArgs,
  ) => Promise<{ error: { code?: string; status?: number; message?: string } | null }>;
}

export const upgradeSubscriptionMutationOptions = mutationOptions({
  mutationKey: ["billing", "upgrade"] as const,
  mutationFn: async ({ tier, organizationId }: UpgradeInput) => {
    const subscription = (authClient as unknown as { subscription: SubscriptionActions })
      .subscription;
    const { error } = await subscription.upgrade({
      plan: tier,
      referenceId: organizationId,
      successUrl: `${window.location.origin}/settings/billing?upgraded=1`,
      cancelUrl: `${window.location.origin}/settings/billing`,
    });
    if (error) throw toAuthClientError(error, errorFallback("upgradeSubscription"));
  },
});
