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
