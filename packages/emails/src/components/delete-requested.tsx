import { Button, Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function DeleteRequested({ name, cancelUrl, expiresAt, t }: EmailProps<"delete_requested">) {
  return (
    <EmailLayout preview={t("subjects.deleteRequested")} t={t}>
      <Heading as="h1">{t("deleteRequested.heading")}</Heading>
      <Text>{t("deleteRequested.body", { name, expiresAt })}</Text>
      <Button href={cancelUrl}>{t("deleteRequested.cta")}</Button>
      <Text>{cancelUrl}</Text>
    </EmailLayout>
  );
}
