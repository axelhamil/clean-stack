import type { OrgRole } from "@packages/access-control";
import { type EventType, EventTypes } from "@packages/events";

export function authorizeSubscriptionReference(role: OrgRole | undefined): boolean {
  return role === "owner";
}

export function subscriptionEventType(status: string): EventType {
  if (status === "canceled" || status === "incomplete_expired" || status === "unpaid") {
    return EventTypes.BILLING_SUBSCRIPTION_CANCELLED;
  }
  return EventTypes.BILLING_SUBSCRIPTION_UPDATED;
}
