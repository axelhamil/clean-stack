import type { TFunction } from "i18next";
import { Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DeleteCompletedVars = EmailTemplates["delete_completed"];
interface DeleteCompletedProps extends DeleteCompletedVars {
  t: TFunction<"emails">;
}

export function DeleteCompleted({ name, t }: DeleteCompletedProps) {
  return (
    <EmailLayout preview={t("subjects.deleteCompleted")}>
      <Heading as="h1">Your account has been deleted</Heading>
      <Text>Hi {name}, your account and all associated data have been permanently deleted.</Text>
    </EmailLayout>
  );
}
