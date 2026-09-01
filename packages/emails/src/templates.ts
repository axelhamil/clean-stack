import type { TFunction } from "i18next";

export type EmailTemplates = {
  verify_email: { name: string; verifyUrl: string };
  reset_password: { name: string; resetUrl: string };
  magic_link: { magicUrl: string };
  org_invitation: { inviterName: string; orgName: string; role: string; inviteUrl: string };
  data_export_ready: { name: string; downloadUrl: string; expiresAt: string };
  delete_requested: { name: string; cancelUrl: string; expiresAt: string };
  delete_cancelled: { name: string };
  delete_completed: { name: string };
  change_email: { name: string; newEmail: string; confirmUrl: string };
  backup_code_used: { securityUrl: string };
  impersonation_started: {
    userName: string;
    startedAt: string;
    expiresAt: string;
    reason: string;
    supportUrl: string;
  };
  api_token_leaked: {
    name: string;
    tokenName: string;
    revokedAt: string;
  };
  notification_digest: {
    category: string;
    itemCount: string;
    itemsSummary: string;
  };
};

export type EmailTemplateKey = keyof EmailTemplates;

/**
 * Props of the React component rendering template `K`: its declared variables
 * plus the bound `emails` translator.
 *
 * Every template needs exactly this shape, so deriving it keeps the variable
 * contract in one place — adding a variable to `EmailTemplates` immediately
 * type-checks against its component, instead of drifting behind a hand-written
 * copy of the same members.
 */
export type EmailProps<K extends EmailTemplateKey> = EmailTemplates[K] & {
  t: TFunction<"emails">;
};
