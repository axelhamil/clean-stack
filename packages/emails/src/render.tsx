import { render } from "@react-email/render";
import type { ComponentType } from "react";
import { BackupCodeUsed } from "./components/backup-code-used";
import { ChangeEmail } from "./components/change-email";
import { DataExportReady } from "./components/data-export-ready";
import { DeleteCancelled } from "./components/delete-cancelled";
import { DeleteCompleted } from "./components/delete-completed";
import { DeleteRequested } from "./components/delete-requested";
import { MagicLink } from "./components/magic-link";
import { OrgInvitation } from "./components/org-invitation";
import { ResetPassword } from "./components/reset-password";
import { VerifyEmail } from "./components/verify-email";
import type { EmailTemplateKey, EmailTemplates } from "./templates";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type TemplateEntry<K extends EmailTemplateKey> = {
  component: ComponentType<EmailTemplates[K]>;
  subject: (variables: EmailTemplates[K]) => string;
};

const TEMPLATES: { [K in EmailTemplateKey]: TemplateEntry<K> } = {
  verify_email: { component: VerifyEmail, subject: () => "Confirm your email address" },
  reset_password: { component: ResetPassword, subject: () => "Reset your password" },
  magic_link: { component: MagicLink, subject: () => "Your sign-in link" },
  org_invitation: {
    component: OrgInvitation,
    subject: (v) => `You have been invited to ${v.orgName}`,
  },
  data_export_ready: { component: DataExportReady, subject: () => "Your data export is ready" },
  delete_requested: { component: DeleteRequested, subject: () => "Account deletion requested" },
  delete_cancelled: { component: DeleteCancelled, subject: () => "Account deletion cancelled" },
  delete_completed: { component: DeleteCompleted, subject: () => "Your account has been deleted" },
  change_email: { component: ChangeEmail, subject: () => "Confirm your new email address" },
  backup_code_used: { component: BackupCodeUsed, subject: () => "A backup code was used" },
};

export const EMAIL_TEMPLATE_KEYS = Object.keys(TEMPLATES) as EmailTemplateKey[];

export async function renderTemplate<K extends EmailTemplateKey>(
  key: K,
  variables: EmailTemplates[K],
): Promise<RenderedEmail> {
  const entry = TEMPLATES[key];
  const Component = entry.component;
  const element = <Component {...variables} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: entry.subject(variables), html, text };
}
