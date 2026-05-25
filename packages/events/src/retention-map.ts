import { type EventType, EventTypes } from "./event-types";

export type RetentionPolicy = "operational" | "compliance" | "none";

export const RETENTION_MAP: Record<EventType, RetentionPolicy> = {
  [EventTypes.USER_CREATED]: "compliance",
  [EventTypes.USER_SIGNED_IN]: "compliance",
  [EventTypes.USER_SIGNED_OUT]: "compliance",
  [EventTypes.USER_EMAIL_VERIFIED]: "compliance",
  [EventTypes.USER_PASSWORD_RESET_REQUESTED]: "compliance",
  [EventTypes.USER_PASSWORD_CHANGED]: "compliance",
  [EventTypes.USER_MAGIC_LINK_REQUESTED]: "compliance",
  [EventTypes.USER_MFA_ENABLED]: "compliance",
  [EventTypes.USER_MFA_DISABLED]: "compliance",
  [EventTypes.USER_PASSKEY_ADDED]: "compliance",
  [EventTypes.USER_PASSKEY_REMOVED]: "compliance",
  [EventTypes.USER_ACCOUNT_LINKED]: "compliance",
  [EventTypes.USER_ACCOUNT_UNLINKED]: "compliance",
  [EventTypes.USER_DELETION_REQUESTED]: "compliance",
  [EventTypes.USER_DELETION_CANCELLED]: "compliance",
  [EventTypes.USER_DELETED]: "compliance",
  [EventTypes.USER_EXPORT_REQUESTED]: "compliance",
  [EventTypes.USER_EXPORT_COMPLETED]: "compliance",
  [EventTypes.ORG_CREATED]: "compliance",
  [EventTypes.ORG_UPDATED]: "compliance",
  [EventTypes.ORG_DELETED]: "compliance",
  [EventTypes.ORG_MEMBER_INVITED]: "compliance",
  [EventTypes.ORG_MEMBER_JOINED]: "compliance",
  [EventTypes.ORG_INVITATION_CANCELLED]: "compliance",
  [EventTypes.ORG_MEMBER_REMOVED]: "compliance",
  [EventTypes.ORG_MEMBER_ROLE_CHANGED]: "compliance",
  [EventTypes.UPLOAD_REQUESTED]: "compliance",
  [EventTypes.UPLOAD_CONFIRMED]: "compliance",
  [EventTypes.UPLOAD_DELETED]: "compliance",
  [EventTypes.WEBHOOK_ENDPOINT_CREATED]: "compliance",
  [EventTypes.WEBHOOK_ENDPOINT_UPDATED]: "compliance",
  [EventTypes.WEBHOOK_ENDPOINT_DELETED]: "compliance",
};

export function retentionFor(eventType: string): RetentionPolicy {
  return (RETENTION_MAP as Record<string, RetentionPolicy | undefined>)[eventType] ?? "none";
}
