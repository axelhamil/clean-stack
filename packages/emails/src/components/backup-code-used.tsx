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
    <EmailLayout preview={t("subjects.backupCodeUsed")}>
      <Heading as="h1">A backup code was used</Heading>
      <Text>
        A backup two-factor authentication code was just used to sign in to your account. If this
        was not you, review your account security immediately.
      </Text>
      <Button href={securityUrl}>Review security settings</Button>
      <Text>{securityUrl}</Text>
    </EmailLayout>
  );
}
