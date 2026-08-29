import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function ResetPassword({ name, resetUrl, t }: EmailProps<"reset_password">) {
  return (
    <EmailLayout preview={t("subjects.resetPassword")} t={t}>
      <Heading as="h1">{t("resetPassword.heading")}</Heading>
      <Text>{t("resetPassword.body", { name })}</Text>
      <Button href={resetUrl}>{t("resetPassword.cta")}</Button>
      <Text>{resetUrl}</Text>
    </EmailLayout>
  );
}
