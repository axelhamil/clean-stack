import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function VerifyEmail({ name, verifyUrl, t }: EmailProps<"verify_email">) {
  return (
    <EmailLayout preview={t("subjects.verifyEmail")} t={t}>
      <Heading as="h1">{t("verifyEmail.heading")}</Heading>
      <Text>{t("verifyEmail.body", { name })}</Text>
      <Button href={verifyUrl}>{t("verifyEmail.cta")}</Button>
      <Text>{verifyUrl}</Text>
    </EmailLayout>
  );
}
