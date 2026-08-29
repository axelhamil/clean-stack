import { createI18n, DEFAULT_LOCALE, type Locale, loadCatalog } from "@packages/i18n";
import { render } from "@react-email/render";
import type { TFunction } from "i18next";
import type { ComponentType } from "react";
import { I18nextProvider } from "react-i18next";
import { ApiTokenLeaked } from "./components/api-token-leaked";
import { BackupCodeUsed } from "./components/backup-code-used";
import { ChangeEmail } from "./components/change-email";
import { DataExportReady } from "./components/data-export-ready";
import { DeleteCancelled } from "./components/delete-cancelled";
import { DeleteCompleted } from "./components/delete-completed";
import { DeleteRequested } from "./components/delete-requested";
import { ImpersonationStarted } from "./components/impersonation-started";
import { MagicLink } from "./components/magic-link";
import { NotificationDigest } from "./components/notification-digest";
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
  component: ComponentType<EmailTemplates[K] & { t: TFunction<"emails"> }>;
  subject: (t: TFunction<"emails">, variables: EmailTemplates[K]) => string;
};

const TEMPLATES: { [K in EmailTemplateKey]: TemplateEntry<K> } = {
  verify_email: { component: VerifyEmail, subject: (t) => t("subjects.verifyEmail") },
  reset_password: { component: ResetPassword, subject: (t) => t("subjects.resetPassword") },
  magic_link: { component: MagicLink, subject: (t) => t("subjects.magicLink") },
  org_invitation: {
    component: OrgInvitation,
    subject: (t, v) => t("subjects.orgInvitation", { orgName: v.orgName }),
  },
  data_export_ready: { component: DataExportReady, subject: (t) => t("subjects.dataExportReady") },
  delete_requested: { component: DeleteRequested, subject: (t) => t("subjects.deleteRequested") },
  delete_cancelled: { component: DeleteCancelled, subject: (t) => t("subjects.deleteCancelled") },
  delete_completed: { component: DeleteCompleted, subject: (t) => t("subjects.deleteCompleted") },
  change_email: { component: ChangeEmail, subject: (t) => t("subjects.changeEmail") },
  backup_code_used: { component: BackupCodeUsed, subject: (t) => t("subjects.backupCodeUsed") },
  impersonation_started: {
    component: ImpersonationStarted,
    subject: (t) => t("subjects.impersonationStarted"),
  },
  api_token_leaked: { component: ApiTokenLeaked, subject: (t) => t("subjects.apiTokenLeaked") },
  notification_digest: {
    component: NotificationDigest,
    subject: (t, v) =>
      t("subjects.notificationDigest", {
        count: Number(v.itemCount),
        category: v.category,
      }),
  },
};

export const EMAIL_TEMPLATE_KEYS = Object.keys(TEMPLATES) as EmailTemplateKey[];

export async function renderTemplate<K extends EmailTemplateKey>(
  key: K,
  variables: EmailTemplates[K],
  locale: Locale = DEFAULT_LOCALE,
): Promise<RenderedEmail> {
  const resources = await loadCatalog(locale);
  const i18n = await createI18n({ locale, resources });
  const t = i18n.getFixedT(locale, "emails");

  const entry = TEMPLATES[key];
  const Component = entry.component as unknown as ComponentType<Record<string, unknown>>;
  // `<Trans>` resolves its interpolation through the i18next instance in
  // context, never through the `t` prop alone; the provider is what keeps that
  // resolution bound to *this* render's instance rather than a process-wide
  // singleton the next recipient would mutate.
  const element = (
    <I18nextProvider i18n={i18n}>
      <Component {...variables} t={t} />
    </I18nextProvider>
  );
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: entry.subject(t, variables), html, text };
}
