import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type VerifyEmailVars = EmailTemplates["verify_email"];
interface VerifyEmailProps extends VerifyEmailVars {
  t: TFunction<"emails">;
}

export function VerifyEmail({ name, verifyUrl, t }: VerifyEmailProps) {
  return (
    <EmailLayout preview={t("subjects.verifyEmail")}>
      <Heading as="h1">{t("verifyEmail.heading")}</Heading>
      <Text>{t("verifyEmail.body", { name })}</Text>
      <Button href={verifyUrl}>{t("verifyEmail.cta")}</Button>
      <Text>{verifyUrl}</Text>
    </EmailLayout>
  );
}
