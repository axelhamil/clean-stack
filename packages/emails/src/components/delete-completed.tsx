import { Heading, Text } from "react-email";
import type { EmailProps } from "../templates";
import { EmailLayout } from "./layout";

export function DeleteCompleted({ name, t }: EmailProps<"delete_completed">) {
  return (
    <EmailLayout preview={t("subjects.deleteCompleted")} t={t}>
      <Heading as="h1">{t("deleteCompleted.heading")}</Heading>
      <Text>{t("deleteCompleted.body", { name })}</Text>
    </EmailLayout>
  );
}
