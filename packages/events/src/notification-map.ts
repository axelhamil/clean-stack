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
  forced?: boolean;
  groupBy?: "actor" | "resource";
  dedupWindow?: "hour" | "day";
};

const _map = {
  "user.password_changed": { audience: "self", category: "security", forced: true },
  "user.mfa.enabled": { audience: "self", category: "security", forced: true },
  "user.mfa.disabled": { audience: "self", category: "security", forced: true },
  "user.mfa.backup_code_used": { audience: "self", category: "security", forced: true },
  "user.passkey.added": { audience: "self", category: "security", forced: true },
  "user.passkey.removed": { audience: "self", category: "security", forced: true },
  "user.email.change_requested": { audience: "self", category: "security", forced: true },
  "user.export.completed": { audience: "self", category: "activity" },
  "user.deletion.requested": { audience: "self", category: "security", forced: true },
  "user.deletion.cancelled": { audience: "self", category: "security", forced: true },
  "org.member.joined": {
    audience: { can: { organization: ["update"] } },
    category: "org",
    groupBy: "resource",
  },
  "org.member.removed": { audience: { can: { organization: ["update"] } }, category: "org" },
  "org.member.role_changed": { audience: "self", category: "org" },
  "org.member.invited": { audience: { can: { organization: ["update"] } }, category: "org" },
  "billing.payment.failed": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    forced: true,
  },
  "billing.subscription.created": { audience: { can: { billing: ["read"] } }, category: "billing" },
  "billing.subscription.updated": { audience: { can: { billing: ["read"] } }, category: "billing" },
  "billing.subscription.cancelled": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    forced: true,
  },
  "billing.quota.exceeded": {
    audience: { can: { billing: ["read"] } },
    category: "billing",
    dedupWindow: "day",
  },
  "webhook.endpoint.disabled": {
    audience: { can: { webhooks: ["read"] } },
    category: "activity",
  },
  "api_token.created": { audience: "self", category: "security", forced: true },
} as const satisfies Partial<Record<EventType, NotificationConfig>>;

export const NOTIFICATION_MAP: Partial<Record<EventType, NotificationConfig>> = _map;

export function notificationConfigOf(eventType: string): NotificationConfig | undefined {
  return (NOTIFICATION_MAP as Record<string, NotificationConfig>)[eventType];
}

export function isNotifiable(eventType: string): boolean {
  return notificationConfigOf(eventType) !== undefined;
}

export type ForcedLevel = "all" | "some" | "none";

export function forcedLevelOf(category: NotificationCategory): ForcedLevel {
  const configs = Object.values(_map).filter((config) => config.category === category);
  if (configs.length === 0) return "none";

  const forced = configs.filter((config) => "forced" in config && config.forced).length;
  if (forced === configs.length) return "all";
  return forced > 0 ? "some" : "none";
}
