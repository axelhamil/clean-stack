import type { TFunction } from "i18next";
import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DeleteRequestedVars = EmailTemplates["delete_requested"];
interface DeleteRequestedProps extends DeleteRequestedVars {
  t: TFunction<"emails">;
}

export function DeleteRequested({ name, cancelUrl, expiresAt, t }: DeleteRequestedProps) {
  return (
    <EmailLayout preview={t("subjects.deleteRequested")} t={t}>
      <Heading as="h1">{t("deleteRequested.heading")}</Heading>
      <Text>{t("deleteRequested.body", { name, expiresAt })}</Text>
      <Button href={cancelUrl}>{t("deleteRequested.cta")}</Button>
      <Text>{cancelUrl}</Text>
    </EmailLayout>
  );
}
