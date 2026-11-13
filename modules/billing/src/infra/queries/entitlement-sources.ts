import type { IPlanOverrideReader } from "../../application/ports/repositories/plan-override.port";
import type { ISubscriptionReadStore } from "../../application/ports/repositories/subscription-read.port";

export function readEntitlementSources(
  overrides: IPlanOverrideReader,
  subscriptions: ISubscriptionReadStore,
  organizationId: string,
) {
  return Promise.all([
    overrides.findActive(organizationId),
    subscriptions.findActiveByReference(organizationId),
    subscriptions.findCustomerIdByReference(organizationId),
  ]);
}
