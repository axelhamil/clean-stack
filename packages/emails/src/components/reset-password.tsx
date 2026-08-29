import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type ResetPasswordVars = EmailTemplates["reset_password"];
interface ResetPasswordProps extends ResetPasswordVars {
  t: TFunction<"emails">;
}

export function ResetPassword({ name, resetUrl, t }: ResetPasswordProps) {
  return (
    <EmailLayout preview={t("subjects.resetPassword")}>
      <Heading as="h1">Reset your password</Heading>
      <Text>
        Hi {name}, click the button below to reset your password. The link expires in 1 hour.
      </Text>
      <Button href={resetUrl}>Reset password</Button>
      <Text>{resetUrl}</Text>
    </EmailLayout>
  );
}
