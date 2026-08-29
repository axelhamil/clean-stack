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
    <EmailLayout preview={t("subjects.deleteCancelled")}>
      <Heading as="h1">Account deletion cancelled</Heading>
      <Text>
        Hi {name}, your account deletion request has been cancelled. Your account remains active.
      </Text>
    </EmailLayout>
  );
}
