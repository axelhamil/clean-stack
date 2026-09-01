import type { OrgPermissions } from "@packages/access-control";
import type { EventType } from "./event-types";

export type Audience = "self" | "actor" | "org:all" | { can: OrgPermissions };

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_FREQUENCIES = ["immediate", "hourly", "daily"] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

export const NOTIFICATION_PREFERENCE_SCOPES = ["user", "org"] as const;
export type NotificationPreferenceScope = (typeof NOTIFICATION_PREFERENCE_SCOPES)[number];

export const NOTIFICATION_CATEGORIES = ["security", "org", "billing", "activity"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationConfig = {
  audience: Audience;
  category: NotificationCategory;
  /**
   * The event-payload fields this notification may carry to the browser.
   *
   * Required, and empty is a valid answer: what crosses to the client is
   * chosen, never inherited. A notification stores the whole event payload,
   * and event payloads legitimately carry internal handles — invitation
   * tokens, storage keys, subscription and invoice ids. Without a list here,
   * every field added to a payload tomorrow would ship to the recipient's
   * browser by default, silently and forever.
   */
  payloadFields: readonly string[];
  forced?: boolean;
  groupBy?: "actor" | "resource";
  dedupWindow?: "hour" | "day";
};

const _map = {
  "user.password_changed": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: [],
  },
  "user.mfa.enabled": { audience: "self", category: "security", forced: true, payloadFields: [] },
  "user.mfa.disabled": { audience: "self", category: "security", forced: true, payloadFields: [] },
  "user.mfa.backup_code_used": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: [],
  },
  "user.passkey.added": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: ["deviceType"],
  },
  "user.passkey.removed": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: [],
  },
  "user.email.change_requested": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: ["newEmail"],
  },
  // `storageKey` stays server-side: the download goes through a presigned URL.
  "user.export.completed": { audience: "self", category: "activity", payloadFields: ["expiresAt"] },
  "user.deletion.requested": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: ["pendingDeletionUntil"],
  },
  "user.deletion.cancelled": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: [],
  },
  "org.member.joined": {
    audience: { can: { organization: ["update"] } },
    category: "org",
    groupBy: "resource",
    payloadFields: ["role"],
  },
  "org.member.removed": {
    audience: { can: { organization: ["update"] } },
    category: "org",
    payloadFields: [],
  },
  "org.member.role_changed": {
    audience: "self",
    category: "org",
    payloadFields: ["previousRole", "newRole"],
  },
  // `invitationId` is the acceptance token: it must never reach a bystander.
  "org.member.invited": {
    audience: { can: { organization: ["update"] } },
    category: "org",
    payloadFields: ["email", "role"],
  },
  "billing.payment.failed": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    forced: true,
    payloadFields: [],
  },
  "billing.subscription.created": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    payloadFields: ["tier", "status"],
  },
  "billing.subscription.updated": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    payloadFields: ["tier", "status"],
  },
  "billing.subscription.cancelled": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    forced: true,
    payloadFields: ["tier", "status"],
  },
  "billing.quota.exceeded": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    dedupWindow: "day",
    payloadFields: ["resource", "limit", "attempted", "tier"],
  },
  "webhook.endpoint.disabled": {
    audience: { can: { webhooks: ["read"] } },
    category: "activity",
    payloadFields: ["reason", "consecutiveFailures"],
  },
  "api_token.created": {
    audience: "self",
    category: "security",
    forced: true,
    payloadFields: ["name"],
  },
} as const satisfies Partial<Record<EventType, NotificationConfig>>;

export const NOTIFICATION_MAP: Partial<Record<EventType, NotificationConfig>> = _map;

export function notificationConfigOf(eventType: string): NotificationConfig | undefined {
  return (NOTIFICATION_MAP as Record<string, NotificationConfig>)[eventType];
}

export function isNotifiable(eventType: string): boolean {
  return notificationConfigOf(eventType) !== undefined;
}

/**
 * Narrows a stored notification payload to the fields its event declares as
 * client-visible. An unknown event type yields `{}` — a build that does not
 * know what a payload contains has no basis for forwarding any of it.
 */
export function publicNotificationPayload(
  eventType: string,
  payload: unknown,
): Record<string, unknown> {
  const config = notificationConfigOf(eventType);
  if (!config || typeof payload !== "object" || payload === null) return {};
  const source = payload as Record<string, unknown>;
  const visible: Record<string, unknown> = {};
  for (const field of config.payloadFields) {
    if (field in source) visible[field] = source[field];
  }
  return visible;
}

export type ForcedLevel = "all" | "some" | "none";

export function forcedLevelOf(category: NotificationCategory): ForcedLevel {
  const configs = Object.values(_map).filter((config) => config.category === category);
  if (configs.length === 0) return "none";

  const forced = configs.filter((config) => "forced" in config && config.forced).length;
  if (forced === configs.length) return "all";
  return forced > 0 ? "some" : "none";
}
