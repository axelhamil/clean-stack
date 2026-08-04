import { Button, Heading, Text } from "react-email";
import type { EmailTemplates } from "../templates";
import { EmailLayout } from "./layout";

type DeleteRequestedVars = EmailTemplates["delete_requested"];
interface DeleteRequestedProps extends DeleteRequestedVars {}
export function DeleteRequested({ name, cancelUrl, expiresAt }: DeleteRequestedProps) {
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
