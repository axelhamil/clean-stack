export const EventTypes = {
  USER_CREATED: "user.created",
  USER_SIGNED_IN: "user.signed_in",
  USER_SIGNED_OUT: "user.signed_out",
  USER_EMAIL_VERIFIED: "user.email_verified",
  USER_PASSWORD_RESET_REQUESTED: "user.password_reset.requested",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_MAGIC_LINK_REQUESTED: "user.magic_link.requested",
  USER_MFA_ENABLED: "user.mfa.enabled",
  USER_MFA_DISABLED: "user.mfa.disabled",
  USER_PASSKEY_ADDED: "user.passkey.added",
  USER_PASSKEY_REMOVED: "user.passkey.removed",
  USER_ACCOUNT_LINKED: "user.account.linked",
  USER_ACCOUNT_UNLINKED: "user.account.unlinked",
  USER_DELETION_REQUESTED: "user.deletion.requested",
  USER_DELETION_CANCELLED: "user.deletion.cancelled",
  USER_DELETED: "user.deleted",
  USER_EXPORT_REQUESTED: "user.export.requested",
  USER_EXPORT_COMPLETED: "user.export.completed",
  ORG_CREATED: "org.created",
  ORG_UPDATED: "org.updated",
  ORG_DELETED: "org.deleted",
  ORG_MEMBER_INVITED: "org.member.invited",
  ORG_MEMBER_JOINED: "org.member.joined",
  ORG_INVITATION_CANCELLED: "org.invitation.cancelled",
  ORG_MEMBER_REMOVED: "org.member.removed",
  ORG_MEMBER_ROLE_CHANGED: "org.member.role_changed",
  UPLOAD_REQUESTED: "upload.requested",
  UPLOAD_CONFIRMED: "upload.confirmed",
  UPLOAD_DELETED: "upload.deleted",
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const ALL_EVENT_TYPES: readonly EventType[] = Object.values(EventTypes);

export function isKnownEventType(value: string): value is EventType {
  return ALL_EVENT_TYPES.includes(value as EventType);
}
