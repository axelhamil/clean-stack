import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function ChangeEmail({ name, newEmail, confirmUrl, t }: EmailProps<"change_email">) {
  return (
    <EmailLayout preview={t("subjects.changeEmail")} t={t}>
      <Heading as="h1">{t("changeEmail.heading")}</Heading>
      <Text>{t("changeEmail.body", { name, newEmail })}</Text>
      <Button href={confirmUrl}>{t("changeEmail.cta")}</Button>
      <Text>{confirmUrl}</Text>
    </EmailLayout>
  );
}
