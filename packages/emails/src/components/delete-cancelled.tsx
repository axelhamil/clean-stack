import { Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function DeleteCancelled({ name, t }: EmailProps<"delete_cancelled">) {
  return (
    <EmailLayout preview={t("subjects.deleteCancelled")} t={t}>
      <Heading as="h1">{t("deleteCancelled.heading")}</Heading>
      <Text>{t("deleteCancelled.body", { name })}</Text>
    </EmailLayout>
  );
}
