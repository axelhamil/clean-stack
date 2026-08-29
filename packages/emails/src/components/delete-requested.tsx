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
    <EmailLayout preview={t("subjects.deleteRequested")}>
      <Heading as="h1">Account deletion requested</Heading>
      <Text>
        Hi {name}, we received a request to delete your account. The deletion will be processed on{" "}
        {expiresAt}. If this was not you, cancel now.
      </Text>
      <Button href={cancelUrl}>Cancel deletion</Button>
      <Text>{cancelUrl}</Text>
    </EmailLayout>
  );
}
