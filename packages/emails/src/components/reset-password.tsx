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
    <EmailLayout preview={t("subjects.resetPassword")} t={t}>
      <Heading as="h1">{t("resetPassword.heading")}</Heading>
      <Text>{t("resetPassword.body", { name })}</Text>
      <Button href={resetUrl}>{t("resetPassword.cta")}</Button>
      <Text>{resetUrl}</Text>
    </EmailLayout>
  );
}
