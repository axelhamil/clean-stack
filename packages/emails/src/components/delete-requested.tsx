import { Button, Heading, Text } from "@react-email/components";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

export function DeleteRequested({
  name,
  cancelUrl,
  expiresAt,
}: EmailTemplates["delete_requested"]) {
  return (
    <EmailLayout preview="Account deletion requested">
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
