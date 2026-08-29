import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function ImpersonationStarted({
  userName,
  startedAt,
  expiresAt,
  reason,
  supportUrl,
  t,
}: EmailProps<"impersonation_started">) {
  return (
    <EmailLayout preview={t("subjects.impersonationStarted")} t={t}>
      <Heading as="h1">{t("impersonationStarted.heading")}</Heading>
      <Text>{t("impersonationStarted.body", { userName, startedAt, expiresAt })}</Text>
      <Text>{t("impersonationStarted.reason", { reason })}</Text>
      <Text>{t("impersonationStarted.scope")}</Text>
      <Text>{t("impersonationStarted.concerns")}</Text>
      <Button href={supportUrl}>{t("impersonationStarted.cta")}</Button>
      <Text>{supportUrl}</Text>
    </EmailLayout>
  );
}
