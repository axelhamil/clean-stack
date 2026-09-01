import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function BackupCodeUsed({ securityUrl, t }: EmailProps<"backup_code_used">) {
  return (
    <EmailLayout preview={t("subjects.backupCodeUsed")} t={t}>
      <Heading as="h1">{t("backupCodeUsed.heading")}</Heading>
      <Text>{t("backupCodeUsed.body")}</Text>
      <Button href={securityUrl}>{t("backupCodeUsed.cta")}</Button>
      <Text>{securityUrl}</Text>
    </EmailLayout>
  );
}
