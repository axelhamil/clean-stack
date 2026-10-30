import type { OrgRole } from "@packages/access-control";
import { type EventType, EventTypes } from "@packages/events";

export function authorizeSubscriptionReference(role: OrgRole | undefined): boolean {
  return role === "owner";
}

const BILLING_ACTIONS: readonly string[] = [
  "upgrade-subscription",
  "cancel-subscription",
  "restore-subscription",
  "billing-portal",
];

export function authorizeSubscriptionAction(action: string, role: OrgRole | undefined): boolean {
  if (action === "list-subscription") return role !== undefined;
  if (BILLING_ACTIONS.includes(action)) return authorizeSubscriptionReference(role);

  return false;
}

export function subscriptionEventType(status: string): EventType {
  if (status === "canceled" || status === "incomplete_expired" || status === "unpaid") {
    return EventTypes.BILLING_SUBSCRIPTION_CANCELLED;
  }
  return EventTypes.BILLING_SUBSCRIPTION_UPDATED;
}
