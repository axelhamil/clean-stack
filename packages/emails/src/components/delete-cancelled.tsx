import type { TFunction } from "i18next";
import { Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DeleteCancelledVars = EmailTemplates["delete_cancelled"];
interface DeleteCancelledProps extends DeleteCancelledVars {
  t: TFunction<"emails">;
}

export function DeleteCancelled({ name, t }: DeleteCancelledProps) {
  return (
    <EmailLayout preview={t("subjects.deleteCancelled")} t={t}>
      <Heading as="h1">{t("deleteCancelled.heading")}</Heading>
      <Text>{t("deleteCancelled.body", { name })}</Text>
    </EmailLayout>
  );
}
