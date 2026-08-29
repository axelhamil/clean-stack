import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type BackupCodeUsedVars = EmailTemplates["backup_code_used"];
interface BackupCodeUsedProps extends BackupCodeUsedVars {
  t: TFunction<"emails">;
}

export function BackupCodeUsed({ securityUrl, t }: BackupCodeUsedProps) {
  return (
    <EmailLayout preview={t("subjects.backupCodeUsed")} t={t}>
      <Heading as="h1">{t("backupCodeUsed.heading")}</Heading>
      <Text>{t("backupCodeUsed.body")}</Text>
      <Button href={securityUrl}>{t("backupCodeUsed.cta")}</Button>
      <Text>{securityUrl}</Text>
    </EmailLayout>
  );
}
