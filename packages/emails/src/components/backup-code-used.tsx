import { Button, Heading, Text } from "@react-email/components";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

export function BackupCodeUsed({ securityUrl }: EmailTemplates["backup_code_used"]) {
  return (
    <EmailLayout preview="A backup code was used">
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
