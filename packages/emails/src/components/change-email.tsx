import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type ChangeEmailVars = EmailTemplates["change_email"];
interface ChangeEmailProps extends ChangeEmailVars {
  t: TFunction<"emails">;
}

export function ChangeEmail({ name, newEmail, confirmUrl, t }: ChangeEmailProps) {
  return (
    <EmailLayout preview={t("subjects.changeEmail")} t={t}>
      <Heading as="h1">{t("changeEmail.heading")}</Heading>
      <Text>{t("changeEmail.body", { name, newEmail })}</Text>
      <Button href={confirmUrl}>{t("changeEmail.cta")}</Button>
      <Text>{confirmUrl}</Text>
    </EmailLayout>
  );
}
